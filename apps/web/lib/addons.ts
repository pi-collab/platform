/**
 * Collab and Boosting add-on pricing.
 *
 * Every function here takes integers in paise and returns integers in paise.
 * No float ever enters this module, and nothing outside it may compute an
 * add-on amount.
 *
 * ── The one rule that keeps totals honest ────────────────────────────────────
 * A total is ALWAYS the sum of stored line amounts. It is never recomputed from
 * a rate.
 *
 * Round a percentage into each line and then re-derive the total from the same
 * percentage and you get two numbers that disagree by a rupee, one on the
 * invoice and one on the payment. Summing the lines cannot drift, because the
 * lines are what was summed. `dealTotal` below is the only sanctioned way to
 * total a deal, and it takes line amounts, not rates.
 *
 * ── Rounding ─────────────────────────────────────────────────────────────────
 * Round half-up, applied exactly ONCE per charge, expressed in integer
 * arithmetic: floor((a + d/2) / d) rather than Math.round(a / d), because the
 * latter divides in floating point first.
 */

export type CollabRateType = 'fixed' | 'percent'

/** What a creator charges on one channel. Nulls mean "not offered". */
export interface AddonRates {
  collabRateType: CollabRateType | null
  /** Paise when fixed; BASIS POINTS when percent (1000 = 10%). */
  collabRateValue: number | null
  boostingThirtyDayPaise: number | null
}

/** What was actually applied to one deliverable, ready to store. */
export interface AddonCharges {
  collabChargePaise: number | null
  collabRateType: CollabRateType | null
  collabRateValue: number | null
  boostingDays: number | null
  boostingChargePaise: number | null
  boostingThirtyDayPaise: number | null
}

export const EMPTY_ADDONS: AddonCharges = {
  collabChargePaise: null,
  collabRateType: null,
  collabRateValue: null,
  boostingDays: null,
  boostingChargePaise: null,
  boostingThirtyDayPaise: null,
}

/** 100% in basis points. */
export const BASIS_POINTS = 10_000
const BOOSTING_PERIOD_DAYS = 30

/**
 * Round half-up, in integers.
 *
 * `Math.round(a / d)` would divide in floating point before rounding, which is
 * the one thing this module exists to avoid. Both arguments must be
 * non-negative integers; every caller here passes paise or a count of days.
 */
function divRoundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator)
}

/** Does this channel offer a collab at all? */
export function offersCollab(rates: AddonRates | null | undefined): boolean {
  return !!rates && rates.collabRateType != null && rates.collabRateValue != null
}

/** Does this channel offer boosting at all? */
export function offersBoosting(rates: AddonRates | null | undefined): boolean {
  return !!rates && rates.boostingThirtyDayPaise != null && rates.boostingThirtyDayPaise > 0
}

/**
 * The collab charge for one deliverable.
 *
 * A percentage applies to THAT deliverable's own price, so 10% is ₹4,000 on a
 * ₹40,000 Short and ₹6,000 on a ₹60,000 Reel. Rounded once, here.
 */
export function collabCharge(pricePaise: number, rates: AddonRates): number {
  if (!offersCollab(rates)) return 0
  if (rates.collabRateType === 'fixed') return rates.collabRateValue as number
  return divRoundHalfUp(pricePaise * (rates.collabRateValue as number), BASIS_POINTS)
}

/**
 * The boosting charge for one deliverable.
 *
 * (30-day rate × days) ÷ 30, rounded ONCE at the end. Deriving a per-day rate
 * first and multiplying it would compound the rounding error: a ₹10,000/30-day
 * rate is ₹333.33/day, and seventeen roundings of that is not seventeen days of
 * the rate the creator set.
 */
export function boostingCharge(days: number, rates: AddonRates): number {
  if (!offersBoosting(rates) || days <= 0) return 0
  return divRoundHalfUp((rates.boostingThirtyDayPaise as number) * days, BOOSTING_PERIOD_DAYS)
}

/**
 * The per-day figure, FOR DISPLAY ONLY.
 *
 * Never multiply this back up — that is the compounding error above. It exists
 * so a brand can read "17 days × ₹333".
 */
export function boostingPerDayPaise(rates: AddonRates): number {
  if (!offersBoosting(rates)) return 0
  return divRoundHalfUp(rates.boostingThirtyDayPaise as number, BOOSTING_PERIOD_DAYS)
}

/**
 * Resolve both add-ons for one deliverable into the row that gets stored.
 *
 * The rate is snapshotted alongside the amount so an invoice can still explain
 * itself after the creator changes their rates.
 */
export function resolveAddons(input: {
  pricePaise: number
  rates: AddonRates | null | undefined
  wantsCollab: boolean
  boostingDays: number | null
}): AddonCharges {
  const { pricePaise, rates, wantsCollab, boostingDays } = input
  if (!rates) return { ...EMPTY_ADDONS }

  const collabOn = wantsCollab && offersCollab(rates)
  const days = boostingDays != null && boostingDays > 0 && offersBoosting(rates) ? boostingDays : null

  return {
    collabChargePaise: collabOn ? collabCharge(pricePaise, rates) : null,
    collabRateType: collabOn ? rates.collabRateType : null,
    collabRateValue: collabOn ? rates.collabRateValue : null,
    boostingDays: days,
    boostingChargePaise: days != null ? boostingCharge(days, rates) : null,
    boostingThirtyDayPaise: days != null ? rates.boostingThirtyDayPaise : null,
  }
}

/** One deliverable's total: its own price plus whatever was added to it. */
export function deliverableTotal(pricePaise: number, charges: AddonCharges): number {
  return pricePaise + (charges.collabChargePaise ?? 0) + (charges.boostingChargePaise ?? 0)
}

/**
 * The deal total.
 *
 * Takes LINE AMOUNTS, not rates, and that is the whole point: the total is
 * defined as the sum of the numbers shown on the invoice, so the two cannot
 * disagree. Any caller tempted to total a deal from percentages should call
 * this instead.
 */
export function dealTotal(lines: { pricePaise: number; charges: AddonCharges }[]): number {
  return lines.reduce((sum, l) => sum + deliverableTotal(l.pricePaise, l.charges), 0)
}

/** How a percentage reads to a person: 1000 -> "10%", 1050 -> "10.5%". */
export function formatBasisPoints(bp: number): string {
  const pct = bp / 100
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0$/, '')}%`
}

/** Percent typed by a creator ("10", "10.5") into basis points. */
export function percentToBasisPoints(input: string): number | null {
  const n = Number.parseFloat(input)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  // Rounded because 10.005% is not a rate anyone means to set, and basis points
  // are the storage precision.
  return Math.round(n * 100)
}
