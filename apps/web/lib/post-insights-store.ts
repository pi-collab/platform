import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { resolvePostedUrl, appendInsightPoint, readInsightHistory } from '@/lib/deal-post-insights'
import { storePostThumbnail } from '@/lib/deal-post-thumbnails'

/**
 * Resolve a delivered post to verified numbers, and store the outcome.
 *
 * Called after the item is marked posted, and again by the "re-check" action
 * when a creator connects Instagram later or fixes a wrong link.
 *
 * Writes a status on EVERY path. "No numbers" has four meanings here and the
 * brand screen says which; collapsing them to null would leave that screen with
 * nothing true to show.
 */
export async function storePostInsights(itemId: string, postedUrl: string): Promise<void> {
  const admin = createAdminClient()

  // The creator who owns the deal this item belongs to. Insights only exist for
  // their own media, so this is also what decides whose token to use.
  const { data: item } = await admin
    .from('deal_deliverable_items')
    .select('id, deal_id, deals(creator_id)')
    .eq('id', itemId)
    .maybeSingle()

  const creatorId = (item as { deals?: { creator_id?: string } } | null)?.deals?.creator_id
  if (!creatorId) return

  const result = await resolvePostedUrl(creatorId, postedUrl)

  // The first reading is the post's baseline, so it goes on the history too.
  // Without it the chart would start at the first refresh and lose the shape of
  // the first day, which is when a reel moves most.
  let history: unknown
  if (result.insights) {
    const { data: current } = await admin
      .from('deal_deliverable_items')
      .select('ig_insight_history')
      .eq('id', itemId)
      .maybeSingle()
    history = appendInsightPoint(
      readInsightHistory((current as { ig_insight_history?: unknown } | null)?.ig_insight_history),
      result.insights,
    )
  }

  const patch: Record<string, unknown> = {
    ig_match_status: result.status,
    ig_media_id: result.mediaId ?? null,
    ig_insights: result.insights ?? null,
    ...(history ? { ig_insight_history: history } : {}),
    ig_last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  // Copied into our bucket, never linked. Instagram's thumbnail URL is signed
  // and expires, so a stored link would give the brand a broken image days
  // after the deal completed.
  if (result.status === 'resolved' && result.thumbnailSourceUrl && result.mediaId) {
    const stored = await storePostThumbnail(creatorId, result.mediaId, result.thumbnailSourceUrl)
    if (stored) patch.ig_thumbnail_url = stored
  }

  await admin.from('deal_deliverable_items').update(patch).eq('id', itemId)
}

/**
 * 0576: an Experience collab post's link lives on the creator leg's item
 * (stamped by experience_collab_set_post), so its numbers resolve exactly like
 * a deal item's: against the leg creator's own Instagram account. A link that
 * is not that creator's own post resolves to not_found, never to someone
 * else's numbers.
 */
export async function storeCollabPostInsights(postId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: post } = await admin
    .from('experience_collab_posts')
    .select('item_id, kind, post_url')
    .eq('id', postId)
    .maybeSingle()
  const p = post as { item_id?: string; kind?: string; post_url?: string | null } | null
  if (!p?.item_id || p.kind !== 'collab' || !p.post_url) return
  const { data: item } = await admin
    .from('deal_deliverable_items')
    .select('posted_url')
    .eq('id', p.item_id)
    .maybeSingle()
  const posted = (item as { posted_url?: string | null } | null)?.posted_url
  if (!posted || posted !== p.post_url) return
  await storePostInsights(p.item_id, posted)
}

/**
 * Posted links still waiting for their first lookup, newest first: a collab
 * post backfilled by 0576, or a save whose lookup failed. Resolving one moves
 * it to resolved / not_found / not_connected / unsupported, so each is tried
 * once a night until it settles. Same 30-day window as the refresh.
 */
export async function resolvePendingPosts(limit = 50, deadline = Infinity): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('deal_deliverable_items')
    .select('id, posted_url')
    .eq('ig_match_status', 'pending')
    .not('posted_url', 'is', null)
    .gte('posted_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
    .order('posted_at', { ascending: false })
    .limit(limit)
  let n = 0
  for (const row of (data ?? []) as { id: string; posted_url: string | null }[]) {
    if (Date.now() > deadline) break
    if (!row.posted_url) continue
    try { await storePostInsights(row.id, row.posted_url); n++ } catch { /* next night */ }
  }
  return n
}
