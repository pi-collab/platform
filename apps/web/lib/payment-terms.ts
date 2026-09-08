/**
 * The three payment structures a deal can carry, and their canonical wording.
 *
 * payment_terms stays a TEXT column holding one of these exact strings, rather
 * than becoming structured columns. Two reasons:
 *
 *   1. lib/invoice.ts already reads a due-day count out of this text, and every
 *      screen already renders it. Restructuring the column means touching the
 *      invoice flow and thirteen surfaces to express what the string already
 *      expresses correctly.
 *   2. The strings below are chosen so parsePaymentTermsDays() reads them right
 *      as they are. "N days after approval" reaches the day regex because it
 *      says AFTER approval, not "on approval". Change that wording and the due
 *      date silently becomes today on every deal - so if these strings are ever
 *      edited, re-read that parser first.
 *
 * WHAT IS RECORDED IS NOT WHAT IS ENFORCED. A 50/50 deal records that terms,
 * and the invoice still issues one amount: split invoicing does not exist yet.
 * That matches how v1 treats payment throughout - terms are an agreement on the
 * record, not something the platform executes.
 */

export const PAYMENT_STRUCTURES = {
  net: 'net',
  fullAdvance: 'full_advance',
  halfHalf: 'half_half',
} as const

/** Day counts offered for "N days after approval". */
export const PAYMENT_DAY_OPTIONS = [7, 15, 30, 45, 60, 90] as const

export const FULL_ADVANCE_TERMS = '100% advance'
export const HALF_HALF_TERMS = '50% advance, 50% after approval'

/** The exact string stored on the deal. */
export function netTerms(days: number): string {
  return `${days} days after approval`
}

/**
 * How to say when the creator gets paid, for a "Payment in ___" slot.
 *
 * The mobile offer screen used to regex a day count out of the terms and fall
 * back to "30 days" whenever it found none — so a 100% advance deal, which is
 * paid up front, told the creator to expect the money in 30 days. A structure
 * with no day count is not a 30-day structure.
 */
export function paymentWhenLabel(terms: string | null | undefined): string | null {
  if (!terms) return null
  const t = terms.toLowerCase()

  if (t.includes('advance') && !t.includes('approval')) return 'Upfront'
  if (t.includes('advance') && t.includes('approval')) return 'Half upfront'

  const m = /(\d+)\s*days?/.exec(t)
  if (m) return `${m[1]} days after approval`

  // Custom or legacy wording: show nothing rather than invent a number. The
  // full terms line is rendered beside this slot and already says it.
  return null
}
