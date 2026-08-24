/**
 * How a package's rate is written down, everywhere it is shown.
 *
 * One formatter rather than a `display_price ? … : 'On request'` at each call
 * site: there are now four modes, and the shopfront, the brand browse page, the
 * ops console and the deal builder must not disagree about what a package
 * costs.
 *
 * This is presentation only. A deal carries one agreed number — see migration
 * 0477. Nothing here should be fed into arithmetic.
 */

/**
 * Every mode the DATABASE accepts.
 *
 * 'exact' and 'range' are no longer offered, but they are still stored against
 * packages priced before the choice narrowed — and validation runs against this
 * list, so removing them would make editing one of those fail on a value its
 * creator never picked.
 */
export const PRICE_MODES = ['exact', 'from', 'range', 'on_request'] as const
export type PriceMode = (typeof PRICE_MODES)[number]

/**
 * What a creator is actually offered.
 *
 * Two, because a minimum already answers what a fixed price answers — "from
 * ₹60,000" on a package that never varies is simply true — and a range asks
 * someone to name a ceiling they have no reason to commit to. The upper end is
 * the negotiation.
 */
export const OFFERED_PRICE_MODES = ['from', 'on_request'] as const

export const PRICE_MODE_LABELS: Record<PriceMode, string> = {
  exact: 'Fixed price',
  from: 'Starting from',
  range: 'Price range',
  on_request: 'Price on request',
}

export const PRICE_MODE_HINTS: Record<PriceMode, string> = {
  exact: 'One rate, shown as it is.',
  // The second sentence is the part creators ask about: a minimum is not only
  // what brands see, it is what we hold offers to.
  from: 'A minimum. Brands see “From ₹60,000” — and you won’t be shown deals below it.',
  range: 'A low and a high end, for work that varies.',
  on_request: 'No figure shown. Brands ask.',
}

export interface PricedProduct {
  price_paise: number
  price_mode?: string | null
  price_max_paise?: number | null
  /** Legacy flag. Respected so rows predating price_mode still hide correctly. */
  display_price?: boolean | null
}

/**
 * Indian digit grouping, whole rupees.
 *
 * Paise are dropped rather than rounded: rate cards are quoted in thousands,
 * and "₹59,999.50" reads like a bug even when it is arithmetically honest.
 */
export function formatRupeesShort(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`
}

/**
 * The rate as a brand should read it.
 *
 * Returns null when there is nothing to show, so a caller can drop the element
 * entirely rather than print an empty string — `formatProductPrice(p) ?? 'On
 * request'` is the usual line.
 */
export function formatProductPrice(p: PricedProduct): string | null {
  const mode = normalizePriceMode(p)

  switch (mode) {
    case 'on_request':
      return null
    case 'from':
      return `From ${formatRupeesShort(p.price_paise)}`
    case 'range':
      // An en dash, not a hyphen: this is a span between two numbers.
      return p.price_max_paise != null
        ? `${formatRupeesShort(p.price_paise)}–${formatRupeesShort(p.price_max_paise)}`
        : formatRupeesShort(p.price_paise)
    case 'exact':
    default:
      return formatRupeesShort(p.price_paise)
  }
}

/**
 * The mode to act on, reconciling the legacy flag.
 *
 * `display_price = false` predates price_mode and meant exactly what
 * on_request means now, so a row still carrying it is treated as on_request
 * regardless of what mode says. Rows written since always agree, because the
 * save action derives one from the other.
 */
export function normalizePriceMode(p: PricedProduct): PriceMode {
  if (p.display_price === false) return 'on_request'
  const mode = p.price_mode
  return (PRICE_MODES as readonly string[]).includes(mode ?? '') ? (mode as PriceMode) : 'exact'
}

/**
 * The figure to prefill when a brand builds an offer from this package.
 *
 * Every mode except on_request has a defensible starting number — the price,
 * the minimum, or the low end of the range — and the brand edits from there.
 * on_request has none, so it returns null and the brand types one.
 */
export function offerPrefillPaise(p: PricedProduct): number | null {
  return normalizePriceMode(p) === 'on_request' ? null : p.price_paise
}

/**
 * Is this a single, settled figure the brand simply accepts?
 *
 * Only 'exact' is. A minimum or a range is a starting point the brand adjusts,
 * and on-request has no number at all — both need an editable field. The offer
 * builders previously keyed off display_price, which is true for a range, so
 * they presented a floor as though it were the price.
 */
export function isFixedPrice(p: PricedProduct): boolean {
  return normalizePriceMode(p) === 'exact'
}
