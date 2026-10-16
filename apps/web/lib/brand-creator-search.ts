import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { compactNumber } from '@/lib/compact-number'

/**
 * The creator pool a brand adds to its own Experience roster from (0557): the
 * same bookable, non-house creators /browse lists to every brand, in the
 * Growth pool's card. Service role with the filters written out (as /browse and
 * the Growth pool). NO price of any kind: an Experience creator is paid a shoot
 * day rate, which never reaches a brand, so no creator_products row is read.
 *
 * 0570: read only through brand_experience_pool_page, with the brand's own
 * session (no service role); the database checks the brand gate.
 */
export interface BrandPoolCreator {
  id: string; name: string; handle: string; photo: string | null; niches: string[]; location: string | null
  platforms: string[]; followers: number | null; followersLabel: string | null; verified: boolean
  avgReachLabel: string | null; engagementLabel: string | null; interactionsLabel: string | null
  /** On this roster (shared with the brand): accepted / pending / on hold / rejected / locked; null = not on it. */
  rosterState: 'added' | 'accepted' | 'on_hold' | 'locked' | 'rejected' | null
}

/**
 * 0570: the same pool, searched (name or @handle) and filtered in the database,
 * one page at a time, with the brand's own session (brand_experience_pool_page
 * checks membership of THIS Experience's brand). Still no price of any kind.
 */
export interface BrandPoolFilters { q: string | null; niche: string | null; location: string | null; platform: string | null; band: 'u50' | '50-150' | '150+' | null }
export interface BrandPoolPage { total: number; creators: BrandPoolCreator[]; niches: string[]; locations: string[]; accepted: number; toReview: number }

export async function listBrandPoolPage(experienceId: string, f: BrandPoolFilters, limit: number, offset: number): Promise<BrandPoolPage | null> {
  const { data, error } = await createClient().rpc('brand_experience_pool_page', {
    p_experience_id: experienceId, p_q: f.q, p_niche: f.niche, p_location: f.location, p_platform: f.platform, p_band: f.band,
    p_limit: limit, p_offset: offset,
  })
  if (error || !data) return null
  const d = data as { total: number; rows: Record<string, unknown>[]; niches: string[]; locations: string[]; roster: { accepted: number; to_review: number } }
  const n = (v: unknown) => (v == null ? null : Number(v))
  return {
    total: Number(d.total ?? 0), niches: d.niches ?? [], locations: d.locations ?? [],
    accepted: Number(d.roster?.accepted ?? 0), toReview: Number(d.roster?.to_review ?? 0),
    creators: (d.rows ?? []).map((r) => {
      const social = Array.isArray(r.social_accounts) ? (r.social_accounts as { platform?: string }[]) : []
      const followers = n(r.followers), igF = n(r.ig_followers), reach = n(r.ig_reach_30), inter = n(r.ig_interactions_30)
      const engagement = inter != null && igF ? Math.round((inter / igF) * 1000) / 10 : null
      const handle = (r.handle as string | null) ?? ''
      return {
        id: r.id as string,
        name: (r.full_name as string) ?? 'Creator',
        handle: handle ? (handle.startsWith('@') ? handle : `@${handle}`) : '',
        photo: (r.profile_photo_url as string | null) ?? null,
        niches: (r.niches as string[] | null) ?? [],
        location: (r.place as string | null) ?? null,
        platforms: Array.from(new Set(social.map((x) => String(x.platform ?? '').toLowerCase()).filter(Boolean))),
        followers,
        followersLabel: followers != null ? compactNumber(followers) : null,
        verified: r.verified === true,
        avgReachLabel: reach != null ? compactNumber(reach) : null,
        engagementLabel: engagement != null ? `${engagement}%` : null,
        interactionsLabel: inter != null ? compactNumber(inter) : null,
        rosterState: (r.roster_state as BrandPoolCreator['rosterState']) ?? null,
      }
    }),
  }
}
