import { CONTENT_LANGUAGES, SEARCH_NICHES, type BriefFilters, type Chip, type ChipGroup, type FilterKey } from './creator-search-types'

/**
 * Chips: the filters a brief was read as, one per editable item, in four
 * groups (hard filters, must have, nice to have, exclude). Pure and
 * client-safe: the page renders them, and an edit or a removal produces a new
 * filter set that the API validates again before it re-runs. No model call.
 */

const rupees = (r: number) => (r >= 100_000 ? `₹${(r / 100_000).toFixed(1).replace(/\.0$/, '')}L` : r >= 1_000 ? `₹${Math.round(r / 1_000)}k` : `₹${r}`)
const count = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : n >= 1_000 ? `${Math.round(n / 1_000)}k` : String(n))
const range = (lo: number | null, hi: number | null, fmt: (n: number) => string) =>
  lo !== null && hi !== null ? `${fmt(lo)}–${fmt(hi)}` : lo !== null ? `${fmt(lo)}+` : `under ${fmt(hi as number)}`
const title = (t: string) => t.replace(/(^|\s)(\S)/g, (_, sp: string, ch: string) => sp + ch.toUpperCase())

export function chipsFor(f: BriefFilters): Chip[] {
  const out: Chip[] = []
  const h = f.hard
  h.cities.forEach((c) => out.push({ key: `hard:city:${c}`, group: 'hard', label: title(c), edit: 'text' }))
  if (h.country) out.push({ key: 'hard:country', group: 'hard', label: title(h.country), edit: 'text' })
  h.languages.forEach((l) => out.push({ key: `hard:language:${l}`, group: 'hard', label: l, edit: 'language' }))
  if (h.followersMin !== null || h.followersMax !== null) out.push({ key: 'hard:followers', group: 'hard', label: `${range(h.followersMin, h.followersMax, count)} followers`, edit: 'followers' })
  if (h.minEngagementPct !== null) out.push({ key: 'hard:engagement', group: 'hard', label: `${h.minEngagementPct}%+ engagement`, edit: 'percent' })
  if (h.budgetMinRupees !== null || h.budgetMaxRupees !== null) out.push({ key: 'hard:budget', group: 'hard', label: `${range(h.budgetMinRupees, h.budgetMaxRupees, rupees)} budget`, edit: 'budget' })
  const lists: [ChipGroup, 'mustHave' | 'niceToHave' | 'exclude'][] = [['must', 'mustHave'], ['nice', 'niceToHave'], ['exclude', 'exclude']]
  for (const [group, field] of lists) {
    f[field].niches.forEach((n) => out.push({ key: `${group}:niche:${n}`, group, label: n, edit: 'niche' }))
    f[field].keywords.forEach((k) => out.push({ key: `${group}:keyword:${k}`, group, label: k, edit: 'text' }))
  }
  return out
}

function parse(key: FilterKey): { group: string; kind: string; value: string } {
  const [group, kind, ...rest] = key.split(':')
  return { group, kind, value: rest.join(':') }
}

const FIELD = { must: 'mustHave', nice: 'niceToHave', exclude: 'exclude' } as const

/** The filters with one chip removed. */
export function withoutFilter(f: BriefFilters, key: FilterKey): BriefFilters {
  const { group, kind, value } = parse(key)
  if (group === 'hard') {
    const h = { ...f.hard }
    if (kind === 'city') h.cities = h.cities.filter((c) => c !== value)
    if (kind === 'language') h.languages = h.languages.filter((l) => l !== value)
    if (kind === 'country') h.country = null
    if (kind === 'followers') { h.followersMin = null; h.followersMax = null }
    if (kind === 'engagement') h.minEngagementPct = null
    if (kind === 'budget') { h.budgetMinRupees = null; h.budgetMaxRupees = null }
    return { ...f, hard: h }
  }
  const field = FIELD[group as keyof typeof FIELD]
  if (!field) return f
  const list = f[field]
  return {
    ...f,
    [field]: kind === 'niche'
      ? { ...list, niches: list.niches.filter((n) => n !== value) }
      : { ...list, keywords: list.keywords.filter((k) => k !== value) },
  }
}

/** "50k", "1.5L", "2 lakh", "1cr" → a whole number. */
function amount(s: string): number | null {
  const m = s.trim().toLowerCase().replace(/[₹,\s]/g, '').match(/^(\d+(?:\.\d+)?)(k|m|l|lakh|lakhs|cr|crore)?$/)
  if (!m) return null
  const mult: Record<string, number> = { k: 1e3, m: 1e6, l: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7 }
  return Math.round(Number(m[1]) * (m[2] ? mult[m[2]] : 1))
}

/** "10k-50k", "50k+", "under 1L" → [min, max]. A lone number is `lone`. */
function parseRange(s: string, lone: 'min' | 'max'): [number | null, number | null] | null {
  const t = s.toLowerCase().replace(/followers|budget|per reel|rupees/g, '').trim()
  const under = t.match(/^(?:under|below|upto|up to|<)\s*(.+)$/)
  if (under) { const v = amount(under[1]); return v === null ? null : [null, v] }
  const plus = t.match(/^(.+?)\s*\+$/) ?? t.match(/^(?:over|above|>)\s*(.+)$/)
  if (plus) { const v = amount(plus[1]); return v === null ? null : [v, null] }
  const pair = t.split(/\s*(?:-|–|to)\s*/)
  if (pair.length === 2) { const a = amount(pair[0]), b = amount(pair[1]); return a === null || b === null || a > b ? null : [a, b] }
  const v = amount(t)
  return v === null ? null : lone === 'min' ? [v, null] : [null, v]
}

/** The text a brand edits for a chip. */
export function editText(f: BriefFilters, chip: Chip): string {
  if (chip.edit === 'percent') return String(f.hard.minEngagementPct ?? '')
  if (chip.edit === 'followers') return chip.label.replace(/ followers$/, '')
  if (chip.edit === 'budget') return chip.label.replace(/ budget$/, '').replace(/₹/g, '')
  return chip.label
}

/** A chip's edited text applied to the filters. Null = could not read it.
 *  Empty text removes the chip. The API validates the result again. */
export function applyEdit(f: BriefFilters, key: FilterKey, text: string): BriefFilters | null {
  const v = text.trim()
  if (!v) return withoutFilter(f, key)
  const { group, kind, value } = parse(key)
  const swap = (xs: string[], next: string) => Array.from(new Set(xs.map((x) => (x === value ? next : x))))
  if (group === 'hard') {
    const h = { ...f.hard }
    if (kind === 'city') h.cities = swap(h.cities, v.toLowerCase())
    else if (kind === 'country') h.country = v
    else if (kind === 'language') {
      if (!(CONTENT_LANGUAGES as readonly string[]).includes(v)) return null
      h.languages = swap(h.languages, v) as typeof h.languages
    } else if (kind === 'followers') { const r = parseRange(v, 'min'); if (!r) return null; [h.followersMin, h.followersMax] = r }
    else if (kind === 'budget') { const r = parseRange(v, 'max'); if (!r) return null; [h.budgetMinRupees, h.budgetMaxRupees] = r }
    else if (kind === 'engagement') {
      const n = Number(v.replace(/[%+]/g, '').trim())
      if (!Number.isFinite(n) || n < 0 || n > 100) return null
      h.minEngagementPct = n
    } else return null
    return { ...f, hard: h }
  }
  const field = FIELD[group as keyof typeof FIELD]
  if (!field) return null
  const list = f[field]
  if (kind === 'niche') {
    if (!(SEARCH_NICHES as readonly string[]).includes(v)) return null
    return { ...f, [field]: { ...list, niches: swap(list.niches, v) } }
  }
  return { ...f, [field]: { ...list, keywords: swap(list.keywords, v.toLowerCase()) } }
}
