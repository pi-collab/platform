'use server'

import { revalidatePath } from 'next/cache'
import { experienceStaffGate } from '@/lib/experience-staff-auth'
import {
  acceptConsoleQuote, addConsoleQuote, createConsoleExperience,
  rosterAdd, rosterDecide, rosterLock, rosterNote, rosterPlan, rosterRemove,
  listConsoleLegs, legDraft, legSend, setCreatorDayRateAsStaff, setCreatorBrief,
  type ConsoleDeliverable, type ConsoleLegsReconcile,
} from '@/lib/experience-console-server'
import { creatorLegTerms } from '@/lib/experience-money'
import { notifyCreatorLegOffer } from '@/lib/experience-leg-notify'
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
}

export async function draftCreatorLeg(experienceId: string, f: LegDraftForm): Promise<Out<ConsoleLegsReconcile>> {
  const refused = await gate(); if (refused) return refused
  if (!isUuid(experienceId) || !isUuid(f.rosterId)) return { ok: false, error: 'Unknown creator.' }
  if (f.productId !== null && !isUuid(f.productId)) return { ok: false, error: 'Pick the creator\'s shoot day rate.' }
  const days = f.days === null || f.days === '' ? null : legDays(f.days)
  if (f.days !== null && f.days !== '' && days === null) return { ok: false, error: 'Days must be more than 0, at most 365, with at most two decimals (e.g. 1.5).' }
  const items = deliverables(f.deliverables)
  if (!items || items.length === 0) return { ok: false, error: 'Give this creator at least one deliverable.' }
  const aff = Number(f.affiliateCount)
  if (!Number.isInteger(aff) || aff < 0) return { ok: false, error: 'Affiliate is a count of this creator\'s videos (0 for none).' }
  const r = await legDraft(f.rosterId, f.productId, days, items, aff)
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
    if (!row.leg_product_id || row.day_rate_paise == null || row.leg_days == null) {
      failed.push({ rosterId: id, error: `${row.full_name}: pick the day rate and days first.` }); continue
    }
    if (row.leg_product_id !== row.day_rate_product_id) {
      failed.push({ rosterId: id, error: `${row.full_name}: their day rate changed. Pick it again.` }); continue
    }
    const t = creatorLegTerms({ dayRatePaise: row.day_rate_paise, days: row.leg_days, track: row.track })
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

