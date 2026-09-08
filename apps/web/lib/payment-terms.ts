/**
 * Payment terms: how many days after approval the creator is paid.
 *
 * ── Why this is the only structure ─────────────────────────────────────────
 * "100% advance" and "50% advance, 50% after approval" were built and then
 * removed before shipping. Both describe money moving in a way the platform
 * cannot execute: v1 tracks payment, it does not hold or split it, so those
 * options recorded an agreement nothing downstream could act on and the
 * invoice would still have issued one full amount. Add them back when the
 * payment rails can actually honour them.
 *
 * ── The stored value is a STRING, and its wording is load-bearing ──────────
 * payment_terms stays a text column: lib/invoice.ts reads a due-day count out
 * of this text and every screen already renders it. netTerms() is worded to
 * survive that parser, which checks "on approval" BEFORE it checks for a day
 * count. "N days AFTER approval" reaches the day regex and returns N.
 * "N days ON approval" would return 0 and silently make every invoice due the
 * day it was raised. Re-read parsePaymentTermsDays before rewording this.
 */

/** Day counts offered in the builder. Any positive integer is storable. */
export const PAYMENT_DAY_OPTIONS = [7, 15, 30, 45, 60, 90] as const

/** The exact string stored on the deal. */
export function netTerms(days: number): string {
  return `${days} days after approval`
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
  if (m) return `${m[1]} days after approval`

  // Custom or legacy wording with no day count ("100% on approval"). Show
  // nothing rather than invent a number — the full terms line beside this slot
  // already says it in the creator's own words.
  return null
}
