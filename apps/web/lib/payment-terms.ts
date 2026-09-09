/**
 * Payment terms: how many days after POSTING the creator is paid.
 *
 * ── Why this is the only structure ─────────────────────────────────────────
 * "100% advance" and "50% advance, 50% after approval" were built and then
 * removed before shipping. Both describe money moving in a way the platform
 * cannot execute: v1 tracks payment, it does not hold or split it, so those
 * options recorded an agreement nothing downstream could act on and the
 * invoice would still have issued one full amount. Add them back when the
 * payment rails can actually honour them.
 *
 * ── Why posting, and not approval ─────────────────────────────────────────
 * This is what the code has always measured. createInvoice refuses to raise an
 * invoice until deal.is_posted, and the due date is computed at that moment
 * from these terms. So the clock has always started when the content went
 * live; "after approval" named an earlier event than the one being counted
 * from, and told a creator the money was due sooner than it was.
 *
 * ── The stored value is a STRING, and its wording is load-bearing ──────────
 * payment_terms stays a text column: lib/invoice.ts reads a due-day count out
 * of this text and every screen already renders it. netTerms() is worded to
 * survive that parser, which checks "on approval" BEFORE it checks for a day
 * count — a legacy branch that must keep working for deals already agreed.
 * "N days after posting" carries neither "approval" nor "advance", so it falls
 * straight through to the day regex and returns N. Re-read
 * parsePaymentTermsDays before rewording this.
 */

/** Day counts offered in the builder. Any positive integer is storable. */
export const PAYMENT_DAY_OPTIONS = [7, 15, 30, 45, 60, 90] as const

/** The exact string stored on the deal. */
export function netTerms(days: number): string {
  return `${days} days after posting`
}

/**
 * How to say when the creator gets paid, for a "Payment in ___" slot.
 *
 * The mobile offer screen used to regex a day count out of the terms and fall
 * back to "30 days" whenever it found none — so any deal whose terms carried
 * no number told the creator to expect the money in 30 days regardless of what
 * had been agreed. Terms with no day count are not 30-day terms.
 *
 * The advance branches are for LEGACY deals only. Nothing writes those strings
 * any more, but deals agreed under the old presets still carry them and their
 * creators still open the screen.
 */
export function paymentWhenLabel(terms: string | null | undefined): string | null {
  if (!terms) return null
  const t = terms.toLowerCase()

  // Legacy wording, no longer offered.
  if (t.includes('advance') && !t.includes('approval')) return 'Upfront'
  if (t.includes('advance') && t.includes('approval')) return 'Half upfront'

  const m = /(\d+)\s*days?/.exec(t)
  /* Legacy deals say "after approval" and are rendered from their own stored
     string elsewhere; this slot only needs the count and the current rule. */
  if (m) return `${m[1]} days after posting`

  // Custom or legacy wording with no day count ("100% on approval"). Show
  // nothing rather than invent a number — the full terms line beside this slot
  // already says it in the creator's own words.
  return null
}
