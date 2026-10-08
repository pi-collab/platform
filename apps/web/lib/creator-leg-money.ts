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
  /** 0538: the shoot and deliverables. Absent before 0538 is applied. */
  shoot_outcome?: 'done' | 'did_not_shoot' | null
  /** Who provides the deliverables on this shoot: Guapd, or the creator. */
  deliverables_owner?: 'guapd' | 'creator'
  /** The creator's part is done: Guapd can pay them (0540 payouts). */
  work_complete?: boolean
  /** Creator-submit shoots: the creator can submit now. */
  can_submit?: boolean
  items?: CreatorLegItem[]
  /** 0540: the live payout to them for this deal, as their statement. Null until Guapd requests it. */
  payout?: CreatorLegPayout | null
}

/** gross → platform fee → net → TDS → paid. Reference only once paid; never the proof or who approved it. */
export interface CreatorLegPayout {
  status: 'requested' | 'approved' | 'processing' | 'paid'
  gross_paise: number
  platform_pct: number
  platform_fee_paise: number
  net_paise: number
  tds_paise: number
  paid_paise: number
  paid_on: string | null
  reference: string | null
}

/** One of the creator's own deliverables. Link, file and note only on creator-submit shoots. */
export interface CreatorLegItem {
  id: string
  label: string
  affiliate_link: boolean
  item_status: 'pending' | 'submitted' | 'revision' | 'approved'
  version: number
  external_url: string | null
  file_name: string | null
  revision_note: string | null
  submitted_at: string | null
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
