import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/instagram-token'
import { findMediaByPermalink, instagramShortcode } from '@/lib/instagram-permalink'

/**
 * Resolving a delivered post to verified performance.
 *
 * A creator marks a deliverable posted and gives us the permalink. If they have
 * connected Instagram, that post is on their own account, which is the only kind
 * of media Instagram will serve insights for.
 *
 * ── Resolution is LIVE, not from the snapshot ───────────────────────────────
 * A creator marks something posted minutes after publishing it. The stored
 * snapshot is up to a day old and will not contain that post, so resolving from
 * it would report not_found for the ordinary case and be wrong until the next
 * sync. This calls /me/media at resolve time.
 *
 * ── Never a fabricated number ───────────────────────────────────────────────
 * Every outcome that is not a match is recorded as its own status with no
 * insights attached. A post with no numbers renders as a thumbnail and a link.
 */

const GRAPH = 'https://graph.instagram.com/v25.0'
const MEDIA_FIELDS = 'id,media_product_type,permalink,thumbnail_url,caption,timestamp,like_count,comments_count'
/** Pages of 25. Enough to reach a post from several weeks back without turning
 *  one mark-posted into an unbounded crawl. */
const MAX_PAGES = 4

export type MatchStatus = 'pending' | 'resolved' | 'not_found' | 'not_connected' | 'unsupported'

export interface PostInsights {
  reach?: number
  likes?: number
  comments?: number
  saved?: number
  shares?: number
  totalInteractions?: number
  views?: number
}

export interface ResolveResult {
  status: MatchStatus
  mediaId?: string
  thumbnailSourceUrl?: string
  insights?: PostInsights
}

/**
 * Match a posted URL to the creator's own media and read its insights.
 *
 * Returns a status for every path. The caller writes it verbatim: this function
 * decides what is true, the caller decides what to store.
 */
export async function resolvePostedUrl(creatorId: string, postedUrl: string): Promise<ResolveResult> {
  // Not an Instagram permalink we can resolve — a YouTube link, a story, a
  // profile URL. Not a failure, just not something insights exist for.
  if (!instagramShortcode(postedUrl)) return { status: 'unsupported' }

  const token = await creatorToken(creatorId)
  if (!token) return { status: 'not_connected' }

  const media = await fetchOwnMedia(token)
  const match = findMediaByPermalink(media, postedUrl)

  // Wrong account, deleted, or a typo. We cannot tell which, and guessing would
  // put a brand's performance numbers on the wrong post.
  if (!match) return { status: 'not_found' }

  return {
    status: 'resolved',
    mediaId: match.id,
    thumbnailSourceUrl: match.thumbnail_url ?? undefined,
    insights: await fetchPostInsights(token, match.id, {
      likes: match.like_count,
      comments: match.comments_count,
    }),
  }
}

/** Re-read insights for an already-resolved post. Used by the refresh job,
 *  which must not re-match a URL it has already matched. */
export async function refreshPostInsights(creatorId: string, mediaId: string): Promise<PostInsights | null> {
  const token = await creatorToken(creatorId)
  if (!token) return null
  return fetchPostInsights(token, mediaId)
}

/* ── Internals ─────────────────────────────────────────────────────────────── */

async function creatorToken(creatorId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from('creator_instagram_connections')
    .select('status, token_ciphertext, token_iv, token_tag, key_version')
    .eq('creator_id', creatorId)
    .maybeSingle()

  // Only a healthy connection. An expired or personal-account row cannot serve
  // insights, and treating it as connected would report not_found for a post
  // that exists.
  if (!data || data.status !== 'connected') return null

  try {
    return decryptToken({
      ciphertext: data.token_ciphertext,
      iv: data.token_iv,
      tag: data.token_tag,
      keyVersion: data.key_version,
    })
  } catch {
    return null
  }
}

interface OwnMedia {
  id: string
  permalink?: string | null
  thumbnail_url?: string | null
  like_count?: number
  comments_count?: number
}

/** The creator's recent media, following pagination up to MAX_PAGES. */
async function fetchOwnMedia(token: string): Promise<OwnMedia[]> {
  const out: OwnMedia[] = []
  let url: string | null =
    `${GRAPH}/me/media?fields=${MEDIA_FIELDS}&limit=25&access_token=${encodeURIComponent(token)}`

  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res: Response = await fetch(url)
    if (!res.ok) break
    const json = await res.json()
    out.push(...((json?.data ?? []) as OwnMedia[]))
    url = (json?.paging?.next as string | undefined) ?? null
  }

  return out
}

/**
 * Per-post insights.
 *
 * The five metrics are requested together because all five are confirmed for
 * reels; an unsupported metric in a batch fails the whole call. Likes and
 * comments come from the media list rather than from here, so they survive when
 * insights are refused outright — which happens for anything posted before the
 * account's last conversion to professional.
 */
async function fetchPostInsights(
  token: string,
  mediaId: string,
  fromMediaList: { likes?: number; comments?: number } = {},
): Promise<PostInsights> {
  const base: PostInsights = {
    likes: fromMediaList.likes,
    comments: fromMediaList.comments,
  }

  const p = new URLSearchParams({
    metric: 'views,reach,saved,shares,total_interactions',
    access_token: token,
  })

  try {
    const res = await fetch(`${GRAPH}/${mediaId}/insights?${p}`)
    if (!res.ok) return base

    const json = await res.json()
    const v = Object.fromEntries(
      ((json?.data ?? []) as { name: string; total_value?: { value?: number }; values?: { value?: number }[] }[])
        .map((d) => [d.name, d.total_value?.value ?? d.values?.[0]?.value]),
    ) as Record<string, number | undefined>

    return {
      ...base,
      views: v.views,
      reach: v.reach,
      saved: v.saved,
      shares: v.shares,
      totalInteractions: v.total_interactions,
    }
  } catch {
    // A network failure must not lose the counts we already have.
    return base
  }
}
