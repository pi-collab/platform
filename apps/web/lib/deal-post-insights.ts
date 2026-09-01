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

/**
 * Posts whose numbers are worth reading again.
 *
 * ── Why a decaying cadence ──────────────────────────────────────────────────
 * A reel's reach climbs for days after posting and then stops moving. Reading
 * every post nightly forever would spend a call per post per creator per night
 * to re-fetch numbers that stopped changing weeks ago; reading once at post time
 * would understate every campaign, because the numbers a brand sees would be
 * whatever the post managed in its first few minutes.
 *
 *   first 14 days   daily
 *   to 30 days      weekly
 *   after 30 days   stopped
 *
 * Instagram retains insights for 90 days, so stopping at 30 is our choice, not
 * a limit: growth has flattened well before then and the last read stays on the
 * record.
 */
export interface RefreshCandidate {
  id: string
  creator_id: string
  ig_media_id: string
}

export async function postsDueForRefresh(limit = 200): Promise<RefreshCandidate[]> {
  const admin = createAdminClient()
  const now = Date.now()

  const { data } = await admin
    .from('deal_deliverable_items')
    .select('id, ig_media_id, ig_last_synced_at, posted_at, deals(creator_id)')
    .eq('ig_match_status', 'resolved')
    .not('ig_media_id', 'is', null)
    .gte('posted_at', new Date(now - 30 * 86_400_000).toISOString())
    .order('ig_last_synced_at', { ascending: true, nullsFirst: true })
    .limit(limit)

  const out: RefreshCandidate[] = []

  for (const row of (data ?? []) as unknown as {
    id: string
    ig_media_id: string
    ig_last_synced_at: string | null
    posted_at: string | null
    deals?: { creator_id?: string }
  }[]) {
    const creatorId = row.deals?.creator_id
    if (!creatorId || !row.posted_at) continue

    const ageDays = (now - new Date(row.posted_at).getTime()) / 86_400_000
    const sinceSync = row.ig_last_synced_at
      ? (now - new Date(row.ig_last_synced_at).getTime()) / 86_400_000
      : Infinity

    const due = ageDays <= 14 ? sinceSync >= 1 : sinceSync >= 7
    if (due) out.push({ id: row.id, creator_id: creatorId, ig_media_id: row.ig_media_id })
  }

  return out
}

/** Re-read one post and store it. Keeps the LAST GOOD numbers on any failure:
 *  a transient outage must not blank a brand's campaign screen. */
export async function refreshOnePost(candidate: RefreshCandidate): Promise<boolean> {
  const insights = await refreshPostInsights(candidate.creator_id, candidate.ig_media_id)
  if (!insights) return false

  const admin = createAdminClient()

  // Read-then-append. The history is what makes a chart possible: overwriting
  // ig_insights alone says what a post has done and can never say how it got
  // there.
  const { data: current } = await admin
    .from('deal_deliverable_items')
    .select('ig_insight_history')
    .eq('id', candidate.id)
    .maybeSingle()

  const history = appendInsightPoint(
    readInsightHistory((current as { ig_insight_history?: unknown } | null)?.ig_insight_history),
    insights,
  )

  const { error } = await admin
    .from('deal_deliverable_items')
    .update({ ig_insights: insights, ig_insight_history: history, ig_last_synced_at: new Date().toISOString() })
    .eq('id', candidate.id)

  return !error
}

/* ── History ───────────────────────────────────────────────────────────────── */

/** About eighteen readings arrive over the refresh window. The cap is headroom,
 *  not a target: it stops a stuck job growing the row without bound. */
const MAX_HISTORY = 60

export interface InsightPoint extends PostInsights {
  at: string
}

/**
 * Append a reading, or replace the last one taken the same day.
 *
 * Same-day replacement keeps the series one point per day during the daily
 * phase. Without it, a creator pressing re-check three times would put three
 * points on today and flatten the chart's shape around a single day.
 */
export function appendInsightPoint(
  history: InsightPoint[] | null | undefined,
  insights: PostInsights,
  at: Date = new Date(),
): InsightPoint[] {
  const point: InsightPoint = { ...insights, at: at.toISOString() }
  const existing = Array.isArray(history) ? [...history] : []

  const sameDay = (a: string, b: string) => a.slice(0, 10) === b.slice(0, 10)
  const last = existing[existing.length - 1]

  if (last && sameDay(last.at, point.at)) existing[existing.length - 1] = point
  else existing.push(point)

  // Oldest first, and the oldest go first when trimming: the recent shape is
  // what a brand reads, and the first reading is already the post's baseline.
  return existing.slice(-MAX_HISTORY)
}

/** Read the stored history defensively. It is creator-adjacent JSON that has
 *  been through a migration default, so it is not assumed to be well formed. */
export function readInsightHistory(raw: unknown): InsightPoint[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p): p is InsightPoint => !!p && typeof p === 'object' && typeof (p as InsightPoint).at === 'string')
    .sort((a, b) => a.at.localeCompare(b.at))
}
