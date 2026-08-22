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

export const PRICE_MODES = ['exact', 'from', 'range', 'on_request'] as const
export type PriceMode = (typeof PRICE_MODES)[number]

export const PRICE_MODE_LABELS: Record<PriceMode, string> = {
  exact: 'Fixed price',
  from: 'Starting from',
  range: 'Price range',
  on_request: 'Price on request',
}

export const PRICE_MODE_HINTS: Record<PriceMode, string> = {
  exact: 'One rate, shown as it is.',
  from: 'A minimum. Brands see “From ₹60,000”.',
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
