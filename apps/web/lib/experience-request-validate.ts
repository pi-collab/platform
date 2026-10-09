/**
 * One check for an Experience request, whoever fills it in: staff recording it
 * on the brand's behalf (/experiences-admin/new) or the brand themselves
 * (/experiences/new, 0544). Friendly messages here; the database function
 * (experience_request_insert) is the authority and repeats every rule.
 *
 * Pure: no `server-only`, no database.
 */
import { DELIVERABLE_TYPES, isVideoType } from '@/lib/experience-request'

/** What the form sends (strings straight from inputs). */
export interface RequestFormFields {
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
}

/** The checked request, ready for the database. */
export interface RequestInput {
  title: string
  creatorCount: number
  deliverables: { type: string; count: number }[]
  affiliate: boolean
  affiliatePerCreator: number | null
  adRights: boolean
  adRightsPerCreator: number | null
  adRightsMonths: number | null
  boost: boolean
  boostPerCreator: number | null
  boostMonths: number | null
  location: string | null
  dateFrom: string | null
  dateTo: string | null
  brief: string | null
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
function deliverables(raw: unknown): { type: string; count: number }[] | null {
  if (!Array.isArray(raw)) return null
  const out: { type: string; count: number }[] = []
  for (const d of raw) {
    const type = typeof d?.type === 'string' && (DELIVERABLE_TYPES as readonly string[]).includes(d.type) ? d.type : null
    const count = Number(d?.count)
    if (!type || !Number.isInteger(count) || count <= 0 || count > 1000) return null
    out.push({ type, count })
  }
  return out
}

export function parseExperienceRequest(f: RequestFormFields): { ok: true; value: RequestInput } | { ok: false; error: string } {
  const items = deliverables(f.deliverables)
  if (!items || items.length === 0) return { ok: false, error: 'Add at least one deliverable per creator, with a count above zero.' }
  const creators = Number(f.creatorCount)
  if (!Number.isInteger(creators) || creators <= 0 || creators > 500) return { ok: false, error: 'Say how many creators you want.' }
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
  const title = cleanText(f.title, 140)
  if (!title) return { ok: false, error: 'Give the Experience a title.' }
  if (f.adRights && months(true, f.adRightsMonths) === null) return { ok: false, error: 'Ad rights need a number of months.' }
  if (f.boost && months(true, f.boostMonths) === null) return { ok: false, error: 'Boost needs a number of months.' }
  const dateFrom = isoDate(f.dateFrom), dateTo = isoDate(f.dateTo)
  if (dateFrom && dateTo && dateTo < dateFrom) return { ok: false, error: 'The date window ends before it starts.' }
  return { ok: true, value: {
    title, creatorCount: creators, deliverables: items,
    affiliate: !!f.affiliate, affiliatePerCreator: aff.n,
    adRights: !!f.adRights, adRightsPerCreator: ads.n, adRightsMonths: months(!!f.adRights, f.adRightsMonths),
    boost: !!f.boost, boostPerCreator: bst.n, boostMonths: months(!!f.boost, f.boostMonths),
    location: cleanText(f.location, 120), dateFrom, dateTo, brief: cleanText(f.brief, 4000),
  } }
}

/** The database arguments for a checked request (shared by the staff and brand calls). */
export function requestArgs(v: RequestInput) {
  return {
    p_title: v.title, p_creator_count: v.creatorCount, p_deliverables: v.deliverables,
    p_affiliate: v.affiliate, p_affiliate_per_creator: v.affiliatePerCreator,
    p_ad_rights: v.adRights, p_ad_rights_per_creator: v.adRightsPerCreator, p_ad_rights_months: v.adRightsMonths,
    p_boost: v.boost, p_boost_per_creator: v.boostPerCreator, p_boost_months: v.boostMonths, p_location: v.location,
    p_date_from: v.dateFrom, p_date_to: v.dateTo, p_brief: v.brief,
  }
}
