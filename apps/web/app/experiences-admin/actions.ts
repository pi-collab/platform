'use server'

import { revalidatePath } from 'next/cache'
import { experienceStaffGate } from '@/lib/experience-staff-auth'
import {
  acceptConsoleQuote, addConsoleQuote, createConsoleExperience,
  rosterAdd, rosterDecide, rosterLock, rosterNote, rosterPlan, rosterRemove,
  listConsoleLegs, legDraft, legSend, setCreatorDayRateAsStaff, setCreatorBrief,
  addConsoleCost, updateConsoleCost, removeConsoleCost, completeConsoleExperience, reopenConsoleExperience,
  scheduleConsoleShoot, recordShootOutcome, undoShootOutcome, withdrawConsoleLeg,
  itemUploadSlot, attachConsoleItem, reviewConsoleItem, consoleItemFile,
  releaseConsoleItems, withdrawConsoleRelease, decideConsoleRelease,
  setFinanceSettings, setBrandBilling, financeUploadSlot, consoleFinanceFile,
  draftConsoleInvoice, updateConsoleInvoice, discardConsoleInvoice, issueConsoleInvoice, consoleInvoiceDoc,
  consoleInvoicePdfPath, setConsoleInvoicePdf, voidConsoleInvoice, addInvoicePayment, reverseInvoicePayment,
  getConsolePayouts, requestPayout, setPayoutTds, approvePayout, markPayoutPaid, cancelPayout,
  recordBrandSignoff, clearBrandSignoff,
  addProspect, updateProspect, setProspectStatus, decideProspect, dropProspect, linkProspect, type ProspectInput,
  acceptCounter, declineCounter, sendCounter, withdrawGuapdCounter, getPayoutAccount, type PayoutAccount,
  type FinanceUploadKind, type FinanceFileKind, type InvoiceDraftInput,
  type CostInput,
  type ConsoleDeliverable, type ConsoleLegsReconcile,
} from '@/lib/experience-console-server'
import { creatorLegTerms, costLineTotalPaise } from '@/lib/experience-money'
import { notifyCreatorLegOffer } from '@/lib/experience-leg-notify'
import { notifyBrandDeliverablesShared, notifyCreatorItemReviewed, notifyCreatorLegWithdrawn } from '@/lib/experience-deliverables-notify'
import { notifyBrandInvoiceIssued, notifyCreatorPaid, notifyStaffPayoutToApprove } from '@/lib/experience-money-notify'
import { renderInvoicePdf, type InvoiceDoc } from '@/lib/invoice-pdf'
import { notifyCreatorCounter } from '@/lib/experience-counter-notify'
import { createAdminClient } from '@/lib/supabase/admin'
import { DELIVERABLE_TYPES, isChannel, isVideoType, rupeesToPaise } from '@/lib/experience-request'

/**
 * Staff console writes. Each one passes experienceStaffGate (ops admin +
 * operational access) and then calls a database function with the user's own
 * session, which checks access AGAIN, enforces the quote and status rules, and
 * writes the ops_events row in the same transaction (migration 0530).
 *
 * Inputs are checked here for friendly messages; the database is the authority.
 */
type Out<T = null> = { ok: true; data: T } | { ok: false; error: string }
const BASE = '/experiences-admin'

async function gate(): Promise<{ ok: false; error: string } | null> {
  const g = await experienceStaffGate()
  return g.ok ? null : { ok: false, error: 'Guapd Experiences is for the Guapd team.' }
}

const cleanText = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}
const isoDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
const months = (on: boolean, v: unknown) => {
  if (!on) return null
  const n = Number(v)
  return Number.isInteger(n) && n > 0 && n <= 60 ? n : null
}
function deliverables(raw: unknown): ConsoleDeliverable[] | null {
  if (!Array.isArray(raw)) return null
  const out: ConsoleDeliverable[] = []
  for (const d of raw) {
    const type = typeof d?.type === 'string' && (DELIVERABLE_TYPES as readonly string[]).includes(d.type) ? d.type : null
    const count = Number(d?.count)
    if (!type || !Number.isInteger(count) || count <= 0 || count > 1000) return null
    out.push({ type, count })
  }
  return out
}

export interface NewRequestForm {
  brandId: string
  title: string
  creatorCount: number | string
  /** Per creator. */
  deliverables: { type: string; count: number | string }[]
  affiliate: boolean
  affiliatePerCreator: number | string | null
  adRights: boolean
  /** blank = all of each creator's videos */
  adRightsPerCreator: number | string | null
  adRightsMonths: number | string | null
  boost: boolean
  boostPerCreator: number | string | null
  boostMonths: number | string | null
  location: string
  dateFrom: string
  dateTo: string
  brief: string
  channel: string
}

export async function recordExperienceRequest(f: NewRequestForm): Promise<Out<string>> {
  const refused = await gate(); if (refused) return refused
  const items = deliverables(f.deliverables)
  if (!items || items.length === 0) return { ok: false, error: 'Add at least one deliverable per creator, with a count above zero.' }
  const creators = Number(f.creatorCount)
  if (!Number.isInteger(creators) || creators <= 0 || creators > 500) return { ok: false, error: 'Say how many creators the brand wants.' }
  const videos = items.filter((i) => isVideoType(i.type)).reduce((n, i) => n + i.count, 0)
  const perCreator = (on: boolean, v: unknown, label: string, required: boolean): { ok: true; n: number | null } | { ok: false; error: string } => {
    if (!on) return { ok: true, n: null }
    const raw = String(v ?? '').trim()
    if (!raw) return required ? { ok: false, error: `Say how many of each creator's videos ${label}.` } : { ok: true, n: null }
    const n = Number(raw)
    if (!Number.isInteger(n) || n <= 0) return { ok: false, error: `The number of videos ${label} must be a whole number above zero.` }
    if (n > videos) return { ok: false, error: `Each creator makes ${videos} video${videos === 1 ? '' : 's'}, so at most ${videos} can be counted for this.` }
    return { ok: true, n }
  }
  const aff = perCreator(!!f.affiliate, f.affiliatePerCreator, 'carry the affiliate link', true); if (!aff.ok) return aff
  const ads = perCreator(!!f.adRights, f.adRightsPerCreator, 'the ad rights cover', false); if (!ads.ok) return ads
  const bst = perCreator(!!f.boost, f.boostPerCreator, 'boost covers', false); if (!bst.ok) return bst
  if (!isChannel(f.channel)) return { ok: false, error: 'Say how the request arrived.' }
  const title = cleanText(f.title, 140)
  if (!title) return { ok: false, error: 'Give the Experience a title.' }
  if (f.adRights && months(true, f.adRightsMonths) === null) return { ok: false, error: 'Ad rights need a number of months.' }
  if (f.boost && months(true, f.boostMonths) === null) return { ok: false, error: 'Boost needs a number of months.' }
  const dateFrom = isoDate(f.dateFrom), dateTo = isoDate(f.dateTo)
  if (dateFrom && dateTo && dateTo < dateFrom) return { ok: false, error: 'The date window ends before it starts.' }

  const r = await createConsoleExperience({
    brandId: f.brandId, title, creatorCount: creators, deliverables: items,
    affiliate: !!f.affiliate, affiliatePerCreator: aff.n,
    adRights: !!f.adRights, adRightsPerCreator: ads.n, adRightsMonths: months(!!f.adRights, f.adRightsMonths),
    boost: !!f.boost, boostPerCreator: bst.n, boostMonths: months(!!f.boost, f.boostMonths),
    location: cleanText(f.location, 120), dateFrom, dateTo, brief: cleanText(f.brief, 4000), channel: f.channel,
  })
  if (!r.ok) return r
  revalidatePath(BASE)
  return r
}

export interface QuoteForm {
  experienceId: string
  proposedBy: 'guapd' | 'brand'
  perVideo: string
  count: number | string
  misc: string
  shootDate: string
  shootCity: string
  message: string
  channel: string
  deliverables: { type: string; count: number | string }[]
}

export async function submitQuote(f: QuoteForm): Promise<Out<string>> {
  const refused = await gate(); if (refused) return refused
  if (f.proposedBy !== 'guapd' && f.proposedBy !== 'brand') return { ok: false, error: 'Unknown quote type.' }
  const perVideo = rupeesToPaise(f.perVideo)
  if (!perVideo || perVideo <= 0) return { ok: false, error: 'Enter a price per video, in rupees.' }
  const count = Number(f.count)
  if (!Number.isInteger(count) || count <= 0) return { ok: false, error: 'Enter how many videos.' }
  const misc = f.misc?.trim() ? rupeesToPaise(f.misc) : 0
  if (misc === null) return { ok: false, error: 'Extras must be an amount in rupees.' }
  const channel = isChannel(f.channel) ? f.channel : null
  if (f.proposedBy === 'brand' && !channel) return { ok: false, error: 'Say how the brand sent its counter.' }

  const r = await addConsoleQuote({
    experienceId: f.experienceId, proposedBy: f.proposedBy, perVideoPaise: perVideo, deliverableCount: count,
    miscPaise: misc, deliverables: deliverables(f.deliverables) ?? [], shootDate: isoDate(f.shootDate),
    shootCity: cleanText(f.shootCity, 120), message: cleanText(f.message, 2000), channel,
  })
  if (!r.ok) return r
  revalidatePath(`${BASE}/${f.experienceId}`)
  return r
}

export async function acceptQuote(experienceId: string, quoteId: string, channel: string | null): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  const r = await acceptConsoleQuote(quoteId, isChannel(channel) ? channel : null)
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`)
  revalidatePath(BASE)
  return r
}

// ── Stage 3a: roster ───────────────────────────────────────────────────────
// The database enforces the rules (bookable creators only, never the house
// account; locked entries frozen; lock needs every decision and a reconciled
// total) and audits each change. These only check the gate and tidy inputs.

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

export async function addToRoster(experienceId: string, creatorIds: string[], addedBy: 'guapd' | 'brand', channel: string | null): Promise<{ error?: string | null }> {
  const refused = await gate(); if (refused) return { error: refused.error }
  if (!isUuid(experienceId) || !Array.isArray(creatorIds) || !creatorIds.every(isUuid)) return { error: 'Pick at least one creator.' }
  if (addedBy === 'brand' && !isChannel(channel)) return { error: 'Say how the brand suggested them.' }
  const r = await rosterAdd(experienceId, creatorIds, addedBy === 'brand' ? 'brand' : 'guapd', addedBy === 'brand' ? channel : null)
  if (!r.ok) return { error: r.error }
  revalidatePath(`${BASE}/${experienceId}`)
  return { error: null }
}

export async function recordRosterDecision(experienceId: string, rosterId: string, decision: 'accepted' | 'rejected' | 'pending', channel: string | null): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!['accepted', 'rejected', 'pending'].includes(decision)) return { ok: false, error: 'Unknown decision.' }
  if (decision !== 'pending' && !isChannel(channel)) return { ok: false, error: 'Say how the brand told us.' }
  const r = await rosterDecide(rosterId, decision, decision === 'pending' ? null : channel)
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`)
  return r
}

export async function setRosterPlan(experienceId: string, rosterId: string, items: { type: string; count: number | string }[]): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  const parsed: ConsoleDeliverable[] = []
  for (const i of items ?? []) {
    const count = Number(i.count)
    if (!(DELIVERABLE_TYPES as readonly string[]).includes(i.type) || !Number.isInteger(count) || count < 0 || count > 1000) {
      return { ok: false, error: 'Each deliverable needs a type and a whole-number count.' }
    }
    if (count > 0) parsed.push({ type: i.type, count })
  }
  const r = await rosterPlan(rosterId, parsed)
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`)
  return r
}

export async function setRosterNote(experienceId: string, rosterId: string, note: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  const r = await rosterNote(rosterId, String(note ?? '').slice(0, 4000))
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`)
  return r
}

export async function removeFromRoster(experienceId: string, rosterId: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  const r = await rosterRemove(rosterId)
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`)
  return r
}

export async function lockRoster(experienceId: string): Promise<Out<number>> {
  const refused = await gate(); if (refused) return refused
  const r = await rosterLock(experienceId)
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`)
  revalidatePath(BASE)
  return r
}

// ── Stage 3b: creator legs ─────────────────────────────────────────────────
// The database enforces every rule (Confirmed only; locked, accepted creators
// only; the creator's own active day rate; the ceiling against what was sold,
// including affiliate; frozen once sent) and audits each change. Money is
// computed HERE by the money module (creatorLegTerms) and passed in as the
// expected figures; the send function re-derives day rate, track and every
// amount itself and refuses a mismatch, so neither side can drift alone.

const legDays = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 && n <= 365 && Math.abs(Math.round(n * 100) - n * 100) < 1e-6 ? n : null
}

export interface LegDraftForm {
  rosterId: string
  productId: string | null
  days: number | string | null
  deliverables: { type: string; count: number | string }[]
  affiliateCount: number | string
  /** 0542: a day rate entered on this deal (rupees) while the creator has no active rate. */
  enteredRate?: number | string | null
}

export async function draftCreatorLeg(experienceId: string, f: LegDraftForm): Promise<Out<ConsoleLegsReconcile>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(f.rosterId)) return { ok: false, error: 'Unknown creator.' }
  if (f.productId !== null && !isUuid(f.productId)) return { ok: false, error: 'Pick the creator\'s shoot day rate.' }
  const enteredPaise = f.enteredRate == null || f.enteredRate === '' ? null : rupeesToPaise(String(f.enteredRate))
  if (f.enteredRate != null && f.enteredRate !== '' && (enteredPaise == null || enteredPaise <= 0 || enteredPaise % 100 !== 0)) return { ok: false, error: 'Enter the day rate in whole rupees.' }
  if (enteredPaise != null && f.productId) return { ok: false, error: 'Use their day rate or enter one, not both.' }
  const days = f.days === null || f.days === '' ? null : legDays(f.days)
  if (f.days !== null && f.days !== '' && days === null) return { ok: false, error: 'Days must be more than 0, at most 365, with at most two decimals (e.g. 1.5).' }
  const items = deliverables(f.deliverables)
  if (!items || items.length === 0) return { ok: false, error: 'Give this creator at least one deliverable.' }
  const aff = Number(f.affiliateCount)
  if (!Number.isInteger(aff) || aff < 0) return { ok: false, error: 'Affiliate is a count of this creator\'s videos (0 for none).' }
  const r = await legDraft(f.rosterId, enteredPaise != null ? null : f.productId, days, items, aff, enteredPaise)
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`)
  return r
}

/** Send one creator their deal, or several ("Send all ready"). */
export async function sendCreatorLegs(experienceId: string, rosterIds: string[]): Promise<Out<{ sent: number; failed: { rosterId: string; error: string }[] }>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !Array.isArray(rosterIds) || rosterIds.length === 0 || !rosterIds.every(isUuid)) return { ok: false, error: 'Pick a creator to send.' }
  const legs = await listConsoleLegs(experienceId)
  if (!legs.ok) return legs
  let sent = 0
  const failed: { rosterId: string; error: string }[] = []
  for (const id of rosterIds) {
    const row = legs.data.find((l) => l.roster_id === id)
    if (!row) { failed.push({ rosterId: id, error: 'Not a locked, accepted creator on this Experience.' }); continue }
    if (row.leg_deal_id) { failed.push({ rosterId: id, error: 'Already sent.' }); continue }
    // 0542: their active package rate, or a rate entered on this deal while they have none active.
    const rateP = row.leg_entered_rate_paise != null ? row.leg_entered_rate_paise : row.leg_product_id ? row.day_rate_paise : null
    if (rateP == null || row.leg_days == null) {
      failed.push({ rosterId: id, error: `${row.full_name}: pick the day rate (or enter one) and days first.` }); continue
    }
    if (row.leg_entered_rate_paise == null && row.leg_product_id !== row.day_rate_product_id) {
      failed.push({ rosterId: id, error: `${row.full_name}: their day rate changed. Pick it again.` }); continue
    }
    const t = creatorLegTerms({ dayRatePaise: rateP, days: row.leg_days, track: row.track })
    const r = await legSend(id, { grossPaise: t.creatorGrossPaise, platformPct: t.platformPct, netPaise: t.creatorNetPaise })
    if (!r.ok) { failed.push({ rosterId: id, error: `${row.full_name}: ${r.error}` }); continue }
    sent++
    await notifyCreatorLegOffer(r.data)
  }
  revalidatePath(`${BASE}/${experienceId}`)
  return { ok: true, data: { sent, failed } }
}

export async function setDayRateForCreator(experienceId: string, creatorId: string, rupees: number | string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(creatorId)) return { ok: false, error: 'Unknown creator.' }
  const paise = rupeesToPaise(String(rupees))
  if (!paise || paise <= 0 || paise % 100 !== 0) return { ok: false, error: 'Enter the day rate in whole rupees.' }
  const r = await setCreatorDayRateAsStaff(creatorId, paise)
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`)
  return { ok: true, data: null }
}

export async function saveCreatorBrief(experienceId: string, brief: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId)) return { ok: false, error: 'Unknown Experience.' }
  const r = await setCreatorBrief(experienceId, typeof brief === 'string' ? brief : '')
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`)
  return r
}

// ── Stage 3c: cost sheet, complete, reopen ─────────────────────────────────
// The database validates every field, computes a per-unit total itself and
// refuses a different one, refuses creator-pay categories, refuses changes to
// a Complete Experience, and audits each write. These tidy inputs and check
// the gate. Reopen additionally needs financial access, checked in Postgres.

export interface CostForm {
  label: string
  category: string
  basis: 'per_unit' | 'flat_total'
  quantity: string | number | null
  unitRate: string | number | null
  total: string | number | null
  providedBy: 'guapd' | 'brand' | 'creator'
  creatorLegDealId: string | null
  note: string | null
}

function costInput(f: CostForm): CostInput | string {
  const label = cleanText(f.label, 120)
  if (!label) return 'Give the cost a label.'
  if (typeof f.category !== 'string' || !f.category) return 'Pick a category.'
  if (f.providedBy !== 'guapd' && f.providedBy !== 'brand' && f.providedBy !== 'creator') return 'Say who provides it.'
  if (f.creatorLegDealId !== null && !isUuid(f.creatorLegDealId)) return 'Unknown creator.'
  const note = cleanText(f.note, 1000)
  if (f.basis === 'per_unit') {
    const quantity = Number(f.quantity)
    const unitRatePaise = rupeesToPaise(String(f.unitRate ?? ''))
    if (!(quantity > 0) || Math.abs(Math.round(quantity * 100) - quantity * 100) > 1e-6) return 'Quantity must be more than 0, with at most two decimals.'
    if (unitRatePaise === null) return 'Enter the rate in rupees.'
    let totalPaise: number
    try { totalPaise = costLineTotalPaise({ quantity, unitRatePaise }) } catch { return 'Check the quantity and rate.' }
    return { label, category: f.category, basis: 'per_unit', quantity, unitRatePaise, totalPaise, providedBy: f.providedBy, creatorLegDealId: f.creatorLegDealId, note }
  }
  if (f.basis === 'flat_total') {
    const totalPaise = rupeesToPaise(String(f.total ?? ''))
    if (totalPaise === null) return 'Enter the amount in rupees.'
    return { label, category: f.category, basis: 'flat_total', quantity: null, unitRatePaise: null, totalPaise, providedBy: f.providedBy, creatorLegDealId: f.creatorLegDealId, note }
  }
  return 'Pick per unit or a flat amount.'
}

export async function addCost(experienceId: string, f: CostForm): Promise<Out<string>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId)) return { ok: false, error: 'Unknown Experience.' }
  const c = costInput(f); if (typeof c === 'string') return { ok: false, error: c }
  const r = await addConsoleCost(experienceId, c)
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`)
  return r
}

export async function editCost(experienceId: string, costId: string, f: CostForm, expectedUpdatedAt: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(costId)) return { ok: false, error: 'Unknown cost line.' }
  const c = costInput(f); if (typeof c === 'string') return { ok: false, error: c }
  const r = await updateConsoleCost(costId, c, String(expectedUpdatedAt))
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`)
  return r
}

export async function removeCost(experienceId: string, costId: string, reason: string, expectedUpdatedAt: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(costId)) return { ok: false, error: 'Unknown cost line.' }
  const why = cleanText(reason, 300)
  if (!why || why.length < 3) return { ok: false, error: 'Say why it is being removed.' }
  const r = await removeConsoleCost(costId, why, String(expectedUpdatedAt))
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`)
  return r
}

export async function completeExperience(experienceId: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId)) return { ok: false, error: 'Unknown Experience.' }
  const r = await completeConsoleExperience(experienceId)
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`); revalidatePath(BASE)
  return r
}

export async function reopenExperience(experienceId: string, reason: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId)) return { ok: false, error: 'Unknown Experience.' }
  const why = cleanText(reason, 300)
  if (!why || why.length < 3) return { ok: false, error: 'Say why it is being reopened.' }
  const r = await reopenConsoleExperience(experienceId, why)
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`); revalidatePath(BASE)
  return r
}


// ── 0538: the shoot, deliverables, releasing them to the brand ────────────
// Every rule (status, who provides, versions, what the brand may see) is in
// the database functions, called with the staff member's own session. The
// service role is used only to sign storage URLs for a path the database has
// just authorised for this caller.

const why = (v: unknown) => { const t = cleanText(v, 300); return t && t.length >= 3 ? t : null }

export async function scheduleShoot(experienceId: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId)) return { ok: false, error: 'Unknown Experience.' }
  const r = await scheduleConsoleShoot(experienceId)
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`); revalidatePath(BASE)
  return r
}

export async function setShootOutcome(experienceId: string, rosterId: string, outcome: 'done' | 'did_not_shoot', reason: string | null): Promise<Out<string>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(rosterId)) return { ok: false, error: 'Unknown creator.' }
  if (outcome !== 'done' && outcome !== 'did_not_shoot') return { ok: false, error: 'Say whether they shot.' }
  const reasonText = outcome === 'did_not_shoot' ? why(reason) : null
  if (outcome === 'did_not_shoot' && !reasonText) return { ok: false, error: 'Say why they did not shoot.' }
  const r = await recordShootOutcome(rosterId, outcome, reasonText)
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`); revalidatePath(BASE)
  return r
}

export async function undoShoot(experienceId: string, rosterId: string, reason: string): Promise<Out<string>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(rosterId)) return { ok: false, error: 'Unknown creator.' }
  const reasonText = why(reason); if (!reasonText) return { ok: false, error: 'Say why it is being undone.' }
  const r = await undoShootOutcome(rosterId, reasonText)
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`); revalidatePath(BASE)
  return r
}

export async function withdrawLeg(experienceId: string, rosterId: string, dealId: string, reason: string): Promise<Out<string>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(rosterId) || !isUuid(dealId)) return { ok: false, error: 'Unknown creator.' }
  const reasonText = why(reason); if (!reasonText) return { ok: false, error: 'Say why it is being withdrawn.' }
  const r = await withdrawConsoleLeg(rosterId, reasonText)
  if (!r.ok) return r
  await notifyCreatorLegWithdrawn(dealId)
  revalidatePath(`${BASE}/${experienceId}`); revalidatePath(BASE)
  return r
}

/** Where to upload a file for a deliverable: the database picks the path, the service role signs an upload for exactly that path. */
export async function startItemUpload(itemId: string, fileName: string): Promise<Out<{ path: string; token: string }>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(itemId) || typeof fileName !== 'string') return { ok: false, error: 'Unknown deliverable.' }
  const slot = await itemUploadSlot(itemId, fileName.slice(0, 200))
  if (!slot.ok) return slot
  const { data, error } = await createAdminClient().storage.from('deliverables').createSignedUploadUrl(slot.data)
  if (error || !data) return { ok: false, error: 'Could not start the upload. Try again.' }
  return { ok: true, data: { path: data.path, token: data.token } }
}

export async function attachItem(experienceId: string, itemId: string, c: { url?: string | null; storagePath?: string | null; fileName?: string | null }): Promise<Out<number>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(itemId)) return { ok: false, error: 'Unknown deliverable.' }
  const url = cleanText(c.url, 2000)
  const storagePath = cleanText(c.storagePath, 600)
  if (!url === !storagePath) return { ok: false, error: 'Add a link or a file.' }
  if (url && !/^https?:\/\/\S+$/i.test(url)) return { ok: false, error: 'The link must start with https://' }
  const r = await attachConsoleItem(itemId, { url, storagePath, fileName: storagePath ? cleanText(c.fileName, 200) : null })
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`)
  return r
}

export async function reviewItem(experienceId: string, itemId: string, decision: 'approve' | 'revision', note: string | null): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(itemId)) return { ok: false, error: 'Unknown deliverable.' }
  if (decision !== 'approve' && decision !== 'revision') return { ok: false, error: 'Approve, or ask for changes.' }
  const n = cleanText(note, 1000)
  if (decision === 'revision' && (!n || n.length < 3)) return { ok: false, error: 'Say what needs to change.' }
  const r = await reviewConsoleItem(itemId, decision, decision === 'revision' ? n : null)
  if (!r.ok) return r
  const { data: item } = await createAdminClient().from('deal_deliverable_items').select('deal_id, label').eq('id', itemId).maybeSingle()
  if (item) await notifyCreatorItemReviewed(item.deal_id, item.label, decision)
  revalidatePath(`${BASE}/${experienceId}`)
  return r
}

/** A short-lived link to the file on a deliverable, for staff to check it. */
export async function openItemFile(itemId: string): Promise<Out<string>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(itemId)) return { ok: false, error: 'Unknown deliverable.' }
  const f = await consoleItemFile(itemId)
  if (!f.ok) return f
  const { data, error } = await createAdminClient().storage.from('deliverables').createSignedUrl(f.data.storage_path, 600)
  if (error || !data) return { ok: false, error: 'Could not open the file.' }
  return { ok: true, data: data.signedUrl }
}

export async function releaseItems(experienceId: string, itemIds: string[]): Promise<Out<{ released: number }>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !Array.isArray(itemIds) || itemIds.length === 0 || itemIds.length > 200 || !itemIds.every(isUuid)) {
    return { ok: false, error: 'Pick what to share.' }
  }
  const r = await releaseConsoleItems(experienceId, Array.from(new Set(itemIds)))
  if (!r.ok) return r
  await notifyBrandDeliverablesShared(experienceId, r.data.released)
  revalidatePath(`${BASE}/${experienceId}`); revalidatePath(BASE); revalidatePath(`/experiences/${experienceId}`)
  return { ok: true, data: { released: r.data.released } }
}

export async function withdrawRelease(experienceId: string, releaseId: string, reason: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(releaseId)) return { ok: false, error: 'Unknown deliverable.' }
  const reasonText = why(reason); if (!reasonText) return { ok: false, error: 'Say why it is being withdrawn.' }
  const r = await withdrawConsoleRelease(releaseId, reasonText)
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`); revalidatePath(`/experiences/${experienceId}`)
  return r
}

export async function recordBrandDecision(experienceId: string, releaseId: string, decision: 'approved' | 'changes_requested', channel: string, note: string | null): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(releaseId)) return { ok: false, error: 'Unknown deliverable.' }
  if (decision !== 'approved' && decision !== 'changes_requested') return { ok: false, error: 'Approved, or changes requested.' }
  if (!isChannel(channel) || channel === 'portal') return { ok: false, error: 'Say how the brand told us.' }
  const n = cleanText(note, 1000)
  if (decision === 'changes_requested' && (!n || n.length < 3)) return { ok: false, error: 'Write down what the brand asked to change.' }
  const r = await decideConsoleRelease(releaseId, decision, channel, n)
  if (!r.ok) return r
  revalidatePath(`${BASE}/${experienceId}`); revalidatePath(`/experiences/${experienceId}`)
  return r
}


// ── 0540: invoices (finance), payouts (operational), completion ───────────
// The database decides access on every call: financial for invoices, payments
// and billing details; operational for payouts, sign-offs and Complete. The
// service role is used only for storage: to sign an upload slot or a short
// link for a path a database function has just returned to this caller, and to
// store the invoice PDF at the path the database names.

const FINANCE_BUCKET = 'finance-docs'
const PAY_METHODS = ['bank_transfer', 'upi', 'cheque', 'cash', 'other'] as const
const PAYOUT_METHODS = ['bank_transfer', 'upi', 'other'] as const
const SIGNOFF_CHANNELS = ['whatsapp', 'email', 'call', 'in_person'] as const
const money = (v: unknown, allowZero = false): number | null => {
  const p = rupeesToPaise(typeof v === 'number' ? String(v) : (v as string))
  return p == null || (!allowZero && p <= 0) ? null : p
}
const pastOrToday = (v: unknown) => {
  const d = isoDate(v)
  if (!d) return null
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
  return d <= today ? d : null
}
const refresh = (experienceId: string) => { revalidatePath(`${BASE}/${experienceId}`); revalidatePath(`/experiences/${experienceId}`) }

export interface FinanceSettingsForm { legalName: string; address: string; state: string; gstin: string; gstRegistered: boolean; pan: string; paymentInstructions: string }
export async function saveFinanceSettings(experienceId: string, f: FinanceSettingsForm): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  const legalName = cleanText(f.legalName, 200), address = cleanText(f.address, 500), state = cleanText(f.state, 60)
  if (!legalName || !address || !state) return { ok: false, error: 'Legal name, address and state are required.' }
  if (typeof f.gstRegistered !== 'boolean') return { ok: false, error: 'Say whether Guapd is GST-registered.' }
  const gstin = cleanText(f.gstin, 15)?.toUpperCase() ?? null
  if (f.gstRegistered && !gstin) return { ok: false, error: 'A GST-registered business has a GSTIN.' }
  const r = await setFinanceSettings({ legalName, address, state, gstin, gstRegistered: f.gstRegistered, pan: cleanText(f.pan, 10)?.toUpperCase() ?? null, paymentInstructions: cleanText(f.paymentInstructions, 1000) })
  if (r.ok && isUuid(experienceId)) refresh(experienceId)
  return r
}

export interface BrandBillingForm { legalName: string; address: string; state: string; gstin: string; pan: string; certificatePath?: string | null }
export async function saveBrandBilling(experienceId: string, brandId: string, f: BrandBillingForm): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(brandId)) return { ok: false, error: 'Unknown brand.' }
  const legalName = cleanText(f.legalName, 200), address = cleanText(f.address, 500), state = cleanText(f.state, 60)
  if (!legalName || !address || !state) return { ok: false, error: 'Legal name, address and state are required.' }
  const r = await setBrandBilling(brandId, { legalName, address, state, gstin: cleanText(f.gstin, 15)?.toUpperCase() ?? null, pan: cleanText(f.pan, 10)?.toUpperCase() ?? null, certificatePath: cleanText(f.certificatePath, 600) })
  if (r.ok) refresh(experienceId)
  return r
}

/** An upload slot for a proof or certificate: the database names the path; the service role signs an upload for exactly it. */
export async function startFinanceUpload(kind: FinanceUploadKind, targetId: string, fileName: string): Promise<Out<{ path: string; token: string }>> {
  const refused = await gate(); if (refused) return refused
  if (!['invoice-payment', 'brand-certificate', 'payout-proof'].includes(kind) || !isUuid(targetId) || typeof fileName !== 'string') return { ok: false, error: 'Unknown upload.' }
  const slot = await financeUploadSlot(kind, targetId, fileName.slice(0, 200))
  if (!slot.ok) return slot
  const { data, error } = await createAdminClient().storage.from(FINANCE_BUCKET).createSignedUploadUrl(slot.data)
  if (error || !data) return { ok: false, error: 'Could not start the upload. Try again.' }
  return { ok: true, data: { path: data.path, token: data.token } }
}

/** A 10-minute link to an invoice PDF, payment proof, certificate or payout proof, after the database checks the caller. */
export async function openFinanceFile(kind: FinanceFileKind, id: string): Promise<Out<string>> {
  const refused = await gate(); if (refused) return refused
  if (!['invoice-pdf', 'invoice-payment', 'brand-certificate', 'payout-proof'].includes(kind) || !isUuid(id)) return { ok: false, error: 'Unknown file.' }
  const f = await consoleFinanceFile(kind, id)
  if (!f.ok) return f
  const { data, error } = await createAdminClient().storage.from(FINANCE_BUCKET).createSignedUrl(f.data, 600)
  if (error || !data) return { ok: false, error: 'Could not open the file.' }
  return { ok: true, data: data.signedUrl }
}

export interface InvoiceForm {
  kind: 'initial' | 'additional'; source: string | null; description: string; amount: string
  gstMode: 'none' | 'igst' | 'cgst_sgst'; gstRatePct: string; cgst: string; sgst: string; igst: string; dueDate: string
}
function invoiceInput(f: InvoiceForm): InvoiceDraftInput | string {
  if (f.kind !== 'initial' && f.kind !== 'additional') return 'Pick the invoice type.'
  const source = f.kind === 'additional' ? (f.source === 'existing_footage' || f.source === 'new_shoot' ? f.source : null) : null
  if (f.kind === 'additional' && !source) return 'Say what the additional invoice is for.'
  const description = cleanText(f.description, 300)
  if (!description || description.length < 3) return 'Describe the service.'
  const subtotalPaise = money(f.amount)
  if (subtotalPaise == null) return 'Enter the amount (before GST).'
  const rate = f.gstMode === 'none' ? null : Number(f.gstRatePct)
  if (rate != null && (!Number.isFinite(rate) || rate < 0 || rate > 28)) return 'Enter the GST rate.'
  const igst = f.gstMode === 'igst' ? money(f.igst) : null
  const cgst = f.gstMode === 'cgst_sgst' ? money(f.cgst) : null
  const sgst = f.gstMode === 'cgst_sgst' ? money(f.sgst) : null
  if (f.gstMode === 'igst' && igst == null) return 'Enter the IGST amount.'
  if (f.gstMode === 'cgst_sgst' && (cgst == null || sgst == null)) return 'Enter the CGST and SGST amounts.'
  const dueDate = f.dueDate ? isoDate(f.dueDate) : null
  if (f.dueDate && !dueDate) return 'Enter a valid due date.'
  return { kind: f.kind, source, description, subtotalPaise, gstRatePct: rate, cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst, dueDate }
}

export async function draftInvoice(experienceId: string, f: InvoiceForm): Promise<Out<string>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId)) return { ok: false, error: 'Unknown Experience.' }
  const input = invoiceInput(f)
  if (typeof input === 'string') return { ok: false, error: input }
  const r = await draftConsoleInvoice(experienceId, input)
  if (r.ok) refresh(experienceId)
  return r
}

export async function editInvoice(experienceId: string, invoiceId: string, f: InvoiceForm): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(invoiceId)) return { ok: false, error: 'Unknown invoice.' }
  const input = invoiceInput(f)
  if (typeof input === 'string') return { ok: false, error: input }
  const r = await updateConsoleInvoice(invoiceId, input)
  if (r.ok) refresh(experienceId)
  return r
}

export async function discardInvoice(experienceId: string, invoiceId: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(invoiceId)) return { ok: false, error: 'Unknown invoice.' }
  const r = await discardConsoleInvoice(invoiceId)
  if (r.ok) refresh(experienceId)
  return r
}

/** Render the frozen invoice and store it as its PDF (once). */
async function storeInvoicePdf(invoiceId: string): Promise<{ ok: true; doc: InvoiceDoc } | { ok: false; error: string }> {
  const doc = await consoleInvoiceDoc(invoiceId)
  if (!doc.ok) return doc
  const path = await consoleInvoicePdfPath(invoiceId)
  if (!path.ok) return path
  const bytes = renderInvoicePdf(doc.data as unknown as InvoiceDoc)
  const up = await createAdminClient().storage.from(FINANCE_BUCKET).upload(path.data, bytes, { contentType: 'application/pdf', upsert: false })
  if (up.error) return { ok: false, error: 'The invoice is issued, but its PDF could not be stored. Use "Create PDF" to try again.' }
  const set = await setConsoleInvoicePdf(invoiceId, path.data)
  if (!set.ok) return set
  return { ok: true, doc: doc.data as unknown as InvoiceDoc }
}

/** Issue: the database numbers and freezes it; then the PDF is stored and the brand is told. */
export async function issueInvoice(experienceId: string, invoiceId: string): Promise<Out<{ number: string; pdf: boolean; pdfError?: string }>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(invoiceId)) return { ok: false, error: 'Unknown invoice.' }
  const r = await issueConsoleInvoice(invoiceId)
  if (!r.ok) return r
  const pdf = await storeInvoicePdf(invoiceId)
  if (pdf.ok) {
    await notifyBrandInvoiceIssued(experienceId, { number: r.data, totalPaise: Number(pdf.doc.total_paise), dueDate: pdf.doc.due_date, title: pdf.doc.experience_title })
  }
  refresh(experienceId)
  return { ok: true, data: { number: r.data, pdf: pdf.ok, pdfError: pdf.ok ? undefined : pdf.error } }
}

/** Retry storing the PDF of an issued invoice that has none (and tell the brand then). */
export async function createInvoicePdf(experienceId: string, invoiceId: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(invoiceId)) return { ok: false, error: 'Unknown invoice.' }
  const pdf = await storeInvoicePdf(invoiceId)
  if (!pdf.ok) return pdf
  await notifyBrandInvoiceIssued(experienceId, { number: pdf.doc.number, totalPaise: Number(pdf.doc.total_paise), dueDate: pdf.doc.due_date, title: pdf.doc.experience_title })
  refresh(experienceId)
  return { ok: true, data: null }
}

export async function voidInvoice(experienceId: string, invoiceId: string, reason: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(invoiceId)) return { ok: false, error: 'Unknown invoice.' }
  const w = why(reason)
  if (!w) return { ok: false, error: 'Say why it is being voided.' }
  const r = await voidConsoleInvoice(invoiceId, w)
  if (r.ok) refresh(experienceId)
  return r
}

export interface PaymentForm { amount: string; tds: string; receivedOn: string; method: string; reference: string; proofPath: string }
export async function recordInvoicePayment(experienceId: string, invoiceId: string, f: PaymentForm): Promise<Out<{ settled: boolean }>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(invoiceId)) return { ok: false, error: 'Unknown invoice.' }
  const amountPaise = money(f.amount || '0', true), tdsPaise = money(f.tds || '0', true)
  if (amountPaise == null || tdsPaise == null || amountPaise + tdsPaise <= 0) return { ok: false, error: 'Enter the amount received (and TDS withheld, 0 if none).' }
  const receivedOn = pastOrToday(f.receivedOn)
  if (!receivedOn) return { ok: false, error: 'Enter the date it was received (not in the future).' }
  if (!(PAY_METHODS as readonly string[]).includes(f.method)) return { ok: false, error: 'Say how it was paid.' }
  const reference = cleanText(f.reference, 100)
  if (!reference || reference.length < 3) return { ok: false, error: 'Enter the payment reference (UTR, cheque number).' }
  const proofPath = cleanText(f.proofPath, 600)
  if (!proofPath) return { ok: false, error: 'Attach the payment proof.' }
  const r = await addInvoicePayment(invoiceId, { amountPaise, tdsPaise, receivedOn, method: f.method, reference, proofPath })
  if (!r.ok) return r
  refresh(experienceId)
  return { ok: true, data: { settled: r.data.settled } }
}

export async function reverseInvoicePaymentAction(experienceId: string, paymentId: string, reason: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(paymentId)) return { ok: false, error: 'Unknown payment.' }
  const w = why(reason)
  if (!w) return { ok: false, error: 'Say why it is being reversed.' }
  const r = await reverseInvoicePayment(paymentId, w)
  if (r.ok) refresh(experienceId)
  return r
}

export async function requestCreatorPayout(experienceId: string, dealId: string, tds: string): Promise<Out<string>> {
  const g = await experienceStaffGate()
  if (!g.ok) return { ok: false, error: 'Guapd Experiences is for the Guapd team.' }
  if (!isUuid(experienceId) || !isUuid(dealId)) return { ok: false, error: 'Unknown creator deal.' }
  const tdsPaise = money(tds || '0', true)
  if (tdsPaise == null) return { ok: false, error: 'Enter the TDS to withhold (0 if none).' }
  const r = await requestPayout(dealId, tdsPaise)
  if (!r.ok) return r
  const list = await getConsolePayouts(experienceId)
  const leg = list.ok ? list.data.legs.find((l) => l.deal_id === dealId) : null
  const { data: me } = await createAdminClient().from('users').select('id').eq('auth_id', g.user.id).maybeSingle()
  await notifyStaffPayoutToApprove(experienceId, leg?.full_name ?? 'a creator', me?.id ?? null)
  refresh(experienceId)
  return r
}

export async function setCreatorPayoutTds(experienceId: string, payoutId: string, tds: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(payoutId)) return { ok: false, error: 'Unknown payout.' }
  const tdsPaise = money(tds || '0', true)
  if (tdsPaise == null) return { ok: false, error: 'Enter the TDS to withhold (0 if none).' }
  const r = await setPayoutTds(payoutId, tdsPaise)
  if (r.ok) refresh(experienceId)
  return r
}

export async function approveCreatorPayout(experienceId: string, payoutId: string, confirmDetailsChanged = false): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(payoutId)) return { ok: false, error: 'Unknown payout.' }
  const r = await approvePayout(payoutId, confirmDetailsChanged === true)
  if (r.ok) refresh(experienceId)
  return r
}

export interface PayoutPaidForm { paidOn: string; method: string; reference: string; proofPath: string }
export async function recordCreatorPayoutPaid(experienceId: string, payoutId: string, f: PayoutPaidForm): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(payoutId)) return { ok: false, error: 'Unknown payout.' }
  const paidOn = pastOrToday(f.paidOn)
  if (!paidOn) return { ok: false, error: 'Enter the date it was paid (not in the future).' }
  if (!(PAYOUT_METHODS as readonly string[]).includes(f.method)) return { ok: false, error: 'Say how it was paid.' }
  const reference = cleanText(f.reference, 100)
  if (!reference || reference.length < 3) return { ok: false, error: 'Enter the payment reference (UTR).' }
  const proofPath = cleanText(f.proofPath, 600)
  if (!proofPath) return { ok: false, error: 'Attach the payment proof.' }
  const r = await markPayoutPaid(payoutId, { paidOn, method: f.method, reference, proofPath })
  if (!r.ok) return r
  const list = await getConsolePayouts(experienceId)
  const leg = list.ok ? list.data.legs.find((l) => l.payout?.id === payoutId) : null
  if (leg?.payout) await notifyCreatorPaid(leg.deal_id, { paidPaise: Number(leg.payout.net_amount_paise), reference, payoutId })
  refresh(experienceId)
  return r
}

export async function cancelCreatorPayout(experienceId: string, payoutId: string, reason: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(payoutId)) return { ok: false, error: 'Unknown payout.' }
  const w = why(reason)
  if (!w) return { ok: false, error: 'Say why it is being cancelled.' }
  const r = await cancelPayout(payoutId, w)
  if (r.ok) refresh(experienceId)
  return r
}

export async function saveBrandSignoff(experienceId: string, channel: string, note: string | null): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId)) return { ok: false, error: 'Unknown Experience.' }
  if (!(SIGNOFF_CHANNELS as readonly string[]).includes(channel)) return { ok: false, error: 'Say how the brand told us.' }
  const r = await recordBrandSignoff(experienceId, channel, cleanText(note, 500))
  if (r.ok) refresh(experienceId)
  return r
}

export async function clearBrandSignoffAction(experienceId: string, reason: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId)) return { ok: false, error: 'Unknown Experience.' }
  const w = why(reason)
  if (!w) return { ok: false, error: 'Say why it is being cleared.' }
  const r = await clearBrandSignoff(experienceId, w)
  if (r.ok) refresh(experienceId)
  return r
}


// ── 0541: creators not on Guapd yet ────────────────────────────────────────
// Recorded on the "Add creators" page; on the roster only once linked to their
// Guapd account. Nothing here messages anyone.

export interface ProspectForm { fullName: string; handle: string; phone: string; costBasis: string; dayRate: string; days: string; flat: string; note: string }
function prospectInput(f: ProspectForm): ProspectInput | string {
  const fullName = cleanText(f.fullName, 120)
  if (!fullName || fullName.length < 2) return 'Enter their name.'
  const handle = cleanText(f.handle, 100)
  if (!handle) return 'Enter their Instagram handle.'
  if (f.costBasis !== 'per_day' && f.costBasis !== 'flat') return 'Say how they are paid: a day rate or a flat fee.'
  let dayRatePaise: number | null = null, days: number | null = null, flatPaise: number | null = null
  if (f.costBasis === 'per_day') {
    dayRatePaise = rupeesToPaise(f.dayRate)
    days = Number(f.days)
    if (dayRatePaise == null || dayRatePaise <= 0) return 'Enter their expected day rate.'
    if (!Number.isFinite(days) || days <= 0 || days > 365) return 'Enter the number of days.'
  } else {
    flatPaise = rupeesToPaise(f.flat)
    if (flatPaise == null || flatPaise <= 0) return 'Enter their expected fee.'
  }
  return { fullName, handle, phone: cleanText(f.phone, 20), costBasis: f.costBasis, dayRatePaise, days, flatPaise, note: cleanText(f.note, 1000) }
}
const poolPath = (experienceId: string) => { revalidatePath(`${BASE}/${experienceId}`); revalidatePath(`${BASE}/${experienceId}/pool`) }

export async function addProspectAction(experienceId: string, f: ProspectForm): Promise<Out<string>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId)) return { ok: false, error: 'Unknown Experience.' }
  const input = prospectInput(f)
  if (typeof input === 'string') return { ok: false, error: input }
  const r = await addProspect(experienceId, input)
  if (r.ok) poolPath(experienceId)
  return r
}

export async function editProspectAction(experienceId: string, prospectId: string, f: ProspectForm): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(prospectId)) return { ok: false, error: 'Unknown entry.' }
  const input = prospectInput(f)
  if (typeof input === 'string') return { ok: false, error: input }
  const r = await updateProspect(prospectId, input)
  if (r.ok) poolPath(experienceId)
  return r
}

export async function setProspectStatusAction(experienceId: string, prospectId: string, status: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(prospectId)) return { ok: false, error: 'Unknown entry.' }
  if (status !== 'contacted' && status !== 'agreed' && status !== 'onboarding') return { ok: false, error: 'Contacted, agreed or onboarding.' }
  const r = await setProspectStatus(prospectId, status)
  if (r.ok) poolPath(experienceId)
  return r
}

export async function decideProspectAction(experienceId: string, prospectId: string, decision: string, channel: string | null): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(prospectId)) return { ok: false, error: 'Unknown entry.' }
  if (decision !== 'accepted' && decision !== 'rejected' && decision !== 'pending') return { ok: false, error: 'Unknown decision.' }
  if (decision !== 'pending' && !['whatsapp', 'email', 'call', 'in_person'].includes(channel ?? '')) return { ok: false, error: 'Say how the brand told us.' }
  const r = await decideProspect(prospectId, decision, decision === 'pending' ? null : channel)
  if (r.ok) poolPath(experienceId)
  return r
}

export async function dropProspectAction(experienceId: string, prospectId: string, reason: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(prospectId)) return { ok: false, error: 'Unknown entry.' }
  const w = why(reason)
  if (!w) return { ok: false, error: 'Say why they are dropped.' }
  const r = await dropProspect(prospectId, w)
  if (r.ok) poolPath(experienceId)
  return r
}

export async function linkProspectAction(experienceId: string, prospectId: string, creatorId: string): Promise<Out<string>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(prospectId) || !isUuid(creatorId)) return { ok: false, error: 'Pick their Guapd account.' }
  const r = await linkProspect(prospectId, creatorId)
  if (r.ok) poolPath(experienceId)
  return r
}


// ── 0542: counters on a creator leg; finance-only bank details ─────────────
// Direction decides who may act (in Postgres): lowering or holding Guapd's
// cost, operational staff; raising it, financial staff only.

const counterRate = (v: unknown) => { const p = rupeesToPaise(String(v ?? '')); return p != null && p > 0 && p % 100 === 0 ? p : null }

export async function acceptCreatorCounter(experienceId: string, counterId: string, dealId: string, expectedGrossPaise: number): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(counterId) || !isUuid(dealId) || !Number.isSafeInteger(expectedGrossPaise)) return { ok: false, error: 'Unknown counter.' }
  const r = await acceptCounter(counterId, expectedGrossPaise)
  if (!r.ok) return r
  await notifyCreatorCounter(dealId, 'accepted', counterId)
  revalidatePath(`${BASE}/${experienceId}`)
  return r
}

export async function declineCreatorCounter(experienceId: string, counterId: string, dealId: string, note: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(counterId) || !isUuid(dealId)) return { ok: false, error: 'Unknown counter.' }
  const r = await declineCounter(counterId, cleanText(note, 500))
  if (!r.ok) return r
  await notifyCreatorCounter(dealId, 'declined', counterId)
  revalidatePath(`${BASE}/${experienceId}`)
  return r
}

export async function sendGuapdCounter(experienceId: string, dealId: string, rate: string, days: string, note: string): Promise<Out<string>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(dealId)) return { ok: false, error: 'Unknown creator deal.' }
  const ratePaise = counterRate(rate)
  if (ratePaise == null) return { ok: false, error: 'Enter the day rate in whole rupees.' }
  const d = legDays(days)
  if (d == null) return { ok: false, error: 'Days must be more than 0, at most 365, with at most two decimals.' }
  const r = await sendCounter(dealId, ratePaise, d, cleanText(note, 500))
  if (!r.ok) return r
  await notifyCreatorCounter(dealId, 'guapd_counter', r.data)
  revalidatePath(`${BASE}/${experienceId}`)
  return r
}

export async function withdrawGuapdCounterAction(experienceId: string, counterId: string): Promise<Out> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(counterId)) return { ok: false, error: 'Unknown counter.' }
  const r = await withdrawGuapdCounter(counterId)
  if (r.ok) revalidatePath(`${BASE}/${experienceId}`)
  return r
}

/** FINANCE only (the database decides): the full bank details for paying one payout. Audited. */
export async function showPayoutAccount(payoutId: string): Promise<Out<PayoutAccount>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(payoutId)) return { ok: false, error: 'Unknown payout.' }
  return getPayoutAccount(payoutId)
}
