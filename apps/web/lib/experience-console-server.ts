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
  request_deliverables: ConsoleDeliverable[]
  request_affiliate: boolean
  request_ad_rights: boolean
  request_ad_rights_months: number | null
  request_boost: boolean
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
  deliverables: ConsoleDeliverable[]
  affiliate: boolean
  adRights: boolean
  adRightsMonths: number | null
  boost: boolean
  boostMonths: number | null
  location: string | null
  dateFrom: string | null
  dateTo: string | null
  brief: string | null
  channel: string
}

export async function createConsoleExperience(p: CreateRequestInput): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('experience_console_create', {
    p_brand_id: p.brandId, p_title: p.title, p_deliverables: p.deliverables,
    p_affiliate: p.affiliate, p_ad_rights: p.adRights, p_ad_rights_months: p.adRightsMonths,
    p_boost: p.boost, p_boost_months: p.boostMonths, p_location: p.location,
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
