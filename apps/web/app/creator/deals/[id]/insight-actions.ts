'use server'

import { revalidatePath } from 'next/cache'
import { verifyCreator } from '@/lib/creator-auth'
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
export async function resolveAndStorePostInsights(itemId: string, postedUrl: string): Promise<void> {
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
 * Try again, on demand.
 *
 * The common reasons a first attempt fails are recoverable: the creator had not
 * connected Instagram yet, or pasted the wrong link. Without this they would
 * have to un-post and re-post a deliverable to get another attempt.
 */
export async function recheckPostInsights(
  dealId: string,
  itemId: string,
): Promise<{ ok: boolean; status?: string; message?: string }> {
  const ctx = await verifyCreator()
  const admin = createAdminClient()

  // Scoped to this creator's own deal. A server action is its own entry point,
  // so the item id alone is not authority to touch it.
  const { data: item } = await admin
    .from('deal_deliverable_items')
    .select('id, posted_url, deal_id, deals(creator_id)')
    .eq('id', itemId)
    .eq('deal_id', dealId)
    .maybeSingle()

  const row = item as { posted_url?: string | null; deals?: { creator_id?: string } } | null
  if (!row || row.deals?.creator_id !== ctx.creatorId) {
    return { ok: false, message: 'Not found.' }
  }
  if (!row.posted_url) return { ok: false, message: 'Nothing has been posted for this item yet.' }

  await resolveAndStorePostInsights(itemId, row.posted_url)

  const { data: after } = await admin
    .from('deal_deliverable_items')
    .select('ig_match_status')
    .eq('id', itemId)
    .maybeSingle()

  const status = (after as { ig_match_status?: string } | null)?.ig_match_status

  revalidatePath(`/creator/deals/${dealId}`)
  revalidatePath(`/deals/${dealId}`)
  revalidatePath(`/deals/${dealId}/analytics`)

  return { ok: status === 'resolved', status, message: EXPLAIN[status ?? ''] ?? undefined }
}

/** Said to the CREATOR, who is the only one who can fix any of these. */
const EXPLAIN: Record<string, string> = {
  resolved: 'Found it. The performance numbers are on the deal now.',
  not_found:
    'We could not find that post on your connected Instagram account. Check the link is right, and that it was posted from the account you connected.',
  not_connected:
    'Connect Instagram in Settings and try again, and the brand will see verified numbers for this post.',
  unsupported:
    'Verified numbers are only available for Instagram posts and reels. The link is still shown to the brand.',
}
