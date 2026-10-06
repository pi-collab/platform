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
