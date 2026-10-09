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
  /** The agreed brand price, set when a quote is accepted. FINANCIAL ACCESS
      ONLY (0537): null for operational staff, so they cannot derive margin.
      can_see_brand_price says which. */
  can_see_brand_price: boolean
  brand_per_video_paise: number | null
  brand_deliverable_count: number | null
  brand_misc_paise: number | null
  brand_service_total_paise: number | null
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
  /** Amounts and message are null without financial access (0537). */
  per_video_paise: number | null
  deliverable_count: number
  misc_paise: number | null
  total_paise: number | null
  /** The brand's note when they declined on Guapd (0544); financial only, like the message. */
  brand_note?: string | null
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
  /** 0542: a rate entered on this deal while the creator has no active rate (paused or never set). */
  leg_entered_rate_paise: number | null
  /** 0542: the creator's paused package rate, when they have no active one. */
  paused_rate_paise: number | null
  /** 0542: where the sent rate came from. */
  sent_rate_source: 'package' | 'entered' | null
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
    leg_entered_rate_paise: num(r.leg_entered_rate_paise), paused_rate_paise: num(r.paused_rate_paise),
  }))
  return { ok: true, data: rows }
}

export async function getLegsReconcile(experienceId: string): Promise<Result<ConsoleLegsReconcile>> {
  const { data, error } = await createClient().rpc('experience_console_legs_reconcile', { p_experience_id: experienceId })
  return error ? fail(error) : { ok: true, data: data as ConsoleLegsReconcile }
}

export async function legDraft(rosterId: string, productId: string | null, days: number | null, deliverables: ConsoleDeliverable[], affiliateCount: number, enteredRatePaise: number | null = null): Promise<Result<ConsoleLegsReconcile>> {
  const { data, error } = await createClient().rpc('experience_console_leg_draft', {
    p_roster_id: rosterId, p_product_id: productId, p_days: days, p_deliverables: deliverables, p_affiliate_count: affiliateCount,
    p_entered_rate_paise: enteredRatePaise,
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

// ── Stage 3c: the cost sheet (operational) and the freeze points ────────────
// Costs are what Guapd spends running the shoot. Creator pay is never a cost
// line (it lives on the creator legs). Soft-deleted with a reason. The P&L
// itself is NOT here: it is financial-only, read via lib/experience-pnl-server.ts.

export interface ConsoleCostLine {
  id: string
  label: string
  category: string
  basis: 'per_unit' | 'flat_total'
  quantity: number | null
  unit_rate_paise: number | null
  total_paise: number
  provided_by: 'guapd' | 'brand' | 'creator'
  creator_leg_deal_id: string | null
  creator_name: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export interface ConsoleCosts {
  status: string
  categories: string[]
  lines: ConsoleCostLine[]
  /** Σ of Guapd-provided, not-removed lines: the figure the P&L subtracts. */
  guapd_total_paise: number
}

export interface CostInput {
  label: string
  category: string
  basis: 'per_unit' | 'flat_total'
  quantity: number | null
  unitRatePaise: number | null
  totalPaise: number
  providedBy: 'guapd' | 'brand' | 'creator'
  creatorLegDealId: string | null
  note: string | null
}

export async function listConsoleCosts(experienceId: string): Promise<Result<ConsoleCosts>> {
  const { data, error } = await createClient().rpc('experience_console_costs', { p_experience_id: experienceId })
  if (error) return fail(error)
  const c = data as ConsoleCosts
  return { ok: true, data: { ...c, guapd_total_paise: Number(c.guapd_total_paise),
    lines: (c.lines ?? []).map((l) => ({ ...l, total_paise: Number(l.total_paise), quantity: l.quantity == null ? null : Number(l.quantity), unit_rate_paise: l.unit_rate_paise == null ? null : Number(l.unit_rate_paise) })) } }
}

const costArgs = (c: CostInput) => ({
  p_label: c.label, p_category: c.category, p_basis: c.basis, p_quantity: c.quantity, p_unit_rate_paise: c.unitRatePaise,
  p_total_paise: c.totalPaise, p_provided_by: c.providedBy, p_creator_leg_deal_id: c.creatorLegDealId, p_note: c.note,
})

export async function addConsoleCost(experienceId: string, c: CostInput): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_cost_add', { p_experience_id: experienceId, ...costArgs(c) })
  return error ? fail(error) : { ok: true, data: data as string }
}

export async function updateConsoleCost(costId: string, c: CostInput, expectedUpdatedAt: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_cost_update', { p_cost_id: costId, ...costArgs(c), p_expected_updated_at: expectedUpdatedAt })
  return error ? fail(error) : { ok: true, data: null }
}

export async function removeConsoleCost(costId: string, reason: string, expectedUpdatedAt: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_cost_remove', { p_cost_id: costId, p_reason: reason, p_expected_updated_at: expectedUpdatedAt })
  return error ? fail(error) : { ok: true, data: null }
}

export async function completeConsoleExperience(experienceId: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_complete', { p_experience_id: experienceId })
  return error ? fail(error) : { ok: true, data: null }
}

export async function reopenConsoleExperience(experienceId: string, reason: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_reopen', { p_experience_id: experienceId, p_reason: reason })
  return error ? fail(error) : { ok: true, data: null }
}


// ── 0538: the shoot, deliverables, and releasing them to the brand ─────────
// Operational access, checked again in Postgres. Nothing here carries a price,
// rate, net or margin. Who provides the deliverables (Guapd attaches, or the
// creator submits) comes from the Experience's snapshotted template settings.

export interface ConsoleRelease {
  id: string
  item_version: number
  released_at: string
  brand_decision: 'approved' | 'changes_requested' | null
  brand_decision_channel: string | null
  brand_decided_at: string | null
  brand_decision_note: string | null
}

export interface ConsoleItem {
  id: string
  label: string
  type: string | null
  affiliate_link: boolean
  visible_to_creator: boolean
  item_status: 'pending' | 'submitted' | 'revision' | 'approved'
  version: number
  external_url: string | null
  file_name: string | null
  has_file: boolean
  submitted_at: string | null
  submitted_via: 'creator' | 'guapd' | null
  approved_at: string | null
  /** Guapd's note: to the creator (creator-submit) or staff-only (Guapd provides). */
  note: string | null
  /** The live release to the brand, if any. */
  release: ConsoleRelease | null
  /** Withdrawn or superseded releases of this item. */
  releases_before: number
}

export interface ConsoleShootLeg {
  roster_id: string
  deal_id: string
  creator_id: string
  full_name: string
  handle: string | null
  deal_status: string
  owner: 'guapd' | 'creator'
  shoot_outcome: 'done' | 'did_not_shoot' | null
  shoot_outcome_at: string | null
  shoot_outcome_reason: string | null
  /** The creator's part is done: payment eligibility (paid in Phase 4). */
  work_complete: boolean
  items: ConsoleItem[]
}

export interface DeliverablesProgress {
  ready: boolean
  over_shared: boolean
  per_type?: boolean
  videos_sold?: number
  videos_shared?: number
  videos_approved?: number
  awaiting_brand?: number
  reason?: string
  lines: { type: string; sold: number; shared: number; approved: number; is_video: boolean }[]
  gaps: { type: string; sold: number; approved: number }[]
}

export interface ConsoleDeliverables {
  status: string
  shoot_date: string | null
  today: string
  owner: 'guapd' | 'creator'
  completion_trigger: string
  legs: ConsoleShootLeg[]
  progress: DeliverablesProgress
}

export async function getConsoleDeliverables(experienceId: string): Promise<Result<ConsoleDeliverables>> {
  const { data, error } = await createClient().rpc('experience_console_deliverables', { p_experience_id: experienceId })
  return error ? fail(error) : { ok: true, data: data as ConsoleDeliverables }
}

export async function scheduleConsoleShoot(experienceId: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_schedule_shoot', { p_experience_id: experienceId })
  return error ? fail(error) : { ok: true, data: null }
}

export async function recordShootOutcome(rosterId: string, outcome: 'done' | 'did_not_shoot', reason: string | null): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_leg_shoot_outcome', { p_roster_id: rosterId, p_outcome: outcome, p_reason: reason })
  return error ? fail(error) : { ok: true, data: data as string }
}

export async function undoShootOutcome(rosterId: string, reason: string): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_leg_shoot_undo', { p_roster_id: rosterId, p_reason: reason })
  return error ? fail(error) : { ok: true, data: data as string }
}

export async function withdrawConsoleLeg(rosterId: string, reason: string): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_leg_withdraw', { p_roster_id: rosterId, p_reason: reason })
  return error ? fail(error) : { ok: true, data: data as string }
}

export async function itemUploadSlot(itemId: string, fileName: string): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_item_upload_slot', { p_item_id: itemId, p_file_name: fileName })
  return error ? fail(error) : { ok: true, data: data as string }
}

export async function attachConsoleItem(itemId: string, c: { url: string | null; storagePath: string | null; fileName: string | null }): Promise<Result<number>> {
  const { data, error } = await createClient().rpc('experience_console_item_attach', { p_item_id: itemId, p_url: c.url, p_storage_path: c.storagePath, p_file_name: c.fileName })
  return error ? fail(error) : { ok: true, data: Number(data) }
}

export async function reviewConsoleItem(itemId: string, decision: 'approve' | 'revision', note: string | null): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_item_review', { p_item_id: itemId, p_decision: decision, p_note: note })
  return error ? fail(error) : { ok: true, data: null }
}

export async function consoleItemFile(itemId: string): Promise<Result<{ storage_path: string; file_name: string }>> {
  const { data, error } = await createClient().rpc('experience_console_item_file', { p_item_id: itemId })
  return error ? fail(error) : { ok: true, data: data as { storage_path: string; file_name: string } }
}

export async function releaseConsoleItems(experienceId: string, itemIds: string[]): Promise<Result<{ released: number; progress: DeliverablesProgress }>> {
  const { data, error } = await createClient().rpc('experience_console_release', { p_experience_id: experienceId, p_item_ids: itemIds })
  return error ? fail(error) : { ok: true, data: data as { released: number; progress: DeliverablesProgress } }
}

export async function withdrawConsoleRelease(releaseId: string, reason: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_release_withdraw', { p_release_id: releaseId, p_reason: reason })
  return error ? fail(error) : { ok: true, data: null }
}

export async function decideConsoleRelease(releaseId: string, decision: 'approved' | 'changes_requested', channel: string, note: string | null): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_release_decide', { p_release_id: releaseId, p_decision: decision, p_channel: channel, p_note: note })
  return error ? fail(error) : { ok: true, data: null }
}


// ── 0540: invoices (FINANCIAL), payouts (operational), completion ──────────
// Every call runs with the signed-in user's session; the database checks
// financial access for invoices, payments and billing details, operational
// access for payouts and completion. The service role is used by the actions
// only to sign storage links and upload slots for paths these functions return.

export interface FinanceSettings {
  legal_name: string; address: string; state: string; gstin: string | null; gst_registered: boolean
  pan: string | null; payment_instructions: string | null; updated_at: string
}
export interface BrandBilling {
  brand_id: string; legal_name: string; address: string; state: string; gstin: string | null; pan: string | null
  has_certificate: boolean; updated_at: string
}
export interface InvoicePayment {
  id: string; amount_paise: number; tds_paise: number; received_on: string; method: string; reference: string
  recorded_at: string; recorded_by_name: string | null; reversed_at: string | null; reversed_reason: string | null
}
export interface ConsoleInvoice {
  id: string; kind: 'initial' | 'additional' | 'follow_on'; source: string | null; number: string | null
  status: 'draft' | 'issued' | 'paid' | 'void'; description: string
  subtotal_paise: number; gst_rate_pct: number | null; cgst_paise: number | null; sgst_paise: number | null; igst_paise: number | null
  total_paise: number; gst_registered: boolean | null; issue_date: string | null; due_date: string | null; issued_at: string | null
  has_pdf: boolean; void_reason: string | null; voided_at: string | null; paid_paise: number; outstanding_paise: number
  updated_at: string; payments: InvoicePayment[]
}
export interface ConsoleInvoices {
  experience_id: string; status: string; title: string; brand_id: string; brand_name: string; agreed_paise: number | null
  settings: FinanceSettings | null; billing: BrandBilling | null; invoices: ConsoleInvoice[]
}
export interface InvoiceDraftInput {
  kind: 'initial' | 'additional'; source: 'existing_footage' | 'new_shoot' | null; description: string
  subtotalPaise: number; gstRatePct: number | null; cgstPaise: number | null; sgstPaise: number | null; igstPaise: number | null
  dueDate: string | null
}

export async function getConsoleInvoices(experienceId: string): Promise<Result<ConsoleInvoices>> {
  const { data, error } = await createClient().rpc('experience_console_invoices', { p_experience_id: experienceId })
  return error ? fail(error) : { ok: true, data: data as ConsoleInvoices }
}
export async function setFinanceSettings(s: { legalName: string; address: string; state: string; gstin: string | null; gstRegistered: boolean; pan: string | null; paymentInstructions: string | null }): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_set_finance_settings', {
    p_legal_name: s.legalName, p_address: s.address, p_state: s.state, p_gstin: s.gstin, p_gst_registered: s.gstRegistered,
    p_pan: s.pan, p_payment_instructions: s.paymentInstructions,
  })
  return error ? fail(error) : { ok: true, data: null }
}
export async function setBrandBilling(brandId: string, b: { legalName: string; address: string; state: string; gstin: string | null; pan: string | null; certificatePath: string | null }): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_set_brand_billing', {
    p_brand_id: brandId, p_legal_name: b.legalName, p_address: b.address, p_state: b.state, p_gstin: b.gstin, p_pan: b.pan, p_certificate_path: b.certificatePath,
  })
  return error ? fail(error) : { ok: true, data: null }
}
const draftArgs = (d: InvoiceDraftInput) => ({
  p_kind: d.kind, p_source: d.source, p_description: d.description, p_subtotal_paise: d.subtotalPaise,
  p_gst_rate_pct: d.gstRatePct, p_cgst_paise: d.cgstPaise, p_sgst_paise: d.sgstPaise, p_igst_paise: d.igstPaise, p_due_date: d.dueDate,
})
export async function draftConsoleInvoice(experienceId: string, d: InvoiceDraftInput): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_invoice_draft', { p_experience_id: experienceId, ...draftArgs(d) })
  return error ? fail(error) : { ok: true, data: data as string }
}
export async function updateConsoleInvoice(invoiceId: string, d: InvoiceDraftInput): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_invoice_update', { p_invoice_id: invoiceId, ...draftArgs(d) })
  return error ? fail(error) : { ok: true, data: null }
}
export async function discardConsoleInvoice(invoiceId: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_invoice_discard', { p_invoice_id: invoiceId })
  return error ? fail(error) : { ok: true, data: null }
}
export async function issueConsoleInvoice(invoiceId: string): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_invoice_issue', { p_invoice_id: invoiceId })
  return error ? fail(error) : { ok: true, data: data as string }
}
export async function consoleInvoiceDoc(invoiceId: string): Promise<Result<Record<string, unknown>>> {
  const { data, error } = await createClient().rpc('experience_console_invoice_doc', { p_invoice_id: invoiceId })
  return error ? fail(error) : { ok: true, data: data as Record<string, unknown> }
}
export async function consoleInvoicePdfPath(invoiceId: string): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_invoice_pdf_path', { p_invoice_id: invoiceId })
  return error ? fail(error) : { ok: true, data: data as string }
}
export async function setConsoleInvoicePdf(invoiceId: string, path: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_invoice_set_pdf', { p_invoice_id: invoiceId, p_path: path })
  return error ? fail(error) : { ok: true, data: null }
}
export async function voidConsoleInvoice(invoiceId: string, reason: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_invoice_void', { p_invoice_id: invoiceId, p_reason: reason })
  return error ? fail(error) : { ok: true, data: null }
}
export async function addInvoicePayment(invoiceId: string, p: { amountPaise: number; tdsPaise: number; receivedOn: string; method: string; reference: string; proofPath: string }): Promise<Result<{ payment_id: string; settled: boolean }>> {
  const { data, error } = await createClient().rpc('experience_console_invoice_payment_add', {
    p_invoice_id: invoiceId, p_amount_paise: p.amountPaise, p_tds_paise: p.tdsPaise, p_received_on: p.receivedOn,
    p_method: p.method, p_reference: p.reference, p_proof_path: p.proofPath,
  })
  return error ? fail(error) : { ok: true, data: data as { payment_id: string; settled: boolean } }
}
export async function reverseInvoicePayment(paymentId: string, reason: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_invoice_payment_reverse', { p_payment_id: paymentId, p_reason: reason })
  return error ? fail(error) : { ok: true, data: null }
}
export type FinanceUploadKind = 'invoice-payment' | 'brand-certificate' | 'payout-proof'
export type FinanceFileKind = 'invoice-pdf' | 'invoice-payment' | 'brand-certificate' | 'payout-proof'
export async function financeUploadSlot(kind: FinanceUploadKind, targetId: string, fileName: string): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_finance_upload_slot', { p_kind: kind, p_target_id: targetId, p_file_name: fileName })
  return error ? fail(error) : { ok: true, data: data as string }
}
export async function consoleFinanceFile(kind: FinanceFileKind, id: string): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_finance_file', { p_kind: kind, p_id: id })
  return error ? fail(error) : { ok: true, data: data as string }
}

export interface ConsolePayout {
  id: string; status: 'requested' | 'approved' | 'processing' | 'paid' | 'failed'
  amount_paise: number; tds_paise: number; net_amount_paise: number
  requested_by_name: string | null; requested_at: string; approved_by_name: string | null; approved_at: string | null
  paid_on: string | null; method: string | null; reference: string | null; has_proof: boolean; i_requested: boolean
  details_changed_after_request: boolean
}
export interface ConsolePayoutLeg {
  deal_id: string; creator_id: string; full_name: string | null; deal_status: string; shoot_outcome: string | null
  work_complete: boolean; gross_paise: number; platform_pct: number; platform_fee_paise: number; net_paise: number
  /** 0542: masked only; full details are finance's (getPayoutAccount). */
  payment_details: { bank_on_file: boolean; account_masked: string | null; upi_on_file: boolean; changed_at: string | null }
  cancelled_before: number; payout: ConsolePayout | null
}
export interface ConsolePayouts { experience_id: string; status: string; legs: ConsolePayoutLeg[]; can_pay: boolean }

export async function getConsolePayouts(experienceId: string): Promise<Result<ConsolePayouts>> {
  const { data, error } = await createClient().rpc('experience_console_payouts', { p_experience_id: experienceId })
  return error ? fail(error) : { ok: true, data: data as ConsolePayouts }
}
export async function requestPayout(dealId: string, tdsPaise: number): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_payout_request', { p_deal_id: dealId, p_tds_paise: tdsPaise })
  return error ? fail(error) : { ok: true, data: data as string }
}
export async function setPayoutTds(payoutId: string, tdsPaise: number): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_payout_set_tds', { p_payout_id: payoutId, p_tds_paise: tdsPaise })
  return error ? fail(error) : { ok: true, data: null }
}
export async function approvePayout(payoutId: string, confirmDetailsChanged = false): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_payout_approve', { p_payout_id: payoutId, p_confirm_details_changed: confirmDetailsChanged })
  return error ? fail(error) : { ok: true, data: null }
}
export async function markPayoutPaid(payoutId: string, p: { paidOn: string; method: string; reference: string; proofPath: string }): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_payout_paid', {
    p_payout_id: payoutId, p_paid_on: p.paidOn, p_method: p.method, p_reference: p.reference, p_proof_path: p.proofPath,
  })
  return error ? fail(error) : { ok: true, data: null }
}
export async function cancelPayout(payoutId: string, reason: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_payout_cancel', { p_payout_id: payoutId, p_reason: reason })
  return error ? fail(error) : { ok: true, data: null }
}

export interface ConsoleCompletion {
  status: string; deliverables_ok: boolean; invoices_ok: boolean; payouts_ok: boolean; brand_signed_off: boolean
  invoices_live: number; invoices_unpaid: number; invoices_draft: number; creators_to_pay: number; creators_paid: number
  can_complete: boolean; blockers: string[]
  brand_signoff_at: string | null; brand_signoff_channel: string | null; brand_signoff_note: string | null; brand_signoff_by_name: string | null
  guapd_signoff_at: string | null; guapd_signoff_by_name: string | null
}
export async function getConsoleCompletion(experienceId: string): Promise<Result<ConsoleCompletion>> {
  const { data, error } = await createClient().rpc('experience_console_completion', { p_experience_id: experienceId })
  return error ? fail(error) : { ok: true, data: data as ConsoleCompletion }
}
export async function recordBrandSignoff(experienceId: string, channel: string, note: string | null): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_brand_signoff', { p_experience_id: experienceId, p_channel: channel, p_note: note })
  return error ? fail(error) : { ok: true, data: null }
}
export async function clearBrandSignoff(experienceId: string, reason: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_brand_signoff_clear', { p_experience_id: experienceId, p_reason: reason })
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

// ── 0541: creators not on Guapd yet, on the roster's "Add creators" page ───
// Staff only (operational). Not on the roster until linked to their account.

export interface ConsoleProspect {
  id: string; full_name: string; instagram_handle: string; phone: string | null
  cost_basis: 'per_day' | 'flat'; expected_day_rate_paise: number | null; expected_days: number | null; expected_total_paise: number
  status: 'not_contacted' | 'contacted' | 'agreed' | 'onboarding' | 'linked' | 'dropped'
  brand_decision: 'pending' | 'accepted' | 'rejected'; decision_channel: string | null; note: string | null
  linked_creator_id: string | null; linked_creator_name: string | null; linked_at: string | null; dropped_reason: string | null
  created_at: string; updated_at: string
  match: { creator_id: string; full_name: string; bookable: boolean; on_roster: boolean } | null
}
export interface ProspectInput {
  fullName: string; handle: string; phone: string | null; costBasis: 'per_day' | 'flat'
  dayRatePaise: number | null; days: number | null; flatPaise: number | null; note: string | null
}
const prospectArgs = (p: ProspectInput) => ({
  p_full_name: p.fullName, p_handle: p.handle, p_phone: p.phone, p_cost_basis: p.costBasis,
  p_day_rate_paise: p.dayRatePaise, p_days: p.days, p_flat_paise: p.flatPaise, p_note: p.note,
})

export async function listConsoleProspects(experienceId: string): Promise<Result<ConsoleProspect[]>> {
  const { data, error } = await createClient().rpc('experience_console_prospects', { p_experience_id: experienceId })
  if (error) return fail(error)
  const n = (v: unknown) => (v == null ? null : Number(v))
  return { ok: true, data: (((data as { prospects: Record<string, unknown>[] }).prospects) ?? []).map((r) => ({
    ...(r as unknown as ConsoleProspect),
    expected_day_rate_paise: n(r.expected_day_rate_paise), expected_days: n(r.expected_days), expected_total_paise: Number(r.expected_total_paise),
  })) }
}
export type ProspectStatus = 'not_contacted' | 'contacted' | 'agreed' | 'onboarding'
export async function addProspect(experienceId: string, p: ProspectInput, status: ProspectStatus): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_prospect_add', { p_experience_id: experienceId, ...prospectArgs(p), p_status: status })
  return error ? fail(error) : { ok: true, data: data as string }
}
export async function updateProspect(prospectId: string, p: ProspectInput): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_prospect_update', { p_prospect_id: prospectId, ...prospectArgs(p) })
  return error ? fail(error) : { ok: true, data: null }
}
export async function setProspectStatus(prospectId: string, status: ProspectStatus): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_prospect_status', { p_prospect_id: prospectId, p_status: status })
  return error ? fail(error) : { ok: true, data: null }
}
export async function decideProspect(prospectId: string, decision: 'accepted' | 'rejected' | 'pending', channel: string | null): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_prospect_decide', { p_prospect_id: prospectId, p_decision: decision, p_channel: channel })
  return error ? fail(error) : { ok: true, data: null }
}
export async function dropProspect(prospectId: string, reason: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_prospect_drop', { p_prospect_id: prospectId, p_reason: reason })
  return error ? fail(error) : { ok: true, data: null }
}
export async function linkProspect(prospectId: string, creatorId: string): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_prospect_link', { p_prospect_id: prospectId, p_creator_id: creatorId })
  return error ? fail(error) : { ok: true, data: data as string }
}


// ── 0542: counters on a creator leg; finance-only bank details ─────────────

export interface ConsoleCounter {
  id: string; deal_id: string; round: number; proposed_by: 'creator' | 'guapd'
  day_rate_paise: number; days: number; gross_paise: number; platform_pct: number; net_paise: number
  note: string | null; status: 'open' | 'accepted' | 'declined' | 'withdrawn' | 'superseded'
  created_at: string; decided_at: string | null; decision_note: string | null
  /** Against the deal's current terms: a raise needs financial access to accept or send. */
  direction: 'raises' | 'lowers' | 'holds'
}
export async function getConsoleCounters(experienceId: string): Promise<Result<{ counters: ConsoleCounter[]; can_raise: boolean }>> {
  const { data, error } = await createClient().rpc('experience_console_counters', { p_experience_id: experienceId })
  if (error) return fail(error)
  const d = data as { counters: Record<string, unknown>[]; can_raise: boolean }
  return { ok: true, data: { can_raise: d.can_raise, counters: (d.counters ?? []).map((c) => ({
    ...(c as unknown as ConsoleCounter), day_rate_paise: Number(c.day_rate_paise), days: Number(c.days), gross_paise: Number(c.gross_paise),
    platform_pct: Number(c.platform_pct), net_paise: Number(c.net_paise),
  })) } }
}
export async function acceptCounter(counterId: string, expectedGrossPaise: number): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_counter_accept', { p_counter_id: counterId, p_expected_gross_paise: expectedGrossPaise })
  return error ? fail(error) : { ok: true, data: null }
}
export async function declineCounter(counterId: string, note: string | null): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_counter_decline', { p_counter_id: counterId, p_note: note })
  return error ? fail(error) : { ok: true, data: null }
}
export async function sendCounter(dealId: string, dayRatePaise: number, days: number, note: string | null): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_counter_send', { p_deal_id: dealId, p_day_rate_paise: dayRatePaise, p_days: days, p_note: note })
  return error ? fail(error) : { ok: true, data: data as string }
}
export async function withdrawGuapdCounter(counterId: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('experience_console_counter_withdraw', { p_counter_id: counterId })
  return error ? fail(error) : { ok: true, data: null }
}

export interface PayoutAccount {
  account_holder_name: string | null; account_number: string | null; ifsc: string | null; pan: string | null
  gst_registered: boolean | null; changed_at: string | null; changed_after_request: boolean; upi_id: string | null
}
/** FINANCE only, for paying one payout; every call is audited (no values). */
export async function getPayoutAccount(payoutId: string): Promise<Result<PayoutAccount>> {
  const { data, error } = await createClient().rpc('experience_console_payout_account', { p_payout_id: payoutId })
  return error ? fail(error) : { ok: true, data: data as PayoutAccount }
}
