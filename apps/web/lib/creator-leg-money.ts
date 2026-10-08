/**
 * Money on a Guapd Experience creator leg, for the CREATOR's screens.
 *
 * The one place a creator surface turns a leg into figures: the deal page, the
 * deals list, the dashboard and notification text all read through here, so
 * none of them can fall through to the marketplace fee path (calculateFee /
 * resolveDealFee), which does not apply to a leg (deals.price_paise is NULL on
 * a leg by design).
 *
 * It DISPLAYS the leg's frozen terms (experience_creator_terms, written at send
 * by creatorLegTerms and proved by ect_gross_formula / ect_net_formula). It
 * never recomputes them: what the creator was offered is what they see, even
 * if their day rate or track changes later.
 *
 * Client-safe: no database access.
 */

export interface CreatorLegContext {
  brand_name: string | null
  brand_logo_url: string | null
  title: string | null
  status: string
  deal_ref: string | null
  shoot_date: string | null
  shoot_city: string | null
  brief: string | null
  deliverables: { type: string; count: number }[]
  videos: number
  affiliate_count: number
  ad_rights_months: number | null
  ad_rights_videos: number | null
  boost_months: number | null
  boost_videos: number | null
  day_rate_paise: number | null
  days: number | null
  gross_paise: number | null
  platform_pct: number | null
  platform_track: 'growth' | 'deals' | null
  net_paise: number | null
}

export interface CreatorLegMoney {
  dayRatePaise: number
  days: number
  grossPaise: number
  platformPct: number
  feePaise: number
  netPaise: number
  trackName: 'Growth' | 'Deals'
}

/** The frozen terms as display figures, or null if the leg has none yet. */
export function creatorLegMoney(t: Pick<CreatorLegContext, 'day_rate_paise' | 'days' | 'gross_paise' | 'platform_pct' | 'platform_track' | 'net_paise'>): CreatorLegMoney | null {
  if (t.gross_paise == null || t.net_paise == null || t.platform_pct == null || t.day_rate_paise == null || t.days == null) return null
  const gross = Number(t.gross_paise)
  const net = Number(t.net_paise)
  return {
    dayRatePaise: Number(t.day_rate_paise),
    days: Number(t.days),
    grossPaise: gross,
    platformPct: Number(t.platform_pct),
    feePaise: gross - net,
    netPaise: net,
    trackName: t.platform_track === 'growth' ? 'Growth' : 'Deals',
  }
}

/** "Kiro Beauty · Managed by Guapd" — how a leg's counterparty is named in lists. */
export function creatorLegBrandLabel(experienceBrandName: string | null | undefined): string {
  return `${experienceBrandName?.trim() || 'A brand'} · Managed by Guapd`
}
