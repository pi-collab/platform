/**
 * Experience money: two INDEPENDENT legs and a DERIVED margin.
 *
 * ── The model (locked) ──────────────────────────────────────────────────────
 *   Leg 1  brand ↔ Guapd    brandInvoiceSubtotal()  Guapd's price to the brand:
 *                                                   per_video × count + misc.
 *                                                   Takes ONLY brand-leg inputs.
 *   Leg 2  Guapd ↔ creator  creatorLegTerms()       gross → platform fee → net.
 *                                                   Takes ONLY creator-leg inputs.
 *   Margin                  experienceMargin()      ops P&L display only. Derived
 *                                                   from both, stored nowhere, and
 *                                                   never fed back into either leg.
 *
 * The two pricing functions share no inputs, so changing a creator's rate cannot
 * move the brand's invoice and changing the brand's price cannot move a
 * creator's pay. scripts/test-experience-money.ts proves it, and the database
 * stores no column that could carry one leg into the other.
 *
 * ── Rounding: defined once ──────────────────────────────────────────────────
 * platformFeePaise() is the only place a percentage of money is taken:
 * integer paise in, integer paise out, half rounded UP, computed in integers
 * (no float division). It agrees with lib/fee.ts calculateFee on every input
 * the baseline covers, and the database enforces the same rule on
 * experience_creator_terms (CHECK ect_net_formula, migration 0525).
 *
 * This file does not touch lib/fee.ts or lib/deal-fee.ts and is not a rung of
 * resolveDealFee. The fee baseline (scripts/test-fee-golden.ts) guards that.
 *
 * Client-safe: no database access.
 */

import { GROWTH_FEE_PERCENT, DEALS_STANDARD_FEE_PERCENT } from '@/lib/fee'
import { percentOfPaise } from '@/lib/money-round'

export type CreatorTrack = 'growth' | 'deals'

/** A creator's platform % comes from THEIR track: Growth 30, Deals 15. */
export function platformPctForTrack(track: CreatorTrack): number {
  return track === 'growth' ? GROWTH_FEE_PERCENT : DEALS_STANDARD_FEE_PERCENT
}

function assertPaise(n: number, what: string) {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${what} must be a non-negative whole number of paise, got ${n}`)
}

/**
 * The platform fee on an amount: round_half_up(amount × pct / 100), in paise.
 *
 * pct may carry up to two decimals (e.g. 12.5); it is scaled to basis points so
 * the whole calculation stays in integers: fee = floor((amount × bp + 5000) / 10000).
 */
export function platformFeePaise(amountPaise: number, pct: number): number {
  assertPaise(amountPaise, 'amount')
  const bp = Math.round(pct * 100)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100 || Math.abs(bp - pct * 100) > 1e-6) {
    throw new Error(`platform % must be 0–100 with at most two decimals, got ${pct}`)
  }
  // The shared rule, so a fee and a margin round identically everywhere.
  return percentOfPaise(amountPaise, pct)
}

// ── Leg 1: Guapd's price to the brand ───────────────────────────────────────

export interface BrandPricing {
  perVideoPaise: number
  deliverableCount: number
  miscPaise: number
}

/** Leg 1 subtotal (before any tax): per_video × count + misc. Brand inputs only. */
export function brandInvoiceSubtotal(p: BrandPricing): number {
  assertPaise(p.perVideoPaise, 'per-video price')
  assertPaise(p.miscPaise, 'misc')
  if (!Number.isSafeInteger(p.deliverableCount) || p.deliverableCount < 0) throw new Error('deliverable count must be a whole number ≥ 0')
  const total = p.perVideoPaise * p.deliverableCount + p.miscPaise
  if (!Number.isSafeInteger(total)) throw new Error('brand total is too large')
  return total
}

// ── Leg 2: Guapd's terms with a creator ─────────────────────────────────────

export interface CreatorLegInput {
  /** Either day rate × days … */
  dayRatePaise?: number
  days?: number
  /** … or a gross amount agreed directly. */
  grossPaise?: number
  /** The creator's own track, read at send time. */
  track: CreatorTrack
}

export interface CreatorLegTerms {
  creatorGrossPaise: number
  platformTrack: CreatorTrack
  platformPct: number
  platformFeePaise: number
  creatorNetPaise: number
}

/** Leg 2 terms: gross → fee at the creator's track % → net. Creator inputs only. */
export function creatorLegTerms(input: CreatorLegInput): CreatorLegTerms {
  let gross: number
  if (input.grossPaise !== undefined) {
    gross = input.grossPaise
  } else {
    assertPaise(input.dayRatePaise ?? -1, 'day rate')
    const days = input.days ?? NaN
    // Half days are allowed; a day count with more than two decimals is not.
    if (!(days > 0) || Math.abs(Math.round(days * 100) - days * 100) > 1e-6) throw new Error('days must be > 0 with at most two decimals')
    gross = Number((BigInt(input.dayRatePaise!) * BigInt(Math.round(days * 100)) + BigInt(50)) / BigInt(100))
  }
  assertPaise(gross, 'creator gross')
  const pct = platformPctForTrack(input.track)
  const fee = platformFeePaise(gross, pct)
  return { creatorGrossPaise: gross, platformTrack: input.track, platformPct: pct, platformFeePaise: fee, creatorNetPaise: gross - fee }
}

// ── Margin: derived, ops P&L only ───────────────────────────────────────────

export interface MarginInput {
  /** Leg 1 revenue: subtotals (ex-tax) of the brand's ISSUED or PAID service invoices. */
  brandInvoiceSubtotalsPaise: number[]
  /** Leg 2: each creator leg the creator ACCEPTED (deal status agreed onward).
   *  Not "locked": since 0534 terms lock at SEND, so an unanswered or declined
   *  leg is locked too and must not be counted (0537). */
  creatorLegs: Pick<CreatorLegTerms, 'creatorGrossPaise' | 'creatorNetPaise'>[]
  /** Guapd's own costs (cost lines Guapd bears: travel, makeup, editing, misc…). */
  guapdCostsPaise: number[]
}

/**
 * The Experience P&L. One margin, two views of it (Palak, 2026-10-05):
 *
 *   brand revenue
 *   − creator payouts at GROSS
 *   − other costs                     (shown even when ₹0)
 *   = sub-total
 *   + platform fee kept               (Σ per leg, each at its own snapshotted %)
 *   = Guapd margin                    = brand revenue − Σ creator NET − costs
 *
 * The fee line is the gross → net reconciliation, not an extra amount: the
 * margin is what Guapd actually keeps (money in − money actually paid out).
 */
export interface MarginBreakdown {
  brandRevenuePaise: number
  creatorGrossTotalPaise: number
  creatorNetTotalPaise: number
  guapdCostsTotalPaise: number
  /** brand − Σ creator GROSS − costs */
  subtotalPaise: number
  /** Σ (gross − net) per leg: never a blanket % on pooled creator spend */
  platformFeeKeptPaise: number
  /** THE margin: brand − Σ creator NET − costs  (= subtotal + fee kept) */
  guapdMarginPaise: number
}

/** The Experience P&L. Ops/financial only; never shown to a brand or a creator. */
export function experienceMargin(m: MarginInput): MarginBreakdown {
  const sum = (xs: number[], what: string) => xs.reduce((a, x) => { assertPaise(x, what); return a + x }, 0)
  const brandRevenuePaise = sum(m.brandInvoiceSubtotalsPaise, 'brand invoice subtotal')
  const creatorGrossTotalPaise = sum(m.creatorLegs.map(l => l.creatorGrossPaise), 'creator gross')
  const creatorNetTotalPaise = sum(m.creatorLegs.map(l => l.creatorNetPaise), 'creator net')
  // Per leg, then summed: each leg carries its own track's fee already.
  const platformFeeKeptPaise = m.creatorLegs.reduce((a, l) => a + (l.creatorGrossPaise - l.creatorNetPaise), 0)
  const guapdCostsTotalPaise = sum(m.guapdCostsPaise, 'cost')
  const subtotalPaise = brandRevenuePaise - creatorGrossTotalPaise - guapdCostsTotalPaise
  const guapdMarginPaise = brandRevenuePaise - creatorNetTotalPaise - guapdCostsTotalPaise
  if (subtotalPaise + platformFeeKeptPaise !== guapdMarginPaise) throw new Error('P&L does not reconcile')
  return { brandRevenuePaise, creatorGrossTotalPaise, creatorNetTotalPaise, guapdCostsTotalPaise, subtotalPaise, platformFeeKeptPaise, guapdMarginPaise }
}

/**
 * A per-unit cost line's total: quantity (up to two decimals) × unit rate,
 * rounded half up to the paisa. Mirrors the database exactly
 * (experience_cost_validate: round(quantity × unit_rate_paise)), so the form's
 * preview is the figure the database stores; the database refuses any other.
 */
export function costLineTotalPaise(input: { quantity: number; unitRatePaise: number }): number {
  assertPaise(input.unitRatePaise, 'unit rate')
  const q = input.quantity
  if (!(q > 0) || Math.abs(Math.round(q * 100) - q * 100) > 1e-6) throw new Error('quantity must be > 0 with at most two decimals')
  const total = Number((BigInt(input.unitRatePaise) * BigInt(Math.round(q * 100)) + BigInt(50)) / BigInt(100))
  assertPaise(total, 'cost total')
  return total
}

