import { nicheBuckets, OTHER_NICHE, capitaliseNiche } from '@/lib/niches'
import { RESULT_CAP, type BriefFilters, type CreatorSearchResult, type LoosenHint } from './creator-search-types'
import { chipsFor, withoutFilter } from './filter-chips'

/**
 * Rank creators against validated filters. Pure: no model, no network, no
 * randomness, so the same filters over the same creators give the same list.
 * Callable on its own (a later agent can reuse it).
 *
 * ── The rules ───────────────────────────────────────────────────────────────
 * Hard filters (city, language, followers, engagement, budget): a creator with
 * a value on file that does not fit is left out; one with nothing on file is
 * kept and the card says what was not checked. Minimum engagement is the
 * exception: only a verified figure can meet it, so unverified creators are
 * left out and counted.
 * Exclusions: a creator whose niche, bio, niche text or past brands match any
 * exclusion is left out.
 * Must-haves: a creator must match at least one, when any are given.
 * Without must-haves, a brief that still names nice-to-haves, a product or a
 * tone needs at least one of those to match. The list is never padded.
 * Score: must-have and nice-to-have matches, tone and product words in the
 * bio, packages for the deliverables asked for, then proof: verified
 * engagement and Guapd history (completed deals, on time delivery, replies to
 * offers), each only once there is enough of it to mean something.
 *
 * Every word of the reason line is a stored value or the brief's own words,
 * and only values /browse already shows brands: city, languages, engagement
 * %, completed deals, on-time and reply figures rank but are never shown.
 */

export interface PoolCreator {
  id: string
  fullName: string
  handle: string | null
  photoUrl: string | null
  hasStorefront: boolean
  bio: string | null
  niches: string[]
  city: string | null
  state: string | null
  languages: string[]
  /** Used only to apply exclusions. Never returned. */
  pastBrands: string[]
  deliverableTypes: string[]
  typedFollowers: number | null
  followerBand: string | null
  verified: boolean
  verifiedFollowers: number | null
  igMedia: { likes: number | null; comments: number | null }[]
  igSyncedAt: string | null
  startingRatePaise: number | null
  completedDeals: number
  onTimeMeasured: number
  onTime: number
  offersReceived: number
  offersResponded: number
}

export interface RankOutcome {
  results: CreatorSearchResult[]
  /** Left out only because their engagement is not verified. */
  hiddenUnverified: number
  /** The brief named a country other than India. */
  outsideIndia: boolean
}

const W = {
  mustNiche: 30, mustKeyword: 14, mustCap: 60,
  niceNiche: 12, niceKeyword: 8, niceCap: 32,
  tone: 4, toneCap: 12,
  product: 8,
  deliverable: 6,
  city: 6,
  verified: 8,
  engagementPerPct: 2, engagementCap: 16,
  completedPer: 2, completedCap: 20,
  onTime: 10,
  response: 8,
} as const

const MIN_ON_TIME_MEASURED = 2
const MIN_OFFERS = 3
const MIN_POSTS = 3
const POSTS_FOR_ENGAGEMENT = 12

const STOP = new Set(['and', 'the', 'for', 'with', 'about', 'content', 'creator', 'creators', 'videos', 'video', 'reels', 'reel', 'posts', 'post', 'india', 'indian'])
export const REGION = /\b(north|south|east|west|central|metro|metros|tier|india)\b/i

/** Package types that deliver each kind of content. */
const DELIVERABLE_MATCH: Record<string, RegExp> = {
  reels: /reel/i,
  stories: /story/i,
  posts: /static|carousel|post/i,
  carousels: /carousel/i,
  shorts: /short/i,
  'youtube videos': /youtube (integration|dedicated)/i,
}

const WORD = new RegExp('[\\p{L}\\p{N}]+', 'gu')
const words = (s: string): string[] => s.toLowerCase().match(WORD) ?? []
const stem = (w: string): string => (w.length > 4 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)

/** Every meaningful word of the term appears in the text, as a word prefix:
 *  "home fragrance" matches "fragrances for your home". */
function mentions(term: string, tokens: string[]): boolean {
  const need = words(term).filter((w) => !STOP.has(w) && (w.length >= 3 || /\d/.test(w))).map(stem)
  return need.length > 0 && need.every((w) => tokens.some((t) => t.startsWith(w)))
}

const looseMatch = (a: string, b: string | null): boolean => {
  if (!b) return false
  const x = a.toLowerCase().trim(), y = b.toLowerCase().trim()
  return x.length > 0 && y.length > 0 && (y.includes(x) || x.includes(y))
}

const shortNiche = (n: string): string => n.split(/[,&]/)[0].trim().toLowerCase()

export const fmtCount = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
    : n >= 10_000 ? `${Math.round(n / 1_000)}k`
      : n >= 1_000 ? `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
        : String(n)

function buckets(c: PoolCreator): string[] {
  return Array.from(new Set(c.niches.flatMap(nicheBuckets))).filter((n) => n !== OTHER_NICHE)
}

/** Average likes + comments over recent posts, as a share of followers.
 *  Verified accounts only, and only with enough posts carrying numbers. */
export function engagementPct(c: PoolCreator): number | null {
  if (!c.verified || !c.verifiedFollowers) return null
  const posts = c.igMedia.filter((m) => m.likes !== null).slice(0, POSTS_FOR_ENGAGEMENT)
  if (posts.length < MIN_POSTS) return null
  const avg = posts.reduce((s, m) => s + (m.likes ?? 0) + (m.comments ?? 0), 0) / posts.length
  return Math.round((avg / c.verifiedFollowers) * 1000) / 10
}

export interface RankOptions {
  /** Unapproved brand (0591): get no more than /browse gives them. Filtering
   *  or ranking on a signal /browse does not show would reveal it (a city
   *  filter tells you who lives where), so city, languages and minimum
   *  engagement are not applied, and engagement and Guapd history do not
   *  affect the order. */
  restricted?: boolean
}

export function rankCreators(pool: PoolCreator[], f: BriefFilters, limit = RESULT_CAP, opts: RankOptions = {}): RankOutcome {
  const restricted = !!opts.restricted
  const h = f.hard
  const outsideIndia = h.country !== null && !/^(india|bharat)$/i.test(h.country.trim())
  if (outsideIndia) return { results: [], hiddenUnverified: 0, outsideIndia }

  const cityTerms = restricted ? [] : h.cities.filter((c) => !REGION.test(c))
  const wantLanguages = restricted ? [] : h.languages.map((l) => l.toLowerCase())
  const mustCount = f.mustHave.niches.length + f.mustHave.keywords.length
  const softAsked = f.niceToHave.niches.length + f.niceToHave.keywords.length + f.context.tone.length + (f.context.productCategory ? 1 : 0) > 0
  let hiddenUnverified = 0
  const scored: { c: PoolCreator; score: number; result: CreatorSearchResult }[] = []

  for (const c of pool) {
    const gaps: string[] = []

    // ── Hard filters ──
    const followers = c.verified ? c.verifiedFollowers : c.typedFollowers
    if (followers !== null && h.followersMin !== null && followers < h.followersMin) continue
    if (followers !== null && h.followersMax !== null && followers > h.followersMax) continue
    if ((h.followersMin !== null || h.followersMax !== null) && followers === null) gaps.push('followers not on file')

    if (h.budgetMaxRupees !== null && c.startingRatePaise !== null && c.startingRatePaise > h.budgetMaxRupees * 100) continue
    if (h.budgetMaxRupees !== null && c.startingRatePaise === null) gaps.push('no published rate')

    let cityHit: string | null = null
    if (cityTerms.length > 0) {
      if (c.city || c.state) {
        cityHit = cityTerms.find((t) => looseMatch(t, c.city) || looseMatch(t, c.state)) ?? null
        if (!cityHit) continue
      } else {
        gaps.push('city not on file')
      }
    }

    let languageHit: string | null = null
    if (wantLanguages.length > 0) {
      if (c.languages.length > 0) {
        languageHit = c.languages.find((l) => wantLanguages.includes(l.toLowerCase())) ?? null
        if (!languageHit) continue
      } else {
        gaps.push('languages not on file')
      }
    }

    // ── Exclusions ──
    const mine = buckets(c)
    const tokens = words([c.bio ?? '', ...c.niches, c.handle ?? ''].join(' '))
    if (f.exclude.niches.some((n) => mine.includes(n))) continue
    if (f.exclude.keywords.some((k) => mentions(k, tokens) || c.pastBrands.some((b) => looseMatch(k, b)))) continue

    // ── Must-haves gate; soft asks gate only when there are no must-haves ──
    const mustNiches = f.mustHave.niches.filter((n) => mine.includes(n))
    const mustKeywords = f.mustHave.keywords.filter((k) => mentions(k, tokens))
    if (mustCount > 0 && mustNiches.length + mustKeywords.length === 0) continue

    const niceNiches = f.niceToHave.niches.filter((n) => mine.includes(n))
    const niceKeywords = f.niceToHave.keywords.filter((k) => mentions(k, tokens))
    const toneHits = f.context.tone.filter((t) => mentions(t, tokens))
    const productHit = f.context.productCategory && mentions(f.context.productCategory, tokens) ? f.context.productCategory : null
    if (mustCount === 0 && softAsked && niceNiches.length + niceKeywords.length + toneHits.length + (productHit ? 1 : 0) === 0) continue

    // After relevance, so "may fit but not verified" counts only creators who otherwise fit.
    const er = restricted ? null : engagementPct(c)
    if (h.minEngagementPct !== null && !restricted) {
      if (er === null) { hiddenUnverified++; continue }
      if (er < h.minEngagementPct) continue
    }

    const sells = f.context.deliverables.filter((d) => DELIVERABLE_MATCH[d] && c.deliverableTypes.some((t) => DELIVERABLE_MATCH[d].test(t)))

    // ── Score ──
    let score = Math.min(W.mustCap, W.mustNiche * mustNiches.length + W.mustKeyword * mustKeywords.length)
    score += Math.min(W.niceCap, W.niceNiche * niceNiches.length + W.niceKeyword * niceKeywords.length)
    score += Math.min(W.toneCap, W.tone * toneHits.length)
    if (productHit) score += W.product
    if (sells.length) score += W.deliverable
    if (cityHit) score += W.city
    if (c.verified) score += W.verified
    if (er !== null) score += Math.min(W.engagementCap, er * W.engagementPerPct)
    if (!restricted) {
      score += Math.min(W.completedCap, W.completedPer * c.completedDeals)
      const onTimeRate = c.onTimeMeasured >= MIN_ON_TIME_MEASURED ? c.onTime / c.onTimeMeasured : null
      if (onTimeRate !== null) score += W.onTime * onTimeRate
      const responseRate = c.offersReceived >= MIN_OFFERS ? c.offersResponded / c.offersReceived : null
      if (responseRate !== null) score += W.response * responseRate
    }

    // ── Reason: stored values and the brief's own words ──
    const parts: string[] = []
    const matched = Array.from(new Set([...mustKeywords, ...(productHit ? [productHit] : []), ...mustNiches.map(shortNiche)]))
    if (matched.length) parts.push(`matches: ${matched.join(', ')}`)
    const also = Array.from(new Set([...niceKeywords, ...niceNiches.map(shortNiche)])).filter((x) => !matched.includes(x))
    if (also.length) parts.push(`also: ${also.join(', ')}`)
    if (toneHits.length) parts.push(`tone: ${toneHits.join(', ')}`)
    if (sells.length) parts.push(`sells ${sells.join(', ')}`)
    // Only what /browse already shows brands. Engagement %, completed deals,
    // on-time and reply figures, the creator's city and languages are NOT on
    // /browse, so they rank but are never shown (A1, 2026-11-06).
    if (c.verified && c.verifiedFollowers !== null) parts.push(`verified ${fmtCount(c.verifiedFollowers)} followers`)
    if (parts.length === 0) parts.push('fits your filters')

    scored.push({
      c,
      score,
      result: {
        id: c.id,
        name: c.fullName,
        handle: c.handle ? c.handle.trim().replace(/^@+/, '') || null : null,
        photoUrl: c.photoUrl,
        nicheTags: mine.length ? mine.slice(0, 3) : c.niches.slice(0, 2).map(capitaliseNiche),
        verified: c.verified && c.igSyncedAt ? { followers: c.verifiedFollowers, asOf: c.igSyncedAt } : null,
        selfReported: c.verified ? null : { followers: c.typedFollowers },
        reason: parts.join('; '),
        gaps,
      },
    })
  }

  // A total order: the id breaks every tie, so the same filters over the same
  // creators always give the same sequence (Load more depends on it).
  scored.sort((a, b) =>
    b.score - a.score
    || Number(b.c.verified) - Number(a.c.verified)
    || (restricted ? 0 : b.c.completedDeals - a.c.completedDeals)
    || a.c.fullName.localeCompare(b.c.fullName)
    || (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0))

  return { results: scored.slice(0, limit).map((s) => s.result), hiddenUnverified, outsideIndia }
}

/** The one chip whose removal shows the most extra creators, if any does.
 *  Never the last must-have: dropping it would turn the search into
 *  "everyone", which is padding. Nice-to-haves never narrow, so never offered. */
export function suggestLoosen(pool: PoolCreator[], f: BriefFilters, current: number, opts: RankOptions = {}): LoosenHint | null {
  const mustCount = f.mustHave.niches.length + f.mustHave.keywords.length
  let best: LoosenHint | null = null
  for (const chip of chipsFor(f)) {
    if (chip.group === 'nice') continue
    if (chip.group === 'must' && mustCount <= 1) continue
    if (opts.restricted && chip.group === 'hard' && /^hard:(city|language|engagement)/.test(chip.key)) continue
    const n = rankCreators(pool, withoutFilter(f, chip.key), Infinity, opts).results.length
    if (n > current && (!best || n > best.wouldShow)) best = { key: chip.key, label: chip.label, wouldShow: n }
  }
  return best
}

/** What the brief asked for that the data cannot fully check, said plainly. */
export function notChecked(f: BriefFilters, opts: RankOptions = {}): string[] {
  const out: string[] = []
  if (opts.restricted && (f.hard.cities.length || f.hard.languages.length || f.hard.minEngagementPct !== null)) {
    out.push('City, language and engagement filters apply once Guapd approves your brand')
  }
  if (!opts.restricted) {
    if (f.hard.cities.some((c) => REGION.test(c))) out.push('Regions are not checked; only named cities are')
    if (f.hard.cities.length) out.push('Creators with no city on file are kept')
    if (f.hard.languages.length) out.push('Creators with no languages on file are kept')
    if (f.hard.minEngagementPct !== null) out.push('Engagement is checked only for creators with Instagram connected')
  }
  if (f.hard.budgetMinRupees !== null) out.push('Only the top of the budget is used')
  if (f.context.deliverables.includes('ugc') || f.context.deliverables.includes('live')) out.push('UGC and live are not matched to packages')
  if (f.unused.length) out.push(`Not used: ${f.unused.join(', ')}`)
  return out
}
