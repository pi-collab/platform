import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AgeBand, SearchCandidate, SearchPlatform } from './types'
import { AGE_BANDS } from './types'

/**
 * The creators a brand may be shown, assembled from the same sources the browse
 * grid already reads.
 *
 * ── Why the admin client, and what that obliges ─────────────────────────────
 * creator_instagram_connections denies all client access, and migration 0470
 * withholds rate_card, phone and contact_email from the authenticated roles, so
 * a brand-scoped client cannot assemble this. The service role bypasses RLS,
 * which makes two things load bearing here rather than incidental:
 *   1. `.eq('is_vetted', true)` is WRITTEN OUT. RLS was the thing enforcing it,
 *      and without it this would search the entire unvetted roster.
 *   2. Columns are listed explicitly. No phone, no contact_email, no upi_id.
 * Only the fields below ever leave this function.
 *
 * ── Every field is honest about being absent ────────────────────────────────
 * Most of these are empty for most creators today. Null means "not on file"
 * everywhere; nothing is defaulted to zero, because a zero ranks and reads like
 * a measurement.
 */

/** Verified first, typed second: connecting Instagram does not write into
 *  social_accounts, so a connected creator's typed count is usually absent. */
function typedFollowers(social: unknown): { count: number | null; platforms: SearchPlatform[] } {
  const rows = Array.isArray(social) ? social : []
  let count: number | null = null
  const platforms = new Set<SearchPlatform>()
  for (const r of rows) {
    const row = r as { platform?: string; follower_count?: number | null }
    const p = (row.platform ?? '').toLowerCase()
    if (p === 'instagram' || p === 'youtube') platforms.add(p)
    if (typeof row.follower_count === 'number' && row.follower_count > 0) {
      count = Math.max(count ?? 0, row.follower_count)
    }
  }
  return { count, platforms: Array.from(platforms) }
}

/** Instagram's own band labels, mapped onto ours. Anything unrecognised is
 *  dropped rather than coerced: a wrong band is worse than no band. */
function topAgeBand(breakdown: unknown): AgeBand | null {
  const rows = Array.isArray(breakdown) ? breakdown as { label?: string; pct?: number }[] : []
  let best: { label: string; pct: number } | null = null
  for (const r of rows) {
    if (typeof r.label !== 'string' || typeof r.pct !== 'number') continue
    if (!best || r.pct > best.pct) best = { label: r.label, pct: r.pct }
  }
  if (!best) return null
  // Instagram writes an en dash; our bands use a hyphen.
  const normalised = best.label.replace(/[–—]/g, '-').trim()
  return (AGE_BANDS as readonly string[]).includes(normalised) ? normalised as AgeBand : null
}

export async function loadCandidates(): Promise<SearchCandidate[]> {
  const admin = createAdminClient()

  const [{ data: creators }, { data: storefronts }, { data: products }, { data: connections }, { data: deals }] =
    await Promise.all([
      admin
        .from('creators')
        .select('id, full_name, handle, profile_photo_url, bio, niche, niches, location, follower_band, primary_platform, social_accounts, worked_with')
        .eq('is_vetted', true),
      admin
        .from('creator_storefronts')
        .select('creator_id, slug, categories, bio')
        .eq('is_published', true),
      admin
        .from('creator_products')
        .select('creator_id, price_paise, price_mode, display_price, is_active'),
      admin
        .from('creator_instagram_connections')
        .select('creator_id, snapshot')
        .eq('status', 'connected'),
      admin
        .from('deals')
        .select('creator_id')
        .eq('status', 'complete'),
    ])

  const slug: Record<string, string> = {}
  const categories: Record<string, string[]> = {}
  const storefrontBio: Record<string, string> = {}
  for (const s of storefronts ?? []) {
    slug[s.creator_id] = s.slug
    const cats = Array.isArray(s.categories) ? (s.categories as unknown[]).filter((c): c is string => typeof c === 'string') : []
    if (cats.length) categories[s.creator_id] = cats
    if (typeof s.bio === 'string' && s.bio.trim()) storefrontBio[s.creator_id] = s.bio.trim()
  }

  /* Starting rate from the packages a creator actually publishes, matching the
     browse grid: on_request lines are skipped rather than counted as zero,
     because a rate of zero is a quote nobody gave. */
  const startingRate: Record<string, number> = {}
  for (const p of products ?? []) {
    if (!p.is_active || !p.display_price) continue
    if (p.price_mode === 'on_request') continue
    const paise = typeof p.price_paise === 'number' ? p.price_paise : 0
    if (paise <= 0) continue
    const cur = startingRate[p.creator_id]
    if (cur === undefined || paise < cur) startingRate[p.creator_id] = paise
  }

  const verified: Record<string, { followers: number | null; audience: SearchCandidate['audience'] }> = {}
  for (const c of connections ?? []) {
    const snap = (c.snapshot ?? null) as {
      followersCount?: number
      ageBreakdown?: unknown
      gender?: { womenPct?: number }
      topLocations?: { city?: string }[]
    } | null
    if (!snap) continue
    const cities = Array.isArray(snap.topLocations)
      ? snap.topLocations.map(l => l?.city).filter((c2): c2 is string => typeof c2 === 'string').slice(0, 3)
      : []
    const band = topAgeBand(snap.ageBreakdown)
    const womenPct = typeof snap.gender?.womenPct === 'number' ? snap.gender.womenPct : null
    // An audience object only exists when Instagram actually returned some
    // demographics. Below 100 followers it returns none, which is not zero.
    const hasAudience = band !== null || womenPct !== null || cities.length > 0
    verified[c.creator_id] = {
      followers: typeof snap.followersCount === 'number' ? snap.followersCount : null,
      audience: hasAudience ? { topAgeBand: band, womenPct, topCities: cities } : null,
    }
  }

  const completed: Record<string, number> = {}
  for (const d of deals ?? []) {
    if (d.creator_id) completed[d.creator_id] = (completed[d.creator_id] ?? 0) + 1
  }

  return (creators ?? []).map((c): SearchCandidate => {
    const typed = typedFollowers(c.social_accounts)
    const v = verified[c.id]
    const profileNiches = [
      ...(Array.isArray(c.niches) ? (c.niches as unknown[]).filter((n): n is string => typeof n === 'string') : []),
      ...(typeof c.niche === 'string' && c.niche.trim() ? [c.niche.trim()] : []),
    ]
    const platforms = typed.platforms.length > 0
      ? typed.platforms
      : (c.primary_platform === 'instagram' || c.primary_platform === 'youtube' ? [c.primary_platform] : [])

    return {
      id: c.id,
      fullName: c.full_name ?? 'Unnamed creator',
      handle: c.handle ?? null,
      photoUrl: c.profile_photo_url ?? null,
      slug: slug[c.id] ?? null,
      followers: v?.followers ?? typed.count,
      followersVerified: typeof v?.followers === 'number',
      followerBand: c.follower_band ?? null,
      platforms,
      // Storefront categories first: that is the field a creator fills in, and
      // creators.niches is populated for nobody on production.
      categories: categories[c.id] ?? profileNiches,
      location: (typeof c.location === 'string' && c.location.trim()) ? c.location.trim() : null,
      bio: storefrontBio[c.id] ?? ((typeof c.bio === 'string' && c.bio.trim()) ? c.bio.trim() : null),
      startingRatePaise: startingRate[c.id] ?? null,
      audience: v?.audience ?? null,
      pastBrands: Array.isArray(c.worked_with) ? (c.worked_with as unknown[]).filter((b): b is string => typeof b === 'string') : [],
      completedDeals: completed[c.id] ?? 0,
    }
  })
}
