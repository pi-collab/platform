import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BriefFilters } from './creator-search-types'
import type { PoolCreator } from './rank-creators'

/**
 * The creators Guapd AI search may rank, from creator_search_pool (0585).
 *
 * One fixed RPC whose only inputs are typed numbers taken from VALIDATED
 * filters, so nothing from a brief reaches SQL as text. The function itself
 * writes out the hard gates (opted in, bookable, not rejected, not the Guapd
 * house account) and returns only fields a brand may see before a deal.
 * Executable by service_role only.
 */

type Row = {
  creator_id: string
  full_name: string | null
  handle: string | null
  photo_url: string | null
  has_storefront: boolean
  bio: string | null
  niches: string[] | null
  city: string | null
  state: string | null
  typed_followers: number | null
  follower_band: string | null
  verified: boolean
  verified_followers: number | null
  ig_media: { likes: unknown; comments: unknown }[] | null
  ig_synced_at: string | null
  starting_rate_paise: number | null
  completed_deals: number
  on_time_measured: number
  on_time: number
  offers_received: number
  offers_responded: number
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Pass null filters to load the whole opted-in pool (used to suggest which
 *  filter to loosen). */
export async function loadCreatorPool(filters: BriefFilters | null): Promise<PoolCreator[]> {
  const { data, error } = await createAdminClient().rpc('creator_search_pool', {
    p_followers_min: filters?.followersMin ?? null,
    p_followers_max: filters?.followersMax ?? null,
    p_budget_max_paise: filters?.budgetMaxRupees == null ? null : filters.budgetMaxRupees * 100,
  })
  if (error) throw new Error(`creator_search_pool failed: ${error.message}`)

  return ((data ?? []) as Row[]).map((r): PoolCreator => ({
    id: r.creator_id,
    fullName: r.full_name?.trim() || 'Unnamed creator',
    handle: r.handle,
    photoUrl: r.photo_url,
    hasStorefront: r.has_storefront,
    bio: r.bio,
    niches: r.niches ?? [],
    city: r.city,
    state: r.state,
    typedFollowers: r.typed_followers,
    followerBand: r.follower_band,
    verified: r.verified,
    verifiedFollowers: r.verified_followers,
    igMedia: (r.ig_media ?? []).map((m) => ({ likes: num(m?.likes), comments: num(m?.comments) })),
    igSyncedAt: r.ig_synced_at,
    startingRatePaise: r.starting_rate_paise === null ? null : Number(r.starting_rate_paise),
    completedDeals: r.completed_deals,
    onTimeMeasured: r.on_time_measured,
    onTime: r.on_time,
    offersReceived: r.offers_received,
    offersResponded: r.offers_responded,
  }))
}
