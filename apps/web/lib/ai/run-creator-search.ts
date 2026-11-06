import 'server-only'
import { loadCreatorPool } from './creator-pool'
import { notChecked, rankCreators, suggestLoosen, type RankOptions } from './rank-creators'
import { PAGE_SIZE, RANKED_CAP, type BriefFilters, type CreatorSearchResponse } from './creator-search-types'

/** Below this many matches in all, the brand is told the list is thin. */
const THIN = 3

export type SearchRun = Omit<CreatorSearchResponse, 'ok' | 'searchId' | 'brief'> & {
  /** The full ranked order (at most RANKED_CAP), stored for Load more. */
  rankedIds: string[]
}

/**
 * Validated filters → the FULL ranked order and its first page, the notice for
 * an empty or thin list, and the one filter worth loosening. Shared by the API
 * route and the page (which reopens a saved search), so both answer the same
 * way. Weak matches are never added: the order holds only creators who match.
 */
export async function runCreatorSearch(filters: BriefFilters, opts: RankOptions = {}): Promise<SearchRun> {
  const h = filters.hard
  const nothingAsked = filters.mustHave.niches.length + filters.mustHave.keywords.length
    + filters.niceToHave.niches.length + filters.niceToHave.keywords.length
    + filters.context.tone.length + (filters.context.productCategory ? 1 : 0)
    + h.cities.length + h.languages.length + (h.country ? 1 : 0)
    + [h.followersMin, h.followersMax, h.minEngagementPct, h.budgetMaxRupees].filter((v) => v !== null).length === 0
  const base = { filters, notChecked: notChecked(filters, opts), restricted: !!opts.restricted }
  if (filters.question && nothingAsked) {
    return { ...base, results: [], rankedIds: [], total: 0, hasMore: false, notice: null, loosen: null }
  }

  const pool = await loadCreatorPool(filters)
  const { results: all, hiddenUnverified, outsideIndia } = rankCreators(pool, filters, RANKED_CAP, opts)
  const results = all.slice(0, PAGE_SIZE)

  let notice: string | null = null
  let loosen = null
  if (outsideIndia) {
    notice = 'Creators on Guapd are based in India, so none match a search outside it.'
  } else if (all.length < THIN) {
    // Everyone searchable, so a follower or budget filter can be tested too.
    const everyone = await loadCreatorPool(null)
    if (everyone.length === 0) {
      notice = 'No creators can be shown in Guapd AI search yet.'
    } else {
      loosen = suggestLoosen(everyone, filters, all.length, opts)
      notice = all.length === 0
        ? 'No creators on Guapd match all of this yet.'
        : `Only ${all.length} ${all.length === 1 ? 'creator matches' : 'creators match'} all of this.`
    }
  }
  if (hiddenUnverified > 0) {
    const more = `${hiddenUnverified} more ${hiddenUnverified === 1 ? 'creator' : 'creators'} may fit, but their engagement is not verified.`
    notice = notice ? `${notice} ${more}` : more
  }

  return { ...base, results, rankedIds: all.map((r) => r.id), total: all.length, hasMore: all.length > PAGE_SIZE, notice, loosen }
}

/**
 * The next page of a saved search, from its STORED order (never re-ranked), so
 * no creator can appear twice and nothing shifts. Each card is rebuilt from
 * today's data; a creator who no longer qualifies (hidden, no longer on
 * Browse, no longer matching) is skipped, never replaced by a weaker match.
 */
export async function pageOfSearch(filters: BriefFilters, rankedIds: string[], offset: number, opts: RankOptions = {}) {
  const ids = rankedIds.slice(offset, offset + PAGE_SIZE)
  if (ids.length === 0) return { results: [], nextOffset: offset, hasMore: false }
  const pool = await loadCreatorPool(filters)
  const fresh = new Map(rankCreators(pool, filters, RANKED_CAP, opts).results.map((r) => [r.id, r]))
  const results = ids.map((id) => fresh.get(id)).filter((r): r is NonNullable<typeof r> => !!r)
  const nextOffset = offset + ids.length
  return { results, nextOffset, hasMore: nextOffset < rankedIds.length }
}
