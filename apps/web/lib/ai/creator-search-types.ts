/**
 * Guapd AI creator search: the filter contract and the result shapes.
 *
 * CLIENT-SAFE. The brief parser (lib/ai/brief-filters.ts) and the pool loader
 * (lib/ai/creator-pool.ts) are server-only; the ranker (lib/ai/rank-creators.ts)
 * is pure. The page and the API route share these shapes.
 *
 * BriefFiltersSchema is the ONE gate every filter set passes before it reaches
 * a query: the model's output, and every chip edit a brand sends back. It is
 * strict: an unknown key, a wrong type, an out-of-range number or a term with
 * characters outside letters, numbers and a little punctuation is rejected,
 * never repaired.
 */

import { z } from 'zod'
import { NICHES, OTHER_NICHE } from '@/lib/niches'

/** The niches a brief may name: the app's list, without Other. */
export const SEARCH_NICHES = NICHES.filter((n) => n !== OTHER_NICHE) as unknown as [string, ...string[]]

/** A word or short phrase from a brief. Letters (any script, with their vowel
 *  signs: Hindi needs \p{M}), numbers, spaces and & ' . - only: nothing that
 *  could read as markup or an operator. */
// Built with the constructor: the TS target predates the `u` flag in literals.
const TERM = new RegExp("^[\\p{L}\\p{N}][\\p{L}\\p{M}\\p{N} &'.-]*$", 'u')
const Term = z.string().trim().min(1).max(40).regex(TERM)

const Count = z.number().int().min(0).max(1_000_000_000)
const Rupees = z.number().int().min(0).max(100_000_000)

export const BriefFiltersSchema = z.object({
  niches: z.array(z.enum(SEARCH_NICHES)).max(5),
  /** Subjects the brand named ("home fragrance", "styling"), matched against
   *  each creator's bio and niche. */
  keywords: z.array(Term).max(8),
  cities: z.array(Term).max(3),
  country: Term.nullable(),
  /** Read from the brief and shown, but not used: no creator languages are
   *  stored yet. */
  languages: z.array(Term).max(3),
  followersMin: Count.nullable(),
  followersMax: Count.nullable(),
  /** Percent, e.g. 3 for 3%. Only a connected Instagram can meet it. */
  minEngagementPct: z.number().min(0).max(100).nullable(),
  /** Per creator, in rupees. */
  budgetMinRupees: Rupees.nullable(),
  budgetMaxRupees: Rupees.nullable(),
  /** Asks the filters cannot express ("aesthetic", "premium"), shown as not used. */
  unused: z.array(Term).max(6),
}).strict()
  .refine((f) => f.followersMin === null || f.followersMax === null || f.followersMin <= f.followersMax, 'followers range is reversed')
  .refine((f) => f.budgetMinRupees === null || f.budgetMaxRupees === null || f.budgetMinRupees <= f.budgetMaxRupees, 'budget range is reversed')

export type BriefFilters = z.infer<typeof BriefFiltersSchema>

export const EMPTY_BRIEF_FILTERS: BriefFilters = {
  niches: [], keywords: [], cities: [], country: null, languages: [],
  followersMin: null, followersMax: null, minEngagementPct: null,
  budgetMinRupees: null, budgetMaxRupees: null, unused: [],
}

/** Validate anything claiming to be filters. Null means rejected. */
export function validateFilters(input: unknown): BriefFilters | null {
  const r = BriefFiltersSchema.safeParse(input)
  if (!r.success) return null
  const f = r.data
  const uniq = (xs: string[]) => Array.from(new Set(xs.map((x) => x.toLowerCase())))
  return { ...f, niches: Array.from(new Set(f.niches)), keywords: uniq(f.keywords), cities: uniq(f.cities), languages: uniq(f.languages), unused: uniq(f.unused) }
}

/** One creator card. Only what a brand may see before a deal: no phone, email,
 *  rate card, UPI, tokens or audience demographics. Verified and self-reported
 *  figures are separate fields and never mixed. */
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
  /** One line, built from stored facts only. */
  reason: string
  /** What could not be checked for this creator. */
  gaps: string[]
}

/** A filter the brand could drop, and how many creators that would show. */
export interface LoosenHint {
  key: FilterKey
  label: string
  wouldShow: number
}

export type FilterKey =
  | `niche:${string}` | `keyword:${string}` | `city:${string}` | `language:${string}`
  | 'country' | 'followers' | 'engagement' | 'budget'

export interface CreatorSearchResponse {
  ok: true
  searchId: string
  brief: string
  filters: BriefFilters
  results: CreatorSearchResult[]
  /** Said plainly when the list is empty or thin. */
  notice: string | null
  loosen: LoosenHint | null
  /** Filters read from the brief that the data cannot check yet. */
  notChecked: string[]
}

export interface CreatorSearchError {
  ok: false
  message: string
  kind: 'off' | 'unauthorised' | 'bad_request' | 'rate_limited' | 'unreadable' | 'failed' | 'not_found'
}

export const RESULT_CAP = 20
