import { nicheBuckets, OTHER_NICHE, capitaliseNiche } from '@/lib/niches'
import {
  RESULT_CAP,
  type BriefFilters,
  type CreatorSearchResult,
  type FilterKey,
  type LoosenHint,
} from './creator-search-types'

/**
 * Rank creators against validated filters. Pure: no model, no network, no
 * randomness, so the same filters over the same creators give the same list.
 * Callable on its own (a later agent can reuse it).
 *
 * ── What counts ─────────────────────────────────────────────────────────────
 * Relevance: the brand's niches against the creator's niches, and the brand's
 * keywords against their bio, niches and handle. When the brief names either,
 * a creator who matches neither is left out: the list is never padded.
 * Proof: engagement from a connected Instagram, then Guapd history (completed
 * deals, on time delivery, replies to offers), each only once there is enough
 * of it to mean something.
 *
 * ── A known mismatch excludes; a blank does not ─────────────────────────────
 * A creator with a city, follower count or rate on file that does not fit is
 * left out. One with nothing on file is kept and the card says what was not
 * checked. The exception is minimum engagement: only a verified figure can
 * meet it, so unverified creators are left out and counted.
 *
 * Every word of the reason line is assembled from these stored values.
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
  niche: 30,
  nicheExtra: 5,
  keyword: 12,
  keywordCap: 36,
  city: 6,
  verified: 8,
  engagementPerPct: 2,
  engagementCap: 16,
  completedPer: 2,
  completedCap: 20,
  onTime: 10,
  response: 8,
} as const

/** Enough history to say anything: below these, the figure is not shown or used. */
const MIN_ON_TIME_MEASURED = 2
const MIN_OFFERS = 3
const MIN_POSTS = 3
const POSTS_FOR_ENGAGEMENT = 12

const STOP = new Set(['and', 'the', 'for', 'with', 'about', 'content', 'creator', 'creators', 'videos', 'video', 'reels', 'reel', 'posts', 'post', 'india', 'indian'])
const REGION = /\b(north|south|east|west|central|metro|metros|tier|india)\b/i

const WORD = new RegExp('[\\p{L}\\p{N}]+', 'gu')
const words = (s: string): string[] => s.toLowerCase().match(WORD) ?? []
const stem = (w: string): string => (w.length > 4 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)

/** Every meaningful word of the keyword appears in the text, as a word prefix:
 *  "home fragrance" matches "fragrances for your home". */
function mentions(keyword: string, tokens: string[]): boolean {
  const need = words(keyword).filter((w) => !STOP.has(w) && (w.length >= 3 || /\d/.test(w))).map(stem)
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

function followersOnFile(c: PoolCreator): number | null {
  return c.verified ? c.verifiedFollowers : c.typedFollowers
}

export function rankCreators(pool: PoolCreator[], f: BriefFilters, limit = RESULT_CAP): RankOutcome {
  const outsideIndia = f.country !== null && !/^(india|bharat)$/i.test(f.country.trim())
  if (outsideIndia) return { results: [], hiddenUnverified: 0, outsideIndia }

  const relevanceAsked = f.niches.length > 0 || f.keywords.length > 0
  const cityTerms = f.cities.filter((c) => !REGION.test(c))
  let hiddenUnverified = 0

  const scored: { c: PoolCreator; score: number; result: CreatorSearchResult }[] = []

  for (const c of pool) {
    const gaps: string[] = []

    // ── Known mismatches ──
    const followers = followersOnFile(c)
    if (followers !== null && f.followersMin !== null && followers < f.followersMin) continue
    if (followers !== null && f.followersMax !== null && followers > f.followersMax) continue
    if ((f.followersMin !== null || f.followersMax !== null) && followers === null) gaps.push('followers not on file')

    if (f.budgetMaxRupees !== null && c.startingRatePaise !== null && c.startingRatePaise > f.budgetMaxRupees * 100) continue
    if (f.budgetMaxRupees !== null && c.startingRatePaise === null) gaps.push('no published rate')

    let cityHit: string | null = null
    if (cityTerms.length > 0) {
      if (c.city || c.state) {
        cityHit = cityTerms.find((t) => looseMatch(t, c.city) || looseMatch(t, c.state)) ?? null
        if (!cityHit) continue
      } else {
        gaps.push('city not on file')
      }
    }

    // ── Relevance ──
    const mine = buckets(c)
    const nicheHits = f.niches.filter((n) => mine.includes(n))
    const tokens = words([c.bio ?? '', ...c.niches, c.handle ?? ''].join(' '))
    const keywordHits = f.keywords.filter((k) => mentions(k, tokens))
    if (relevanceAsked && nicheHits.length === 0 && keywordHits.length === 0) continue

    // After relevance, so "may fit but not verified" counts only creators
    // who otherwise fit.
    const er = engagementPct(c)
    if (f.minEngagementPct !== null) {
      if (er === null) { hiddenUnverified++; continue }
      if (er < f.minEngagementPct) continue
    }

    // ── Score ──
    let score = 0
    if (nicheHits.length) score += W.niche + W.nicheExtra * (nicheHits.length - 1)
    score += Math.min(W.keywordCap, W.keyword * keywordHits.length)
    if (cityHit) score += W.city
    if (c.verified) score += W.verified
    if (er !== null) score += Math.min(W.engagementCap, er * W.engagementPerPct)
    score += Math.min(W.completedCap, W.completedPer * c.completedDeals)
    const onTimeRate = c.onTimeMeasured >= MIN_ON_TIME_MEASURED ? c.onTime / c.onTimeMeasured : null
    if (onTimeRate !== null) score += W.onTime * onTimeRate
    const responseRate = c.offersReceived >= MIN_OFFERS ? c.offersResponded / c.offersReceived : null
    if (responseRate !== null) score += W.response * responseRate

    // ── Reason, from the values above only ──
    const parts: string[] = []
    const matched = Array.from(new Set([...nicheHits.map(shortNiche), ...keywordHits]))
    if (matched.length) parts.push(`matches: ${matched.join(', ')}`)
    if (c.verified) {
      parts.push(er !== null ? `verified ${er}% engagement`
        : c.verifiedFollowers !== null ? `verified ${fmtCount(c.verifiedFollowers)} followers` : 'verified Instagram')
    }
    if (c.completedDeals > 0) parts.push(`${c.completedDeals} ${c.completedDeals === 1 ? 'deal' : 'deals'} completed`)
    if (onTimeRate !== null) parts.push(`on time ${c.onTime} of ${c.onTimeMeasured}`)
    if (responseRate !== null) parts.push(`replied to ${c.offersResponded} of ${c.offersReceived} offers`)
    if (cityHit && c.city) parts.push(`in ${c.city}`)
    if (parts.length === 0) parts.push('fits your filters')

    const tags = mine.length ? mine.slice(0, 3) : c.niches.slice(0, 2).map(capitaliseNiche)

    scored.push({
      c,
      score,
      result: {
        id: c.id,
        name: c.fullName,
        handle: c.handle ? c.handle.trim().replace(/^@+/, '') || null : null,
        photoUrl: c.photoUrl,
        city: c.city,
        nicheTags: tags,
        verified: c.verified && c.igSyncedAt
          ? { followers: c.verifiedFollowers, engagementPct: er, asOf: c.igSyncedAt }
          : null,
        selfReported: c.verified ? null : { followers: c.typedFollowers, band: c.followerBand },
        reason: parts.join('; '),
        gaps,
      },
    })
  }

  scored.sort((a, b) =>
    b.score - a.score
    || Number(b.c.verified) - Number(a.c.verified)
    || b.c.completedDeals - a.c.completedDeals
    || a.c.fullName.localeCompare(b.c.fullName))

  return { results: scored.slice(0, limit).map((s) => s.result), hiddenUnverified, outsideIndia }
}

/** The active filters, one key per chip. */
export function filterKeys(f: BriefFilters): { key: FilterKey; label: string }[] {
  const rupees = (r: number) => (r >= 100_000 ? `₹${(r / 100_000).toFixed(1).replace(/\.0$/, '')}L` : `₹${fmtCount(r)}`)
  const range = (lo: number | null, hi: number | null, fmt: (n: number) => string) =>
    lo !== null && hi !== null ? `${fmt(lo)}–${fmt(hi)}` : lo !== null ? `${fmt(lo)}+` : `under ${fmt(hi as number)}`
  const out: { key: FilterKey; label: string }[] = []
  f.niches.forEach((n) => out.push({ key: `niche:${n}`, label: n }))
  f.keywords.forEach((k) => out.push({ key: `keyword:${k}`, label: k }))
  const title = (t: string) => t.replace(/(^|\s)(\S)/g, (_, sp: string, ch: string) => sp + ch.toUpperCase())
  f.cities.forEach((c) => out.push({ key: `city:${c}`, label: title(c) }))
  if (f.country) out.push({ key: 'country', label: title(f.country) })
  f.languages.forEach((l) => out.push({ key: `language:${l}`, label: title(l) }))
  if (f.followersMin !== null || f.followersMax !== null) out.push({ key: 'followers', label: `${range(f.followersMin, f.followersMax, fmtCount)} followers` })
  if (f.minEngagementPct !== null) out.push({ key: 'engagement', label: `${f.minEngagementPct}%+ engagement` })
  if (f.budgetMinRupees !== null || f.budgetMaxRupees !== null) out.push({ key: 'budget', label: `${range(f.budgetMinRupees, f.budgetMaxRupees, rupees)} budget` })
  return out
}

/** The filters with one chip removed. */
export function withoutFilter(f: BriefFilters, key: FilterKey): BriefFilters {
  const [kind, ...rest] = key.split(':')
  const value = rest.join(':')
  switch (kind) {
    case 'niche': return { ...f, niches: f.niches.filter((n) => n !== value) }
    case 'keyword': return { ...f, keywords: f.keywords.filter((k) => k !== value) }
    case 'city': return { ...f, cities: f.cities.filter((c) => c !== value) }
    case 'language': return { ...f, languages: f.languages.filter((l) => l !== value) }
    case 'country': return { ...f, country: null }
    case 'followers': return { ...f, followersMin: null, followersMax: null }
    case 'engagement': return { ...f, minEngagementPct: null }
    case 'budget': return { ...f, budgetMinRupees: null, budgetMaxRupees: null }
    default: return f
  }
}

/** The one filter whose removal shows the most extra creators, if any does.
 *  Never the last niche or keyword: dropping it would turn the search into
 *  "everyone", which is padding. Languages never change the result (not
 *  stored), so they are not offered either. */
export function suggestLoosen(pool: PoolCreator[], f: BriefFilters, current: number): LoosenHint | null {
  let best: LoosenHint | null = null
  const relevanceTerms = f.niches.length + f.keywords.length
  for (const { key, label } of filterKeys(f)) {
    if (key.startsWith('language:')) continue
    if ((key.startsWith('niche:') || key.startsWith('keyword:')) && relevanceTerms <= 1) continue
    const n = rankCreators(pool, withoutFilter(f, key)).results.length
    if (n > current && (!best || n > best.wouldShow)) best = { key, label, wouldShow: n }
  }
  return best
}

/** What the brief asked for that the data cannot check yet. */
export function notChecked(f: BriefFilters): string[] {
  const out: string[] = []
  if (f.languages.length) out.push("Language is not checked: creators' languages are not on file yet")
  if (f.cities.some((c) => REGION.test(c))) out.push('Regions are not checked; only named cities are')
  if (f.cities.length) out.push('Creators with no city on file are kept')
  if (f.budgetMinRupees !== null) out.push('Only the top of the budget is used')
  if (f.unused.length) out.push(`Not used: ${f.unused.join(', ')}`)
  return out
}
