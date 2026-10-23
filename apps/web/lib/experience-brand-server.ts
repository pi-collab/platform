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
  /** 0553: the extras as named lines (their sum is misc_paise); [] on older quotes. */
  extras?: { label: string; amount_paise: number }[]
  deliverables: { type: string; count: number }[]; shoot_date: string | null; shoot_city: string | null
  message: string | null; status: 'open' | 'accepted' | 'rejected' | 'withdrawn'; brand_note: string | null
  decided_at: string | null; on_guapd: boolean
  /** 0560: affiliate commission, % of sales through each creator's link; null when no affiliate links. */
  affiliate_pct?: number | null
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
  decision: 'pending' | 'accepted' | 'rejected' | 'on_hold'; decided_at: string | null; decided_on_guapd: boolean | null; locked: boolean
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
  /** 0568: what the brand marked paid that Guapd has not confirmed yet, and what is left after both. */
  reported_paise?: number; balance_paise?: number
  reports?: BrandPaymentReport[]
}
/** 0568: a payment the brand marked against Guapd's invoice. Never settles it on its own. */
export interface BrandPaymentReport {
  amount_paise: number; tds_paise: number; paid_on: string; method: string; reference: string
  status: 'reported' | 'confirmed' | 'rejected' | 'withdrawn'; reason: string | null
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

const invoiceNums = (i: BrandInvoice): BrandInvoice => ({
  ...i, subtotal_paise: Number(i.subtotal_paise), gst_paise: Number(i.gst_paise), total_paise: Number(i.total_paise), paid_paise: Number(i.paid_paise),
  reported_paise: i.reported_paise == null ? undefined : Number(i.reported_paise),
  balance_paise: i.balance_paise == null ? undefined : Number(i.balance_paise),
  reports: (i.reports ?? []).map((r) => ({ ...r, amount_paise: Number(r.amount_paise), tds_paise: Number(r.tds_paise) })),
})

/** 0569: the creators Guapd shared with this brand, searched and paged in the database. Never anyone else. */
export async function getBrandRosterPage(id: string, q: string | null, limit: number, offset: number): Promise<Result<{ can_decide: boolean; total_all: number; total: number; creators: BrandRosterCreator[] }>> {
  const { data, error } = await createClient().rpc('brand_experience_roster_page', { p_experience_id: id, p_q: q, p_limit: limit, p_offset: offset })
  if (error) return fail(error)
  const d = data as { can_decide: boolean; total_all: number; total: number; creators: BrandRosterCreator[] }
  return { ok: true, data: { can_decide: !!d.can_decide, total_all: Number(d.total_all ?? 0), total: Number(d.total ?? 0), creators: d.creators ?? [] } }
}

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
/** 0568: the brand marks a payment it made against Guapd's invoice (admins only, checked in the database). */
export async function brandReportPayment(v: { invoiceId: string; amountPaise: number; tdsPaise: number; paidOn: string; method: string; reference: string; note: string | null }): Promise<Result<{ report_id: string; balance_paise: number }>> {
  const { data, error } = await createClient().rpc('brand_experience_payment_report', {
    p_invoice_id: v.invoiceId, p_amount_paise: v.amountPaise, p_tds_paise: v.tdsPaise, p_paid_on: v.paidOn,
    p_method: v.method, p_reference: v.reference, p_note: v.note,
  })
  return error ? fail(error) : { ok: true, data: data as { report_id: string; balance_paise: number } }
}
export async function brandRequestExperience(v: RequestInput): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('brand_experience_request', requestArgs(v))
  return error ? fail(error) : { ok: true, data: data as string }
}
export async function brandAnswerQuote(quoteId: string, accept: boolean, note: string | null): Promise<Result<null>> {
  const { error } = await createClient().rpc('brand_experience_quote_answer', { p_quote_id: quoteId, p_accept: accept, p_note: note })
  return error ? fail(error) : { ok: true, data: null }
}
/** 0548: accept several shared creators at once (accept only; all or nothing). */
export async function brandAcceptRosterMany(experienceId: string, items: { roster_id: string; expected: string }[]): Promise<Result<number>> {
  const { data, error } = await createClient().rpc('brand_experience_roster_accept_many', { p_experience_id: experienceId, p_items: items })
  return error ? fail(error) : { ok: true, data: Number(data ?? 0) }
}

/** 0558: a creator the brand suggested who is not on Guapd yet, and where it stands. */
export interface BrandSuggestion {
  id: string; full_name: string; handle: string; note: string | null; created_at: string
  status: 'open' | 'prospect' | 'on_roster' | 'not_possible'; reason: string | null
}
export async function getBrandSuggestions(experienceId: string): Promise<Result<BrandSuggestion[]>> {
  const { data, error } = await createClient().rpc('brand_experience_suggestions', { p_experience_id: experienceId })
  return error ? fail(error) : { ok: true, data: (data ?? []) as BrandSuggestion[] }
}
export async function brandSuggestCreator(experienceId: string, fullName: string, handle: string, note: string | null): Promise<Result<string>> {
  const { data, error } = await createClient().rpc('brand_experience_suggest_creator', { p_experience_id: experienceId, p_full_name: fullName, p_handle: handle, p_note: note })
  return error ? fail(error) : { ok: true, data: data as string }
}

/** 0557: the brand names creators for its own roster (shared and accepted). */
export async function brandAddRosterCreators(experienceId: string, creatorIds: string[]): Promise<Result<number>> {
  const { data, error } = await createClient().rpc('brand_experience_roster_add', { p_experience_id: experienceId, p_creator_ids: creatorIds })
  return error ? fail(error) : { ok: true, data: Number(data ?? 0) }
}
export async function brandDecideRoster(rosterId: string, decision: 'accepted' | 'rejected' | 'on_hold', expected: string): Promise<Result<null>> {
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

// ── 0550: the brand ↔ Guapd thread (functions only, through the brand gate) ──
export interface BrandGuapdMessage { id: string; from: 'brand' | 'guapd'; body: string; created_at: string; sender_name: string | null }
/** Reading it marks it read for this member. */
export async function getBrandGuapdThread(id: string): Promise<Result<BrandGuapdMessage[]>> {
  const { data, error } = await createClient().rpc('brand_experience_messages', { p_experience_id: id })
  return error ? fail(error) : { ok: true, data: ((data as { messages: BrandGuapdMessage[] }).messages ?? []) }
}
export async function brandSendToGuapd(id: string, body: string): Promise<Result<{ id: string; body: string; created_at: string }>> {
  const { data, error } = await createClient().rpc('brand_experience_message_send', { p_experience_id: id, p_body: body })
  return error ? fail(error) : { ok: true, data: data as { id: string; body: string; created_at: string } }
}
export async function brandGuapdUnread(id: string): Promise<number> {
  const { data, error } = await createClient().rpc('brand_experience_messages_unread', { p_experience_id: id })
  return error ? 0 : Number(data ?? 0)
}

// ── 0554: add-ons to the agreed price ──────────────────────────────────────
export interface BrandAddon {
  id: string; number: number; status: 'open' | 'accepted' | 'declined' | 'withdrawn'
  deliverables: { type: string; count: number }[]; videos: number; per_video_paise: number
  extras: { label: string; amount_paise: number }[]; total_paise: number; message: string | null
  brand_note: string | null; decided_at: string | null; on_guapd: boolean; created_at: string
}
export async function getBrandAddons(experienceId: string): Promise<Result<{ addons: BrandAddon[]; agreed_total_paise: number | null }>> {
  const { data, error } = await createClient().rpc('brand_experience_addons', { p_experience_id: experienceId })
  return error ? fail(error) : { ok: true, data: data as { addons: BrandAddon[]; agreed_total_paise: number | null } }
}
export async function brandAnswerAddon(addonId: string, accept: boolean, note: string | null, expectedTotalPaise: number): Promise<Result<null>> {
  const { error } = await createClient().rpc('brand_experience_addon_answer', { p_addon_id: addonId, p_accept: accept, p_note: note, p_expected_total_paise: expectedTotalPaise })
  return error ? fail(error) : { ok: true, data: null }
}

/** 0561: the brand's collab posts (no creator or deal ids; shared videos and taken-back ones are not shown). */
export interface BrandCollabPost {
  id: string; creator_name: string; handle: string | null; label: string; status: 'sent' | 'posted' | 'ad_complete'
  sent_at: string; post_url: string | null; posted_at: string | null
  affiliate_url: string | null; affiliate_at: string | null; affiliate_on_guapd: boolean | null
  ad_complete_at: string | null; ad_complete_on_guapd: boolean | null; can_act: boolean
  /** 0574: the creator's partnership ad code. */
  ad_code: string | null; ad_code_at: string | null
}
export async function getBrandCollabPosts(experienceId: string): Promise<Result<BrandCollabPost[]>> {
  const { data, error } = await createClient().rpc('brand_experience_collab_posts', { p_experience_id: experienceId })
  return error ? fail(error) : { ok: true, data: (data ?? []) as BrandCollabPost[] }
}
export async function brandCollabAct(postId: string, action: 'affiliate' | 'ad_complete', url: string | null): Promise<Result<null>> {
  const { error } = await createClient().rpc('brand_experience_collab_act', { p_post_id: postId, p_action: action, p_url: url })
  return error ? fail(error) : { ok: true, data: null }
}


/** 0576: a collab post's verified numbers (performance only: no pay, cost or margin exists in it). */
export type PostMetrics = { reach?: number; views?: number; likes?: number; comments?: number; saved?: number; shares?: number; totalInteractions?: number }
export type BrandPostPerformance = {
  post_id: string; creator_name: string; handle: string | null; label: string
  post_url: string; posted_at: string
  match_status: 'pending' | 'resolved' | 'not_found' | 'not_connected' | 'unsupported'
  metrics: PostMetrics | null; thumbnail_url: string | null; synced_at: string | null
}
export async function getBrandPostPerformance(experienceId: string): Promise<Result<BrandPostPerformance[]>> {
  const { data, error } = await createClient().rpc('brand_experience_post_performance', { p_experience_id: experienceId })
  return error ? fail(error) : { ok: true, data: (data ?? []) as BrandPostPerformance[] }
}
export type BrandExperiencePostOverview = {
  experience_id: string; experience_title: string | null; creator_name: string; label: string
  posted_at: string; metrics: PostMetrics | null; thumbnail_url: string | null
}
/** 0576: verified Experience posts across the brand, posted in [from, to]. */
export async function getBrandExperiencePostsOverview(fromISO: string, toISO: string): Promise<Result<BrandExperiencePostOverview[]>> {
  const { data, error } = await createClient().rpc('brand_experience_posts_overview', { p_from: fromISO, p_to: toISO })
  return error ? fail(error) : { ok: true, data: (data ?? []) as BrandExperiencePostOverview[] }
}
