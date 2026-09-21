/**
 * AI creator search: the shapes shared by the parser, the ranker and the UI.
 *
 * CLIENT-SAFE. The parser is server-only (it holds the API key) and the
 * candidate fetch is server-only (it uses the admin client), but the results
 * cross to the browser, so their types live here.
 */

import { NICHES } from '@/lib/niches'

/** The niches the parser may choose from. The app's own list, not a new one:
 *  a filter naming a category the storefront editor cannot produce matches
 *  nobody, and looks like a bug rather than an empty result. */
export const SEARCH_NICHES = NICHES

export type SearchPlatform = 'instagram' | 'youtube'

/** Instagram's own age buckets, which is what a verified snapshot carries. */
export const AGE_BANDS = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'] as const
export type AgeBand = (typeof AGE_BANDS)[number]

/**
 * A query, understood.
 *
 * Every field is optional in meaning: null or empty means "not asked for", and
 * an unasked filter never affects the ranking. The parser is told to leave a
 * field empty rather than guess, because a guessed filter silently removes
 * creators a brand never excluded.
 */
export interface SearchFilters {
  niches: string[]
  platforms: SearchPlatform[]
  /** Free text as typed: "Mumbai", "metros", "south India". Matched loosely. */
  locations: string[]
  followersMin: number | null
  followersMax: number | null
  /** In rupees, as a person says it. Converted to paise where it is compared. */
  budgetRupees: number | null
  audience: {
    ageBands: AgeBand[]
    /** Which way the audience should skew, when asked for. */
    genderSkew: 'women' | 'men' | null
    cities: string[]
  }
  /** "worked with fintech before" -> ["fintech"]. */
  pastBrandCategories: string[]
  /** Fuzzy asks v1 cannot evaluate ("premium", "authentic"), kept so the UI can
   *  say they were not used rather than pretend they were. */
  unusedTerms: string[]
}

export const EMPTY_FILTERS: SearchFilters = {
  niches: [],
  platforms: [],
  locations: [],
  followersMin: null,
  followersMax: null,
  budgetRupees: null,
  audience: { ageBands: [], genderSkew: null, cities: [] },
  pastBrandCategories: [],
  unusedTerms: [],
}

/**
 * One creator, as the ranker sees them.
 *
 * Every field that can be absent is explicitly nullable, and the ranker treats
 * absent as UNKNOWN rather than as zero or as a mismatch. That distinction is
 * the whole design: most of these fields are empty for most creators today.
 */
export interface SearchCandidate {
  id: string
  fullName: string
  handle: string | null
  photoUrl: string | null
  slug: string | null
  /** Verified count where Instagram is connected, otherwise the typed one. */
  followers: number | null
  followersVerified: boolean
  followerBand: string | null
  platforms: SearchPlatform[]
  /** Storefront categories first; the profile niche is the fallback. */
  categories: string[]
  location: string | null
  bio: string | null
  /** Lowest published package price, in paise. Null means none published. */
  startingRatePaise: number | null
  /** Only ever from a connected account's snapshot. Never inferred. */
  audience: {
    topAgeBand: AgeBand | null
    womenPct: number | null
    topCities: string[]
  } | null
  pastBrands: string[]
  /** Completed deals on Guapd. Zero today for everyone; the weight is ready. */
  completedDeals: number
}

/** How strongly a creator answers the query, given what is known about them. */
export type MatchStrength = 'strong' | 'good' | 'possible'

export interface SearchResult {
  candidate: SearchCandidate
  score: number
  strength: MatchStrength
  /** Facts that matched, each read from a stored field. Never generated prose. */
  reasons: string[]
  /** What could not be checked for this creator, named plainly. */
  gaps: string[]
}

/** A filter the ranker could not apply as a filter, and why. */
export interface SkippedFilter {
  label: string
  reason: string
}

export interface SearchResponse {
  ok: true
  filters: SearchFilters
  results: SearchResult[]
  /** Filters that ranked rather than excluded, because the data is too thin. */
  softened: SkippedFilter[]
  /** Candidates dropped by a hard filter, for the "and N more" line. */
  excludedCount: number
  cacheHit: boolean
}

export interface SearchFailure {
  ok: false
  /** Shown to the brand. Says what to do, not what broke. */
  message: string
  /** 'unconfigured' means no API key: the manual filters still work. */
  kind: 'unconfigured' | 'rate_limited' | 'empty_query' | 'failed'
}

export type SearchOutcome = SearchResponse | SearchFailure
