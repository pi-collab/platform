/**
 * Currency formatting — the single place paise become a display string.
 *
 * Money is stored as integer paise everywhere (never float). Raw paise must
 * never reach a user-facing surface, and especially never leave the server in
 * an outbound message — always format through here.
 *
 * India-only today (INR, lakh/crore grouping via en-IN). When multi-currency
 * lands, this is the one function that has to learn about `deals.currency`
 * rather than a scattering of hard-coded "₹" and ×100 arithmetic.
 */

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** Format integer paise as INR for display, e.g. 6000000 → "₹60,000". */
export function formatPaiseINR(paise: number): string {
  const safe = Number.isFinite(paise) ? Math.round(paise) : 0
  return INR.format(safe / 100)
}

/**
 * Format an amount for an outbound WhatsApp template variable.
 *
 * WhatsApp/Meta rejects empty body parameters, and a literal "₹0" is
 * misleading on deals where no price is set yet (a storefront pitch inserts
 * `price_paise: 0` by design — the price is negotiated in the thread). Those
 * get an explicit human phrase instead of a fake zero.
 */
export function formatAmountForMessage(paise: number | null | undefined): string {
  if (!paise || paise <= 0) return 'Amount to be discussed'
  return formatPaiseINR(paise)
}

/**
 * A rupee amount at a glance: ₹50K, ₹1.2L, ₹2.4Cr.
 *
 * Indian units, not K/M. A rate card scanned on a phone is being compared, not
 * added up, and "₹1,20,000" costs a line of width to say what "₹1.2L" says in
 * four characters. The exact figure is still what the total and the offer use;
 * this is only for the glance.
 *
 * One decimal, and a trailing ".0" is dropped so a round number reads round:
 * 1L rather than 1.0L.
 */
export function compactINR(paise: number): string {
  const rupees = Math.round(paise / 100)
  const trim = (n: number) => String(Number(n.toFixed(1)))
  if (rupees >= 1_00_00_000) return `\u20B9${trim(rupees / 1_00_00_000)}Cr`
  if (rupees >= 1_00_000) return `\u20B9${trim(rupees / 1_00_000)}L`
  if (rupees >= 1_000) return `\u20B9${trim(rupees / 1_000)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}
