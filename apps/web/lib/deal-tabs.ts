/**
 * Which deal statuses belong to which tab.
 *
 * ONE definition, used by the query that filters the rows AND by the count on
 * the tab. They were separate: the query filtered server-side across every deal,
 * while the counts were derived client-side from `deals` — the already filtered,
 * already paginated page. So "All" counted one page, and the moment any filter
 * was active every other tab counted zero, because those rows were not in the
 * response. A brand saw "In review 0", clicked it, and got two.
 *
 * Any tab whose membership is more than a plain status equality has to be
 * expressed here, or the two sides drift again the next time one is edited.
 */

/** Statuses that make up each tab. A tab absent from this map matches its own
 *  status exactly. */
export const TAB_STATUSES: Record<string, string[]> = {
  // Anything waiting on the BRAND to act.
  needs_you: ['negotiating', 'delivered', 'approved'],
  // "In review" covers a first delivery and a re-delivery after revision.
  delivered: ['delivered', 'revision'],
  // "Posted" is paid or complete — plus anything flagged posted, which is the
  // is_posted clause below and cannot be expressed as a status list.
  paid: ['paid', 'complete'],
}

/** Tabs that also match on the is_posted flag, not only on status. */
const ALSO_POSTED = new Set(['paid'])

export interface CountableDeal {
  status: string
  is_posted?: boolean | null
}

/** Does this deal belong on that tab? The predicate the counts use. */
export function dealMatchesTab(deal: CountableDeal, tab: string): boolean {
  if (!tab || tab === 'all') return true

  const statuses = TAB_STATUSES[tab]
  if (statuses) {
    if (statuses.includes(deal.status)) return true
    if (ALSO_POSTED.has(tab) && deal.is_posted === true) return true
    return false
  }

  return deal.status === tab
}

/**
 * Counts for every tab, over the brand's WHOLE set of deals.
 *
 * Computed from an unfiltered, unpaginated census rather than from the rows on
 * screen, which is the whole point: a tab count answers "how many are there",
 * not "how many did this page happen to return".
 */
export function countDealsByTab(deals: CountableDeal[], tabs: string[]): Record<string, number> {
  const out: Record<string, number> = { all: deals.length }
  for (const tab of tabs) {
    if (tab === 'all') continue
    out[tab] = deals.filter((d) => dealMatchesTab(d, tab)).length
  }
  return out
}
