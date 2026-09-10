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
  /* Waiting on the BRAND. Only 'delivered' qualifies on status alone: there is
     work in front of them to review.

     'approved' was here and should not be - the brand has already approved, and
     what happens next is the creator posting and invoicing. Five of a brand's
     fifty-seven deals were being counted as their move when there was nothing
     for them to do.

     'negotiating' was here too, and it depends: an offer the brand sent and is
     waiting on is not their move, while a counter the creator sent is. Status
     cannot tell those apart, so it is handled by the awaitingBrand flag in
     dealMatchesTab rather than by this list. */
  needs_you: ['delivered'],
  // "In review" is work sitting with the brand. A revision is with the CREATOR.
  delivered: ['delivered'],
  // In production: agreed and being made, or handed back and being remade.
  agreed: ['agreed', 'revision'],
  // "Posted" is paid or complete — plus anything flagged posted, which is the
  // is_posted clause below and cannot be expressed as a status list.
  paid: ['paid', 'complete'],
}

/** Tabs that also match on the is_posted flag, not only on status. */
const ALSO_POSTED = new Set(['paid'])

export interface CountableDeal {
  status: string
  is_posted?: boolean | null
  /** The creator countered and the brand has not answered. Derived from the
      counter events, since status cannot express whose move it is. */
  awaiting_brand?: boolean | null
}

/** Does this deal belong on that tab? The predicate the counts use. */
export function dealMatchesTab(deal: CountableDeal, tab: string): boolean {
  if (!tab || tab === 'all') return true

  /* A negotiation is the brand's move only when the creator moved last. */
  if (tab === 'needs_you' && deal.status === 'negotiating') {
    return deal.awaiting_brand === true
  }

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
