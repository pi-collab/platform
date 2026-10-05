/**
 * THE rounding rule for taking a percentage of money. One place, used by both
 * lib/fee.ts (calculateFee, every marketplace deal) and
 * lib/experience-money.ts (Experience legs and margin), so a fee and a margin
 * can never round differently.
 *
 *   percentOfPaise(amount, pct) = amount × pct / 100, rounded HALF UP to the paisa
 *
 * Computed in integers (BigInt): the percentage is read as an exact decimal
 * (up to 10 places) so 33.3 is 333/10, never the binary float 33.29999…
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * calculateFee used Math.round(base × pct / 100). In floating point,
 * 7500 × 33.3 / 100 is 2497.4999999999995, not 2497.5, so an exact half paisa
 * rounded DOWN. At whole-number rates (15, 30) the two always agreed; the
 * error only appeared on fractional ops rates. Same answers everywhere else.
 */

function pctAsFraction(pct: number): { num: bigint; den: bigint } {
  if (!Number.isFinite(pct) || pct < 0) throw new Error(`percentage must be a finite number ≥ 0, got ${pct}`)
  // toFixed avoids exponent notation; trailing zeros are trimmed so 15 → "15".
  const s = pct.toFixed(10).replace(/0+$/, '').replace(/\.$/, '')
  const [int, frac = ''] = s.split('.')
  return { num: BigInt(int + frac), den: BigInt('1' + '0'.repeat(frac.length)) }
}

/** amount × pct / 100, half up, in whole paise. amount must be whole paise ≥ 0. */
export function percentOfPaise(amountPaise: number, pct: number): number {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) throw new Error(`amount must be whole paise ≥ 0, got ${amountPaise}`)
  const { num, den } = pctAsFraction(pct)
  // value = amount·num / (den·100); half up = floor((2·amount·num + den·100) / (2·den·100))
  const twice = BigInt(2) * BigInt(amountPaise) * num
  const unit = den * BigInt(100)
  return Number((twice + unit) / (BigInt(2) * unit))
}
