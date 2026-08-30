import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The Instagram API, on the Instagram Login path.
 *
 * graph.instagram.com, direct OAuth, no Facebook Page. Every call here is made
 * with a token a creator granted us for THEIR OWN account; there is no path in
 * this file that reads anyone else's data.
 *
 * Verified against a live account (palak_pj, MEDIA_CREATOR, 526 followers)
 * before this was written. What that spike established is recorded inline
 * wherever it changed a decision.
 */

const GRAPH = 'https://graph.instagram.com/v25.0'
const OAUTH_TOKEN = 'https://api.instagram.com/oauth/access_token'

export const IG_SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights'] as const

/** Professional account types. PERSONAL cannot share insights and is handled as
 *  its own connection status rather than as an error. */
export type IgAccountType = 'BUSINESS' | 'MEDIA_CREATOR' | 'PERSONAL'

export interface IgProfile {
  user_id: string
  username: string
  account_type: IgAccountType
  followers_count: number
  follows_count: number
  media_count: number
  name?: string
  biography?: string
  profile_picture_url?: string
}

/** What a sync stores. Deliberately NOT avg views: Instagram omits `views` at
 *  account level, and inventing it is the thing this codebase spent a week
 *  removing. */
export interface IgSnapshot {
  fetchedAt: string
  /** The professional account id, which insights are addressed by. NOT the
   *  app-scoped id that Meta's callbacks use. */
  userId: string
  username: string
  accountType: IgAccountType
  followersCount: number
  followsCount: number
  mediaCount: number
  name?: string
  biography?: string
  profilePictureUrl?: string
  ageBreakdown?: { label: string; pct: number }[]
  gender?: { womenPct: number; menPct: number; unknownPct: number }
  topLocations?: { city: string; pct: number }[]
  reachLast30?: number
  /** Likes, comments, shares and saves over the same 30 days. Best effort:
   *  absent rather than zero when Instagram does not answer. */
  interactionsLast30?: number
  /** Followers under 18, excluded from ageBreakdown. Kept so the UI can say the
   *  percentages describe adult followers rather than quietly implying all. */
  under18Excluded?: number
  /** Demographics need 100+ followers. Below that Instagram returns nothing,
   *  which is not an error and must not be shown as zero. */
  demographicsUnavailable?: boolean
}

/* ── OAuth ────────────────────────────────────────────────────────────────── */

export function authorizeUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: required('INSTAGRAM_APP_ID'),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: IG_SCOPES.join(','),
    state,
  })
  return `https://www.instagram.com/oauth/authorize?${p}`
}

export async function exchangeCodeForToken(code: string, redirectUri: string) {
  const body = new URLSearchParams({
    client_id: required('INSTAGRAM_APP_ID'),
    client_secret: required('INSTAGRAM_APP_SECRET'),
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  })
  const res = await fetch(OAUTH_TOKEN, { method: 'POST', body })
  const json = await res.json()
  if (!res.ok || !json.access_token) {
    throw new Error(`code exchange failed: ${json?.error_message ?? json?.error?.message ?? res.status}`)
  }
  return { token: json.access_token as string, userId: String(json.user_id), permissions: normalizeScopes(json.permissions) }
}

/**
 * The granted scopes, as an array, whatever shape Instagram sent.
 *
 * The token exchange returns `permissions` as an ARRAY on the Instagram Login
 * path, not the comma-separated string the older Basic Display docs show. It is
 * also absent on some grants. Treating it as a string threw
 * "permissions.split is not a function" from inside the row being written,
 * AFTER every network call had already succeeded, so the creator saw a failed
 * connection with a working token behind it.
 *
 * Normalised here at the boundary rather than at the call site, so the shape
 * Instagram happens to use never reaches the rest of the app.
 */
function normalizeScopes(value: unknown): string[] {
  const parts = Array.isArray(value)
    ? value.map((v) => String(v))
    : typeof value === 'string'
      ? value.split(',')
      : []
  return parts.map((s) => s.trim()).filter(Boolean)
}

/** Short-lived tokens last an hour. Everything downstream assumes the 60-day
 *  one, so this runs immediately after the exchange, never lazily. */
export async function exchangeForLongLivedToken(shortLived: string) {
  const p = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: required('INSTAGRAM_APP_SECRET'),
    access_token: shortLived,
  })
  const res = await fetch(`${GRAPH}/access_token?${p}`)
  const json = await res.json()
  if (!res.ok || !json.access_token) {
    throw new Error(`long-lived exchange failed: ${json?.error?.message ?? res.status}`)
  }
  return { token: json.access_token as string, expiresInSeconds: Number(json.expires_in ?? 60 * 24 * 3600) }
}

/** Extends a long-lived token by 60 days. Meta requires the token to be at
 *  least 24 hours old and still valid; an expired one cannot be refreshed and
 *  needs a fresh authorisation. */
export async function refreshLongLivedToken(token: string) {
  const p = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token })
  const res = await fetch(`${GRAPH}/refresh_access_token?${p}`)
  const json = await res.json()
  if (!res.ok || !json.access_token) {
    throw new Error(`refresh failed: ${json?.error?.message ?? res.status}`)
  }
  return { token: json.access_token as string, expiresInSeconds: Number(json.expires_in ?? 60 * 24 * 3600) }
}

/* ── Reads ────────────────────────────────────────────────────────────────── */

export async function fetchProfile(token: string): Promise<IgProfile> {
  const fields = 'user_id,username,account_type,followers_count,follows_count,media_count,name,biography,profile_picture_url'
  const res = await fetch(`${GRAPH}/me?fields=${fields}&access_token=${encodeURIComponent(token)}`)
  const json = await res.json()
  if (!res.ok) throw new Error(`profile fetch failed: ${json?.error?.message ?? res.status}`)
  return json as IgProfile
}

type Breakdown = 'age' | 'gender' | 'city'

async function demographic(token: string, breakdown: Breakdown): Promise<[string, number][]> {
  const p = new URLSearchParams({
    metric: 'follower_demographics',
    period: 'lifetime',
    metric_type: 'total_value',
    // MANDATORY for demographics. Omitting it returns a 400 that reads exactly
    // like a permissions failure, which is how an afternoon disappears.
    timeframe: 'last_30_days',
    breakdown,
    access_token: token,
  })
  const res = await fetch(`${GRAPH}/me/insights?${p}`)
  const json = await res.json()
  if (!res.ok) throw new Error(`${breakdown} demographics failed: ${json?.error?.message ?? res.status}`)
  const results = json?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? []
  return results.map((r: { dimension_values: string[]; value: number }) => [r.dimension_values[0], r.value])
}

/**
 * Instagram's age buckets, mapped onto the four the storefront shows.
 *
 * 13-17 IS DROPPED. There is no band for under-18s, and folding them into 18-24
 * would state something untrue about a real person's audience. Dropping them
 * also removes them from the denominator, so the percentages describe ADULT
 * followers — which the UI says out loud rather than leaving implied.
 */
function mapAges(rows: [string, number][]) {
  const get = (k: string) => rows.find(([b]) => b === k)?.[1] ?? 0
  const under18 = get('13-17')
  const bands = [
    { label: '18–24', n: get('18-24') },
    { label: '25–34', n: get('25-34') },
    { label: '35–44', n: get('35-44') },
    { label: '45+', n: get('45-54') + get('55-64') + get('65+') },
  ]
  const total = bands.reduce((s, b) => s + b.n, 0)
  if (total === 0) return { ageBreakdown: undefined, under18Excluded: under18 }
  return {
    ageBreakdown: bands.map(b => ({ label: b.label, pct: Math.round((b.n / total) * 100) })),
    under18Excluded: under18,
  }
}

/**
 * Gender, over F + M + U.
 *
 * Unknown is NOT excluded from the denominator. On the account this was built
 * against, U was 91 of 484 — 19%. Dividing by F+M alone would report 16% women
 * where the honest figure is 13%, and a brand reads either as fact.
 */
function mapGender(rows: [string, number][]) {
  const get = (k: string) => rows.find(([b]) => b === k)?.[1] ?? 0
  const f = get('F'), m = get('M'), u = get('U')
  const total = f + m + u
  if (total === 0) return undefined
  const pct = (n: number) => Math.round((n / total) * 100)
  return { womenPct: pct(f), menPct: pct(m), unknownPct: pct(u) }
}

/** Instagram returns "Bangalore, Karnataka" — city plus region. The storefront
 *  shows a city, so the region is trimmed. Kept simple deliberately: splitting
 *  on the first comma is right for every value the spike returned. */
function mapCities(rows: [string, number][]) {
  const total = rows.reduce((s, [, n]) => s + n, 0)
  if (total === 0) return undefined
  return rows
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, n]) => ({ city: name.split(',')[0].trim(), pct: Math.round((n / total) * 100) }))
}

/** Reach over the last 30 days. `views` is deliberately NOT requested: Instagram
 *  omits it at account level (confirmed live), and an omitted metric returns an
 *  empty set rather than an error, which is easy to misread as zero. */
async function fetchReach30(token: string): Promise<number | undefined> {
  const since = Math.floor(Date.now() / 1000) - 30 * 24 * 3600
  const p = new URLSearchParams({
    metric: 'reach', period: 'day', since: String(since),
    until: String(Math.floor(Date.now() / 1000)), access_token: token,
  })
  const res = await fetch(`${GRAPH}/me/insights?${p}`)
  if (!res.ok) return undefined
  const json = await res.json()
  const values = json?.data?.find((d: { name: string }) => d.name === 'reach')?.values ?? []
  if (!values.length) return undefined
  return values.reduce((s: number, v: { value?: number }) => s + (v.value ?? 0), 0)
}

/**
 * Interactions over the last 30 days: likes, comments, shares and saves.
 *
 * BEST EFFORT, exactly like reach. Anything unexpected returns undefined and the
 * creator's own typed figure stands, because the alternative is publishing a
 * zero on the page a brand prices from.
 *
 * Written defensively on purpose. `views` turned out to be omitted at account
 * level despite being documented, and `permissions` came back as an array where
 * the docs said string, so this reads BOTH response shapes: `total_value.value`
 * for a total_value metric, and a summed day series if Instagram answers with
 * one instead.
 */
async function fetchInteractions30(token: string): Promise<number | undefined> {
  const until = Math.floor(Date.now() / 1000)
  const since = until - 30 * 24 * 3600
  const p = new URLSearchParams({
    metric: 'total_interactions',
    metric_type: 'total_value',
    period: 'day',
    since: String(since),
    until: String(until),
    access_token: token,
  })
  const res = await fetch(`${GRAPH}/me/insights?${p}`)
  if (!res.ok) return undefined
  const json = await res.json()
  const row = json?.data?.find((d: { name: string }) => d.name === 'total_interactions')
  if (!row) return undefined

  const total = row.total_value?.value
  if (typeof total === 'number') return total

  const values = row.values ?? []
  if (!values.length) return undefined
  return values.reduce((s: number, v: { value?: number }) => s + (v.value ?? 0), 0)
}

/**
 * One sync: profile plus demographics plus reach.
 *
 * Demographics are best-effort. Under 100 followers Instagram returns nothing
 * at all, and that is not a failure — the snapshot records that they are
 * unavailable so the UI can say why instead of rendering zeros.
 */
export async function buildSnapshot(token: string): Promise<IgSnapshot> {
  const profile = await fetchProfile(token)

  const base: IgSnapshot = {
    fetchedAt: new Date().toISOString(),
    userId: profile.user_id,
    username: profile.username,
    accountType: profile.account_type,
    followersCount: profile.followers_count,
    followsCount: profile.follows_count,
    mediaCount: profile.media_count,
    name: profile.name,
    biography: profile.biography,
    profilePictureUrl: profile.profile_picture_url,
  }

  // A personal account cannot serve insights. Return what /me gave us and stop,
  // rather than making three calls that will each fail.
  if (profile.account_type === 'PERSONAL') return base

  if (profile.followers_count < 100) {
    return {
      ...base,
      demographicsUnavailable: true,
      reachLast30: await fetchReach30(token),
      interactionsLast30: await fetchInteractions30(token),
    }
  }

  const [age, gender, city, reach, interactions] = await Promise.all([
    demographic(token, 'age').catch(() => [] as [string, number][]),
    demographic(token, 'gender').catch(() => [] as [string, number][]),
    demographic(token, 'city').catch(() => [] as [string, number][]),
    fetchReach30(token),
    // Caught for the same reason the demographics are: one metric Instagram
    // declines to serve must not cost the whole snapshot.
    fetchInteractions30(token).catch(() => undefined),
  ])

  const ages = mapAges(age)
  return {
    ...base,
    ageBreakdown: ages.ageBreakdown,
    under18Excluded: ages.under18Excluded,
    gender: mapGender(gender),
    topLocations: mapCities(city),
    reachLast30: reach,
    interactionsLast30: interactions,
  }
}

/* ── Meta callbacks ───────────────────────────────────────────────────────── */

/**
 * Verify and decode a `signed_request`.
 *
 * Meta POSTs this to the deauthorize and data-deletion callbacks as
 * `signature.payload`, both base64url. The signature is HMAC-SHA256 of the
 * RAW payload string using the app secret.
 *
 * VERIFIED, not merely decoded. These endpoints delete a creator's connection,
 * and they are public URLs: anyone can POST to them. Without checking the
 * signature, a forged body would let a stranger disconnect any creator whose
 * app-scoped id they could guess.
 *
 * Compared with timingSafeEqual because a byte-by-byte early exit on a
 * signature check is the textbook timing oracle.
 */
export function parseSignedRequest(signed: string): { userId: string; issuedAt: number } | null {
  const [sigPart, payloadPart] = signed.split('.', 2)
  if (!sigPart || !payloadPart) return null

  const b64url = (v: string) => Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const expected = createHmac('sha256', required('INSTAGRAM_APP_SECRET')).update(payloadPart).digest()
  const given = b64url(sigPart)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  try {
    const payload = JSON.parse(b64url(payloadPart).toString('utf8'))
    if (payload?.algorithm && String(payload.algorithm).toUpperCase() !== 'HMAC-SHA256') return null
    if (!payload?.user_id) return null
    return { userId: String(payload.user_id), issuedAt: Number(payload.issued_at ?? 0) }
  } catch {
    return null
  }
}

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not configured`)
  return v
}
