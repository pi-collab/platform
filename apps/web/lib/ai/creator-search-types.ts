/**
 * Guapd AI creator search: the filter contract and the result shapes.
 *
 * CLIENT-SAFE. The brief parser (lib/ai/brief-filters.ts) and the pool loader
 * (lib/ai/creator-pool.ts) are server-only; the ranker (lib/ai/rank-creators.ts)
 * is pure. The page and the API route share these shapes.
 *
 * BriefFiltersSchema is the ONE gate every filter set passes before it reaches
 * a query: the model's reading of a brief, and every chip edit a brand sends
 * back. It is strict: an unknown key, a wrong type, an out-of-range number, or
 * a term with characters outside letters, numbers and a little punctuation is
 * rejected, never repaired.
 */

import { z } from 'zod'
import { NICHES, OTHER_NICHE } from '@/lib/niches'

/** The niches a brief may name: the app's list, without Other. */
export const SEARCH_NICHES = NICHES.filter((n) => n !== OTHER_NICHE) as unknown as [string, ...string[]]

/** Content languages a creator can pick in Settings, and a brief can ask for. */
export const CONTENT_LANGUAGES = [
  'English', 'Hindi', 'Bengali', 'Marathi', 'Telugu', 'Tamil', 'Gujarati', 'Kannada',
  'Malayalam', 'Punjabi', 'Odia', 'Urdu', 'Assamese', 'Bhojpuri',
] as const

/** What a campaign asks creators to make. Matched loosely against the types
 *  of package a creator sells. */
export const DELIVERABLES = ['reels', 'stories', 'posts', 'carousels', 'shorts', 'youtube videos', 'ugc', 'live'] as const

export const MAX_BRIEF = 6000

/* A word or short phrase. Letters (any script, with vowel signs: Hindi needs
   \p{M}), numbers, spaces and & ' . - only: nothing that reads as markup, a
   quote-break or an operator. Built with the constructor: the TS target
   predates the `u` flag in literals. */
const TERM = new RegExp("^[\\p{L}\\p{N}][\\p{L}\\p{M}\\p{N} &'.-]*$", 'u')
/* A plain sentence for the summary, the question and the timeline: the above
   plus , ; : ! ? ( ) / % ₹ +. Still no < > { } [ ] ` " \ $ or newlines. */
const SENTENCE = new RegExp("^[\\p{L}\\p{N}][\\p{L}\\p{M}\\p{N} &'.,;:!?()/%₹+-]*$", 'u')

const Term = z.string().trim().min(1).max(40).regex(TERM)
const Sentence = (max: number) => z.string().trim().min(1).max(max).regex(SENTENCE)
const Count = z.number().int().min(0).max(1_000_000_000)
const Rupees = z.number().int().min(0).max(100_000_000)
const Terms = (max: number) => z.array(Term).max(max)
const Niches = (max: number) => z.array(z.enum(SEARCH_NICHES)).max(max)

export const BriefFiltersSchema = z.object({
  /** Must match. A known mismatch excludes; nothing on file is kept and named. */
  hard: z.object({
    cities: Terms(5),
    country: Term.nullable(),
    languages: z.array(z.enum(CONTENT_LANGUAGES)).max(5),
    followersMin: Count.nullable(),
    followersMax: Count.nullable(),
    /** Percent, e.g. 3 for 3%. Only a verified Instagram can meet it. */
    minEngagementPct: z.number().min(0).max(100).nullable(),
    /** Per creator, in rupees. */
    budgetMinRupees: Rupees.nullable(),
    budgetMaxRupees: Rupees.nullable(),
  }).strict(),
  /** A creator must match at least one of these, when any are given. */
  mustHave: z.object({ niches: Niches(5), keywords: Terms(10) }).strict(),
  /** Each match adds to the score; never excludes. */
  niceToHave: z.object({ niches: Niches(5), keywords: Terms(12) }).strict(),
  /** A creator who matches any of these is removed (keywords also match the
   *  brands they have worked with, for competitors). */
  exclude: z.object({ niches: Niches(5), keywords: Terms(12) }).strict(),
  /** Shown and used for ranking, never as a filter. */
  context: z.object({
    productCategory: Term.nullable(),
    deliverables: z.array(z.enum(DELIVERABLES)).max(8),
    tone: Terms(8),
    timeline: Sentence(80).nullable(),
  }).strict(),
  /** One or two plain sentences: how the brief was read. */
  summary: Sentence(300),
  /** Set when the brief is too vague or contradictory to read a field. */
  question: Sentence(200).nullable(),
  /** Asks that fit nowhere above, shown as not used. */
  unused: Terms(8),
}).strict()
  .refine((f) => f.hard.followersMin === null || f.hard.followersMax === null || f.hard.followersMin <= f.hard.followersMax, 'followers range is reversed')
  .refine((f) => f.hard.budgetMinRupees === null || f.hard.budgetMaxRupees === null || f.hard.budgetMinRupees <= f.hard.budgetMaxRupees, 'budget range is reversed')

export type BriefFilters = z.infer<typeof BriefFiltersSchema>

export const EMPTY_BRIEF_FILTERS: BriefFilters = {
  hard: { cities: [], country: null, languages: [], followersMin: null, followersMax: null, minEngagementPct: null, budgetMinRupees: null, budgetMaxRupees: null },
  mustHave: { niches: [], keywords: [] },
  niceToHave: { niches: [], keywords: [] },
  exclude: { niches: [], keywords: [] },
  context: { productCategory: null, deliverables: [], tone: [], timeline: null },
  summary: 'Creators on Guapd.',
  question: null,
  unused: [],
}

const uniqLower = (xs: string[]) => Array.from(new Set(xs.map((x) => x.toLowerCase())))
const uniq = <T,>(xs: T[]) => Array.from(new Set(xs))

/** Validate anything claiming to be filters. Null means rejected. Terms are
 *  lowercased and de-duplicated; a term that is both a must-have and an
 *  exclusion is a contradiction and is rejected too. */
export function validateFilters(input: unknown): BriefFilters | null {
  const r = BriefFiltersSchema.safeParse(input)
  if (!r.success) return null
  const f = r.data
  const out: BriefFilters = {
    ...f,
    hard: { ...f.hard, cities: uniqLower(f.hard.cities), languages: uniq(f.hard.languages) },
    mustHave: { niches: uniq(f.mustHave.niches), keywords: uniqLower(f.mustHave.keywords) },
    niceToHave: { niches: uniq(f.niceToHave.niches), keywords: uniqLower(f.niceToHave.keywords) },
    exclude: { niches: uniq(f.exclude.niches), keywords: uniqLower(f.exclude.keywords) },
    context: { ...f.context, deliverables: uniq(f.context.deliverables), tone: uniqLower(f.context.tone) },
    unused: uniqLower(f.unused),
  }
  const wanted = new Set<string>([...out.mustHave.niches, ...out.mustHave.keywords])
  if ([...out.exclude.niches, ...out.exclude.keywords].some((x) => wanted.has(x))) return null
  return out
}

/** One creator card. Only what a brand may see before a deal: no phone, email,
 *  rate card, UPI, tokens, past brands or audience demographics. Verified and
 *  self-reported figures are separate fields and never mixed. */
export interface CreatorSearchResult {
  id: string
  name: string
  handle: string | null
  photoUrl: string | null
  city: string | null
  nicheTags: string[]
  /** Only for a connected Instagram synced in the last 10 days. */
  verified: { followers: number | null; engagementPct: number | null; asOf: string } | null
  /** Only when not verified: what the creator typed. */
  selfReported: { followers: number | null; band: string | null } | null
  /** One line, built from stored facts and the brief's own words. */
  reason: string
  /** What could not be checked for this creator. */
  gaps: string[]
}

export type ChipGroup = 'hard' | 'must' | 'nice' | 'exclude'

/** One chip. Keys are `group:kind:value` for list items and `hard:kind` for
 *  the single-value filters. */
export type FilterKey = string

export interface Chip {
  key: FilterKey
  group: ChipGroup
  label: string
  edit: 'text' | 'niche' | 'language' | 'followers' | 'budget' | 'percent'
}

/** A filter the brand could drop, and how many creators that would show. */
export interface LoosenHint { key: FilterKey; label: string; wouldShow: number }

export interface CreatorSearchResponse {
  ok: true
  searchId: string
  brief: string
  filters: BriefFilters
  results: CreatorSearchResult[]
  /** Said plainly when the list is empty or thin. */
  notice: string | null
  loosen: LoosenHint | null
  /** Asks the data cannot check, said plainly. */
  notChecked: string[]
}

export interface CreatorSearchError {
  ok: false
  message: string
  kind: 'off' | 'unauthorised' | 'bad_request' | 'rate_limited' | 'unreadable' | 'failed' | 'not_found'
}

export const RESULT_CAP = 20
