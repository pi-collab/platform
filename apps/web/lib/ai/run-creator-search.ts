import 'server-only'
import { loadCreatorPool } from './creator-pool'
import { notChecked, rankCreators, suggestLoosen } from './rank-creators'
import { RESULT_CAP, type BriefFilters, type CreatorSearchResponse } from './creator-search-types'

/** Below this many results, the brand is told the list is thin. */
const THIN = 3

/**
 * Validated filters → ranked results, the notice for an empty or thin list,
 * and the one filter worth loosening. Shared by the API route and the page
 * (which reopens a saved search), so both answer the same way.
 */
export async function runCreatorSearch(filters: BriefFilters): Promise<Omit<CreatorSearchResponse, 'ok' | 'searchId' | 'brief'>> {
  const pool = await loadCreatorPool(filters)
  const { results, hiddenUnverified, outsideIndia } = rankCreators(pool, filters, RESULT_CAP)

  let notice: string | null = null
  let loosen = null

  if (outsideIndia) {
    notice = 'Creators on Guapd are based in India, so none match a search outside it.'
  } else if (results.length < THIN) {
    // The whole opted-in pool, so a follower or budget filter can be tested too.
    const everyone = await loadCreatorPool(null)
    if (everyone.length === 0) {
      notice = 'No creators have joined Guapd AI search yet.'
    } else {
      loosen = suggestLoosen(everyone, filters, results.length)
      notice = results.length === 0
        ? 'No creators on Guapd match all of this yet.'
        : `Only ${results.length} ${results.length === 1 ? 'creator matches' : 'creators match'} all of this.`
    }
  }
  if (hiddenUnverified > 0) {
    const more = `${hiddenUnverified} more ${hiddenUnverified === 1 ? 'creator' : 'creators'} may fit, but their engagement is not verified.`
    notice = notice ? `${notice} ${more}` : more
  }

  return { filters, results, notice, loosen, notChecked: notChecked(filters) }
}
