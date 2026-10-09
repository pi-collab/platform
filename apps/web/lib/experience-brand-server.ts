import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { requestArgs, type RequestInput } from '@/lib/experience-request-validate'

/**
 * The brand's side of Guapd Experiences (0544). Every call runs with the brand
 * member's OWN session against a brand_experience_* database function, which
 * checks membership of THIS Experience's brand (never the house brand) and
 * returns named fields only. Brands have no direct read on the Experience
 * tables. Nothing here can return a creator's rate, gross, net, payout, cost,
 * margin, note or id.
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string }
const fail = (e: { message: string }): { ok: false; error: string } => ({ ok: false, error: e.message })

export interface BrandExperienceRow {
  id: string; title: string; brand_name: string; status: string
  requested_at: string | null; shoot_date: string | null; shoot_city: string | null; creator_count: number | null
  quote_to_answer: boolean; roster_to_review: number; items_to_review: number; invoices_due: number; signoff_due: boolean
}
export interface BrandQuote {
  quote_id: string; version: number; proposed_by: 'guapd' | 'brand'
  per_video_paise: number; deliverable_count: number; misc_paise: number; total_paise: number
  deliverables: { type: string; count: number }[]; shoot_date: string | null; shoot_city: string | null
  message: string | null; status: 'open' | 'accepted' | 'rejected' | 'withdrawn'; brand_note: string | null
  decided_at: string | null; on_guapd: boolean
}
export interface BrandExperience {
  id: string; title: string; brand_name: string; status: string; requested_at: string | null; request_on_guapd: boolean
  request: {
    creator_count: number | null; deliverables: { type: string; count: number }[] | null
    affiliate: boolean; affiliate_per_creator: number | null
    ad_rights: boolean; ad_rights_per_creator: number | null; ad_rights_months: number | null
    boost: boolean; boost_per_creator: number | null; boost_months: number | null
    location: string | null; date_from: string | null; date_to: string | null; brief: string | null
  }
  quote: BrandQuote | null
  agreed_total_paise: number | null
  shoot_date: string | null; shoot_city: string | null
  signoff_at: string | null; signoff_on_guapd: boolean | null; completed_at: string | null
  is_admin: boolean
}
export interface BrandRosterCreator {
  roster_id: string; full_name: string; handle: string | null; profile_url: string | null; photo_url: string | null
  planned_deliverables: { type: string; count: number }[] | null; added_by: 'guapd' | 'brand'
  decision: 'pending' | 'accepted' | 'rejected'; decided_at: string | null; decided_on_guapd: boolean | null; locked: boolean
}
export interface BrandItem {
  release_id: string; creator_name: string | null; label: string; kind: 'link' | 'file'
  url: string | null; file_name: string | null; shared_at: string
  decision: 'approved' | 'changes_requested' | null; decided_at: string | null; changes_asked: string | null
  decided_on_guapd: boolean | null; can_decide: boolean
}
export interface BrandInvoice {
  invoice_id: string; number: string; issue_date: string; due_date: string | null; description: string
  subtotal_paise: number; gst_paise: number; total_paise: number; paid_paise: number
  status: 'due' | 'part_paid' | 'paid'; has_pdf: boolean
}
export interface BrandReport {
  title: string; brand_name: string; requested_at: string | null; shoot_date: string | null; shoot_city: string | null
  completed_at: string | null
  creators: { full_name: string; handle: string | null; profile_url: string | null }[]
  items: Omit<BrandItem, 'changes_asked' | 'decided_on_guapd' | 'can_decide'>[]
  invoices: BrandInvoice[]
}

const num = (v: unknown) => (v == null ? null : Number(v))

export async function listBrandExperiences(): Promise<Result<{ experiences: BrandExperienceRow[]; can_request: boolean }>> {
  const { data, error } = await createClient().rpc('brand_experiences')
  if (error) return fail(error)
  const d = data as { experiences: BrandExperienceRow[]; can_request: boolean }
  return { ok: true, data: { can_request: d.can_request === true, experiences: (d.experiences ?? []).map((r) => ({
    ...r, roster_to_review: Number(r.roster_to_review), items_to_review: Number(r.items_to_review), invoices_due: Number(r.invoices_due),
  })) } }
}

export async function getBrandExperience(id: string): Promise<Result<BrandExperience>> {
  const { data, error } = await createClient().rpc('brand_experience', { p_experience_id: id })
  if (error) return fail(error)
  const e = data as BrandExperience
  if (e.quote) e.quote = { ...e.quote, per_video_paise: Number(e.quote.per_video_paise), misc_paise: Number(e.quote.misc_paise), total_paise: Number(e.quote.total_paise) }
  e.agreed_total_paise = num(e.agreed_total_paise)
  return { ok: true, data: e }
}

export async function getBrandRoster(id: string): Promise<Result<{ can_decide: boolean; creators: BrandRosterCreator[] }>> {
  const { data, error } = await createClient().rpc('brand_experience_roster', { p_experience_id: id })
  return error ? fail(error) : { ok: true, data: data as { can_decide: boolean; creators: BrandRosterCreator[] } }
}

export async function getBrandDeliverables(id: string): Promise<Result<{ items: BrandItem[] }>> {
  const { data, error } = await createClient().rpc('brand_experience_deliverables', { p_experience_id: id })
  return error ? fail(error) : { ok: true, data: data as { items: BrandItem[] } }
}

const invoiceNums = (i: BrandInvoice): BrandInvoice => ({ ...i, subtotal_paise: Number(i.subtotal_paise), gst_paise: Number(i.gst_paise), total_paise: Number(i.total_paise), paid_paise: Number(i.paid_paise) })

export async function getBrandInvoices(id: string): Promise<Result<BrandInvoice[]>> {
  const { data, error } = await createClient().rpc('brand_experience_invoices', { p_experience_id: id })
  return error ? fail(error) : { ok: true, data: (((data as { invoices: BrandInvoice[] } | null)?.invoices) ?? []).map(invoiceNums) }
}

export async function getBrandReport(id: string): Promise<Result<BrandReport>> {
  const { data, error } = await createClient().rpc('brand_experience_report', { p_experience_id: id })
  if (error) return fail(error)
  const r = data as BrandReport
  return { ok: true, data: { ...r, invoices: (r.invoices ?? []).map(invoiceNums) } }
}

// ── Writes ──
export async function brandRequestExperience(v: RequestInput): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('brand_experience_request', requestArgs(v))
  return error ? fail(error) : { ok: true, data: data as string }
}
export async function brandAnswerQuote(quoteId: string, accept: boolean, note: string | null): Promise<Result<null>> {
  const { error } = await createClient().rpc('brand_experience_quote_answer', { p_quote_id: quoteId, p_accept: accept, p_note: note })
  return error ? fail(error) : { ok: true, data: null }
}
export async function brandDecideRoster(rosterId: string, decision: 'accepted' | 'rejected', expected: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('brand_experience_roster_decide', { p_roster_id: rosterId, p_decision: decision, p_expected: expected })
  return error ? fail(error) : { ok: true, data: null }
}
export async function brandDecideRelease(releaseId: string, decision: 'approved' | 'changes_requested', note: string | null, expected: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('brand_experience_release_decide', { p_release_id: releaseId, p_decision: decision, p_note: note, p_expected: expected })
  return error ? fail(error) : { ok: true, data: null }
}
export async function brandSignOff(id: string, note: string | null): Promise<Result<null>> {
  const { error } = await createClient().rpc('brand_experience_signoff', { p_experience_id: id, p_note: note })
  return error ? fail(error) : { ok: true, data: null }
}
