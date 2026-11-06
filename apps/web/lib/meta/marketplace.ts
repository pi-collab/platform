import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/instagram-token'
import { fetchMarketplaceCreators, MetaNotEligibleError, MetaTokenInvalidError } from './graph'
import { PAGE_LIMIT, type MetaParams } from './marketplace-params'

/**
 * Creator Marketplace search for one brand, matched against Guapd.
 *
 * ── Retention ───────────────────────────────────────────────────────────────
 * Meta's retention terms are not yet checked, so nothing Meta returns is
 * written to the database. Results live in this process's memory for
 * CACHE_MS, keyed by brand and parameters, and the email is dropped before
 * caching: only whether one exists is kept, for a later email invite.
 */

export interface MarketplaceCreator {
  igId: string
  username: string
  biography: string | null
  country: string | null
  category: string | null
  pictureUrl: string | null
  onboarded: string | null
  followers: number | null
  hasPublicEmail: boolean
  /** Guapd match: a bookable creator with this Instagram username. */
  guapd: { creatorId: string } | null
}

const CACHE_MS = 10 * 60_000
const CACHE_MAX = 200
const cache = new Map<string, { at: number; rows: Omit<MarketplaceCreator, 'guapd'>[] }>()

const clean = (u: unknown) => (typeof u === 'string' ? u.trim().replace(/^@+/, '').toLowerCase() : '')
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/** total_followers out of whatever shape insights comes back in. */
function followersFrom(insights: any): number | null {
  const rows = Array.isArray(insights?.data) ? insights.data : Array.isArray(insights) ? insights : []
  for (const r of rows) {
    if (r?.name !== 'total_followers') continue
    const v = r?.values?.[0]?.value ?? r?.total_value?.value ?? r?.value
    if (typeof v === 'number') return v
  }
  return null
}

function shape(raw: any): Omit<MarketplaceCreator, 'guapd'> | null {
  const username = clean(raw?.username)
  if (!/^[a-z0-9._]{1,30}$/.test(username)) return null
  return {
    igId: String(raw.id ?? ''),
    username,
    biography: str(raw.biography, 300),
    country: str(raw.country, 40),
    category: str(raw.category, 60),
    pictureUrl: typeof raw.profile_picture_url === 'string' && /^https:\/\//.test(raw.profile_picture_url) ? raw.profile_picture_url : null,
    onboarded: str(raw.onboarded_status, 40),
    followers: followersFrom(raw.insights),
    hasPublicEmail: typeof raw.email === 'string' && raw.email.includes('@'),
  }
}

/** Bookable Guapd creators by Instagram username (their own handle, or the
 *  username of a connected Instagram). Creators who turned off "Show me in
 *  Guapd AI search" are returned in `hidden` instead: they are left out of
 *  Instagram results shown inside Guapd AI, the same as Guapd results. */
export async function matchGuapd(usernames: string[]): Promise<Map<string, string> & { hidden?: Set<string> }> {
  const out = new Map<string, string>() as Map<string, string> & { hidden?: Set<string> }
  out.hidden = new Set<string>()
  if (!usernames.length) return out
  const admin = createAdminClient()
  const variants = Array.from(new Set(usernames.flatMap((u) => [u, `@${u}`])))
  const [{ data: byHandle }, { data: byIg }] = await Promise.all([
    admin.from('creators').select('id, handle, search_hidden_at').eq('is_bookable', true).eq('is_guapd', false).in('handle', variants),
    admin.from('creator_instagram_connections').select('creator_id, username').in('username', usernames),
  ])
  for (const r of byHandle ?? []) (r.search_hidden_at ? out.hidden!.add(clean(r.handle)) : out.set(clean(r.handle), r.id))
  const igIds = (byIg ?? []).map((r) => r.creator_id)
  if (igIds.length) {
    const { data: ok } = await admin.from('creators').select('id, search_hidden_at').in('id', igIds).eq('is_bookable', true).eq('is_guapd', false)
    const bookable = new Set((ok ?? []).filter((r) => !r.search_hidden_at).map((r) => r.id))
    const hiddenIds = new Set((ok ?? []).filter((r) => r.search_hidden_at).map((r) => r.id))
    for (const r of byIg ?? []) {
      if (bookable.has(r.creator_id)) out.set(clean(r.username), r.creator_id)
      else if (hiddenIds.has(r.creator_id)) out.hidden!.add(clean(r.username))
    }
  }
  return out
}

export interface BrandMetaConnection { brandId: string; igUserId: string; pageToken: string }

export async function loadBrandConnection(brandId: string): Promise<BrandMetaConnection | null> {
  const { data } = await createAdminClient().from('brand_meta_connections')
    .select('ig_user_id, status, page_token_ciphertext, page_token_iv, page_token_tag, key_version')
    .eq('brand_id', brandId).maybeSingle()
  if (!data || data.status !== 'connected') return null
  return {
    brandId,
    igUserId: data.ig_user_id,
    pageToken: decryptToken({ ciphertext: data.page_token_ciphertext, iv: data.page_token_iv, tag: data.page_token_tag, keyVersion: data.key_version }),
  }
}

export async function searchMarketplace(conn: BrandMetaConnection, params: MetaParams): Promise<{ creators: MarketplaceCreator[]; cached: boolean }> {
  const key = `${conn.brandId}:${JSON.stringify(params)}`
  const hit = cache.get(key)
  let rows: Omit<MarketplaceCreator, 'guapd'>[]
  let cached = false
  if (hit && Date.now() - hit.at < CACHE_MS) {
    rows = hit.rows; cached = true
  } else {
    try {
      const raw = await fetchMarketplaceCreators(conn.igUserId, conn.pageToken, params, PAGE_LIMIT)
      rows = raw.map(shape).filter((r): r is Omit<MarketplaceCreator, 'guapd'> => r !== null)
    } catch (err) {
      if (err instanceof MetaNotEligibleError) {
        await createAdminClient().from('brand_meta_eligibility')
          .upsert({ brand_id: conn.brandId, state: 'not_eligible', checked_at: new Date().toISOString() }, { onConflict: 'brand_id' })
      }
      if (err instanceof MetaTokenInvalidError) {
        await createAdminClient().from('brand_meta_connections')
          .update({ status: 'needs_reconnect', last_error: 'token no longer accepted', updated_at: new Date().toISOString() })
          .eq('brand_id', conn.brandId)
      }
      throw err
    }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
    cache.set(key, { at: Date.now(), rows })
  }
  const matches = await matchGuapd(rows.map((r) => r.username))
  return {
    creators: rows
      .filter((r) => !matches.hidden?.has(r.username))
      .map((r) => ({ ...r, guapd: matches.has(r.username) ? { creatorId: matches.get(r.username)! } : null })),
    cached,
  }
}

/** For tests: forget cached results. */
export function clearMarketplaceCache() { cache.clear() }
