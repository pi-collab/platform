import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * Reads for the Guapd Experiences STAFF console. Each goes through a database
 * function called with the signed-in user's own session, and the function
 * checks their staff_access in Postgres. A brand, creator, outreach user or the
 * service role is refused by the database, whatever the page did.
 */
export interface ConsoleExperienceRow {
  id: string
  title: string
  status: string
  brand_name: string
  shoot_date: string | null
  shoot_city: string | null
  request_location: string | null
  request_date_from: string | null
  request_date_to: string | null
  requested_videos: number
  created_at: string
}

export async function listConsoleExperiences(): Promise<{ ok: true; rows: ConsoleExperienceRow[] } | { ok: false; error: string }> {
  const { data, error } = await createClient().rpc('experience_console_list')
  if (error) return { ok: false, error: error.message }
  return { ok: true, rows: (data ?? []) as ConsoleExperienceRow[] }
}

// ── Stage 2: one Experience, its quotes, the brand picker ──────────────────

export interface ConsoleDeliverable { type: string; count: number }

export interface ConsoleExperience {
  id: string
  title: string
  status: string
  brand_id: string
  brand_name: string
  /** The plan is PER CREATOR: request_creator_count creators, each doing request_deliverables. */
  request_creator_count: number | null
  request_deliverables: ConsoleDeliverable[]
  plan_totals: { type: string; per_creator: number; total: number }[]
  plan_videos_per_creator: number
  plan_videos_total: number
  request_affiliate: boolean
  request_affiliate_per_creator: number | null
  request_ad_rights: boolean
  /** null = all of each creator's videos */
  request_ad_rights_per_creator: number | null
  request_ad_rights_months: number | null
  request_boost: boolean
  request_boost_per_creator: number | null
  request_boost_months: number | null
  request_location: string | null
  request_date_from: string | null
  request_date_to: string | null
  request_brief: string | null
  request_channel: string | null
  requested_at: string | null
  /** The agreed brand price, set when a quote is accepted. Brand-side money,
      never a creator rate, cost or margin. */
  brand_per_video_paise: number | null
  brand_deliverable_count: number | null
  brand_misc_paise: number | null
  brand_service_total_paise: number
  shoot_date: string | null
  shoot_city: string | null
  /** Locked on accept: the plan, its totals and the videos actually sold. The contract Stage 3 reconciles to. */
  agreed_plan: {
    creator_count: number | null
    per_creator: ConsoleDeliverable[]
    totals: { type: string; per_creator: number; total: number }[]
    plan_videos: number
    videos_sold: number
  } | null
  created_at: string
  updated_at: string
}

export interface ConsoleQuote {
  id: string
  version: number
  proposed_by: 'guapd' | 'brand'
  per_video_paise: number
  deliverable_count: number
  misc_paise: number
  total_paise: number
  deliverables: ConsoleDeliverable[]
  shoot_date: string | null
  shoot_city: string | null
  message: string | null
  status: 'open' | 'superseded' | 'accepted' | 'rejected' | 'withdrawn'
  recorded_channel: string | null
  created_at: string
  decided_at: string | null
  created_by_name: string | null
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }
const fail = (e: { message: string } | null): { ok: false; error: string } => ({ ok: false, error: e?.message ?? 'Something went wrong' })

export async function getConsoleExperience(id: string): Promise<Result<ConsoleExperience | null>> {
  const { data, error } = await createClient().rpc('experience_console_get', { p_experience_id: id })
  return error ? fail(error) : { ok: true, data: (data ?? null) as ConsoleExperience | null }
}

export async function listConsoleQuotes(id: string): Promise<Result<ConsoleQuote[]>> {
  const { data, error } = await createClient().rpc('experience_console_quotes', { p_experience_id: id })
  return error ? fail(error) : { ok: true, data: (data ?? []) as ConsoleQuote[] }
}

export async function listConsoleBrands(): Promise<Result<{ id: string; name: string; brand_status: string }[]>> {
  const { data, error } = await createClient().rpc('experience_console_brands')
  return error ? fail(error) : { ok: true, data: (data ?? []) as { id: string; name: string; brand_status: string }[] }
}

export interface CreateRequestInput {
  brandId: string
  title: string
  creatorCount: number
  /** Per creator. */
  deliverables: ConsoleDeliverable[]
  affiliate: boolean
  affiliatePerCreator: number | null
  adRights: boolean
  /** null = all of each creator's videos */
  adRightsPerCreator: number | null
  adRightsMonths: number | null
  boost: boolean
  boostPerCreator: number | null
  boostMonths: number | null
  location: string | null
  dateFrom: string | null
  dateTo: string | null
  brief: string | null
  channel: string
}

export async function createConsoleExperience(p: CreateRequestInput): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_create', {
    p_brand_id: p.brandId, p_title: p.title, p_creator_count: p.creatorCount, p_deliverables: p.deliverables,
    p_affiliate: p.affiliate, p_affiliate_per_creator: p.affiliatePerCreator,
    p_ad_rights: p.adRights, p_ad_rights_per_creator: p.adRightsPerCreator, p_ad_rights_months: p.adRightsMonths,
    p_boost: p.boost, p_boost_per_creator: p.boostPerCreator, p_boost_months: p.boostMonths, p_location: p.location,
    p_date_from: p.dateFrom, p_date_to: p.dateTo, p_brief: p.brief, p_channel: p.channel,
  })
  return error ? fail(error) : { ok: true, data: data as string }
}

export interface QuoteInput {
  experienceId: string
  proposedBy: 'guapd' | 'brand'
  perVideoPaise: number
  deliverableCount: number
  miscPaise: number
  deliverables: ConsoleDeliverable[]
  shootDate: string | null
  shootCity: string | null
  message: string | null
  channel: string | null
}

export async function addConsoleQuote(p: QuoteInput): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_quote', {
    p_experience_id: p.experienceId, p_proposed_by: p.proposedBy, p_per_video_paise: p.perVideoPaise,
    p_deliverable_count: p.deliverableCount, p_misc_paise: p.miscPaise, p_deliverables: p.deliverables,
    p_shoot_date: p.shootDate, p_shoot_city: p.shootCity, p_message: p.message, p_channel: p.channel,
  })
  return error ? fail(error) : { ok: true, data: data as string }
}

export async function acceptConsoleQuote(quoteId: string, channel: string | null): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_accept', { p_quote_id: quoteId, p_channel: channel })
  return error ? fail(error) : { ok: true, data: null }
}

// ── Stage 3a: roster ───────────────────────────────────────────────────────

export interface ConsoleCreatorOption { id: string; full_name: string; handle: string | null; profile_photo_url: string | null; niches: string[] | null }

export interface ConsoleRosterRow {
  id: string
  creator_id: string
  full_name: string
  handle: string | null
  profile_photo_url: string | null
  added_by: 'guapd' | 'brand'
  brand_decision: 'pending' | 'accepted' | 'rejected'
  decision_channel: string | null
  decided_at: string | null
  locked: boolean
  locked_at: string | null
  /** This creator's planned deliverables. Starts as the agreed per-creator plan. No money. */
  planned_deliverables: ConsoleDeliverable[]
  /** Guapd-only note. Exists only in this staff read; no brand or creator path reaches it. */
  note: string | null
  created_at: string
}

export interface ConsoleReconcile {
  ok: boolean
  reason?: 'no_agreed_plan'
  videos_sold?: number
  videos_planned?: number
  creators_counted?: number
  creators_planned?: number | null
  lines?: { type: string; target: number; planned: number; is_video: boolean }[]
}

export async function listConsoleCreators(): Promise<Result<ConsoleCreatorOption[]>> {
  const { data, error } = await createClient().rpc('experience_console_creators')
  return error ? fail(error) : { ok: true, data: (data ?? []) as ConsoleCreatorOption[] }
}

export async function listConsoleRoster(experienceId: string): Promise<Result<ConsoleRosterRow[]>> {
  const { data, error } = await createClient().rpc('experience_console_roster', { p_experience_id: experienceId })
  return error ? fail(error) : { ok: true, data: (data ?? []) as ConsoleRosterRow[] }
}

export async function getConsoleReconcile(experienceId: string): Promise<Result<ConsoleReconcile>> {
  const { data, error } = await createClient().rpc('experience_console_reconcile', { p_experience_id: experienceId })
  return error ? fail(error) : { ok: true, data: data as ConsoleReconcile }
}

export async function rosterAdd(experienceId: string, creatorIds: string[], addedBy: 'guapd' | 'brand', channel: string | null): Promise<Result<number>> {
  const { data, error } = await createClient().rpc('experience_console_roster_add', { p_experience_id: experienceId, p_creator_ids: creatorIds, p_added_by: addedBy, p_channel: channel })
  return error ? fail(error) : { ok: true, data: data as number }
}

export async function rosterDecide(rosterId: string, decision: 'accepted' | 'rejected' | 'pending', channel: string | null): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_roster_decide', { p_roster_id: rosterId, p_decision: decision, p_channel: channel })
  return error ? fail(error) : { ok: true, data: null }
}

export async function rosterPlan(rosterId: string, deliverables: ConsoleDeliverable[]): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_roster_plan', { p_roster_id: rosterId, p_deliverables: deliverables })
  return error ? fail(error) : { ok: true, data: null }
}

export async function rosterNote(rosterId: string, note: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_roster_note', { p_roster_id: rosterId, p_note: note })
  return error ? fail(error) : { ok: true, data: null }
}

export async function rosterRemove(rosterId: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_roster_remove', { p_roster_id: rosterId })
  return error ? fail(error) : { ok: true, data: null }
}

export async function rosterLock(experienceId: string): Promise<Result<number>> {
  const { data, error } = await createClient().rpc('experience_console_roster_lock', { p_experience_id: experienceId })
  return error ? fail(error) : { ok: true, data: data as number }
}

// ── Stage 3b: creator legs (Leg 2) ─────────────────────────────────────────
// Operational staff see each creator's day rate and, once sent, their frozen
// gross → platform % → net (their payout terms). Never the margin or P&L:
// that stays behind financial access (experience_pnl, 0526).

export interface ConsoleLegRow {
  roster_id: string
  creator_id: string
  full_name: string
  handle: string | null
  profile_photo_url: string | null
  track: 'growth' | 'deals'
  /** What the roster locked (the brand's accepted plan for this creator). */
  planned_deliverables: ConsoleDeliverable[]
  /** The leg draft; null until staff adjust it (then the plan above counts). */
  leg_deliverables: ConsoleDeliverable[] | null
  leg_affiliate_count: number | null
  leg_days: number | null
  leg_product_id: string | null
  /** The creator's active shoot day rate, if they (or staff) set one. */
  day_rate_product_id: string | null
  day_rate_paise: number | null
  leg_deal_id: string | null
  leg_sent_at: string | null
  deal_status: string | null
  deal_ref: string | null
  /** Frozen at send. */
  sent_day_rate_paise: number | null
  sent_days: number | null
  sent_gross_paise: number | null
  sent_platform_pct: number | null
  sent_net_paise: number | null
}

export interface ConsoleLegsReconcile {
  ok: boolean
  over: boolean
  reason?: 'no_agreed_plan'
  per_type?: boolean
  videos_sold?: number
  videos_placed?: number
  affiliate_target?: number
  affiliate_placed?: number
  creators_counted?: number
  lines?: { type: string; target: number; placed: number; is_video: boolean }[]
}

export async function listConsoleLegs(experienceId: string): Promise<Result<ConsoleLegRow[]>> {
  const { data, error } = await createClient().rpc('experience_console_legs', { p_experience_id: experienceId })
  if (error) return fail(error)
  const num = (v: unknown) => (v == null ? null : Number(v))
  const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as ConsoleLegRow),
    leg_days: num(r.leg_days), day_rate_paise: num(r.day_rate_paise),
    sent_day_rate_paise: num(r.sent_day_rate_paise), sent_days: num(r.sent_days),
    sent_gross_paise: num(r.sent_gross_paise), sent_platform_pct: num(r.sent_platform_pct), sent_net_paise: num(r.sent_net_paise),
  }))
  return { ok: true, data: rows }
}

export async function getLegsReconcile(experienceId: string): Promise<Result<ConsoleLegsReconcile>> {
  const { data, error } = await createClient().rpc('experience_console_legs_reconcile', { p_experience_id: experienceId })
  return error ? fail(error) : { ok: true, data: data as ConsoleLegsReconcile }
}

export async function legDraft(rosterId: string, productId: string | null, days: number | null, deliverables: ConsoleDeliverable[], affiliateCount: number): Promise<Result<ConsoleLegsReconcile>> {
  const { data, error } = await createClient().rpc('experience_console_leg_draft', {
    p_roster_id: rosterId, p_product_id: productId, p_days: days, p_deliverables: deliverables, p_affiliate_count: affiliateCount,
  })
  return error ? fail(error) : { ok: true, data: data as ConsoleLegsReconcile }
}

export async function legSend(rosterId: string, expected: { grossPaise: number; platformPct: number; netPaise: number }): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_leg_send', {
    p_roster_id: rosterId, p_expected_gross_paise: expected.grossPaise,
    p_expected_platform_pct: expected.platformPct, p_expected_net_paise: expected.netPaise,
  })
  return error ? fail(error) : { ok: true, data: data as string }
}

export async function setCreatorDayRateAsStaff(creatorId: string, dayRatePaise: number): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_set_day_rate', { p_creator_id: creatorId, p_day_rate_paise: dayRatePaise })
  return error ? fail(error) : { ok: true, data: data as string }
}

export async function getCreatorBrief(experienceId: string): Promise<Result<string | null>> {
  const { data, error } = await createClient().rpc('experience_console_creator_brief', { p_experience_id: experienceId })
  return error ? fail(error) : { ok: true, data: (data ?? null) as string | null }
}

export async function setCreatorBrief(experienceId: string, brief: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_set_creator_brief', { p_experience_id: experienceId, p_brief: brief })
  return error ? fail(error) : { ok: true, data: null }
}

// ── Creator pool (0536): the roster's "Add creators" page ──────────────────
// Includes each creator's SHOOT DAY RATE, which is staff-only (never shown to
// brands), so it is read only through this staff-gated function.

export interface ConsolePoolCreator {
  id: string
  full_name: string
  handle: string | null
  profile_photo_url: string | null
  niches: string[] | null
  city: string | null
  state: string | null
  location: string | null
  social_accounts: unknown
  track: 'growth' | 'deals'
  day_rate_product_id: string | null
  day_rate_paise: number | null
  ig_connected: boolean | null
  ig_followers: number | null
  ig_reach_30: number | null
  ig_interactions_30: number | null
}

export async function listConsoleCreatorPool(): Promise<Result<ConsolePoolCreator[]>> {
  const { data, error } = await createClient().rpc('experience_console_creator_pool')
  if (error) return fail(error)
  const n = (v: unknown) => (v == null ? null : Number(v))
  return { ok: true, data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as ConsolePoolCreator),
    day_rate_paise: n(r.day_rate_paise), ig_followers: n(r.ig_followers), ig_reach_30: n(r.ig_reach_30), ig_interactions_30: n(r.ig_interactions_30),
  })) }
}
