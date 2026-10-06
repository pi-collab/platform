'use server'

import { revalidatePath } from 'next/cache'
import { experienceStaffGate } from '@/lib/experience-staff-auth'
import { acceptConsoleQuote, addConsoleQuote, createConsoleExperience, type ConsoleDeliverable } from '@/lib/experience-console-server'
import { DELIVERABLE_TYPES, isChannel, rupeesToPaise } from '@/lib/experience-request'

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
  deliverables: { type: string; count: number | string }[]
  affiliate: boolean
  adRights: boolean
  adRightsMonths: number | string | null
  boost: boolean
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
  if (!items || items.length === 0) return { ok: false, error: 'Add at least one deliverable, with a count above zero.' }
  if (!isChannel(f.channel)) return { ok: false, error: 'Say how the request arrived.' }
  const title = cleanText(f.title, 140)
  if (!title) return { ok: false, error: 'Give the Experience a title.' }
  if (f.adRights && months(true, f.adRightsMonths) === null) return { ok: false, error: 'Ad rights need a number of months.' }
  if (f.boost && months(true, f.boostMonths) === null) return { ok: false, error: 'Boost needs a number of months.' }
  const dateFrom = isoDate(f.dateFrom), dateTo = isoDate(f.dateTo)
  if (dateFrom && dateTo && dateTo < dateFrom) return { ok: false, error: 'The date window ends before it starts.' }

  const r = await createConsoleExperience({
    brandId: f.brandId, title, deliverables: items,
    affiliate: !!f.affiliate, adRights: !!f.adRights, adRightsMonths: months(!!f.adRights, f.adRightsMonths),
    boost: !!f.boost, boostMonths: months(!!f.boost, f.boostMonths),
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
