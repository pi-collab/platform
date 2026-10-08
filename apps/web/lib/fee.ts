import { percentOfPaise } from '@/lib/money-round'

export interface FeeBreakdown {
  base_paise: number
  fee_percent: number
  fee_mode: 'on_top' | 'deducted'
  fee_paise: number
  brand_pays_paise: number
  creator_receives_paise: number
}

/**
 * Calculate platform fee breakdown. All values in paise.
 * Fee applies to base price only (revision overage is fee-free).
 *
 * on_top:    brand pays base + fee, creator receives base.
 * deducted:  brand pays base, creator receives base − fee.
 */
export function calculateFee(
  basePaise: number,
  feePercent: number,
  feeMode: 'on_top' | 'deducted'
): FeeBreakdown {
  // Half up, in whole paise, in integers: the ONE rule (lib/money-round.ts).
  // Was Math.round(base × pct / 100), whose float error rounded an exact half
  // paisa down on fractional rates (33.3% of 7500p). Same results otherwise;
  // the fee baseline (scripts/test-fee-golden.ts) confirms it.
  // Only whole, non-negative paise are money; anything else (a half-typed
  // amount in a form, say) keeps the old arithmetic rather than throwing in
  // the middle of a render.
  const feePaise = Number.isSafeInteger(basePaise) && basePaise >= 0 && Number(feePercent) >= 0
    ? percentOfPaise(basePaise, Number(feePercent))
    : Math.round(basePaise * feePercent / 100)
  return {
    base_paise: basePaise,
    fee_percent: feePercent,
    fee_mode: feeMode,
    fee_paise: feePaise,
    brand_pays_paise: feeMode === 'on_top' ? basePaise + feePaise : basePaise,
    creator_receives_paise: feeMode === 'deducted' ? basePaise - feePaise : basePaise,
  }
}

export const GROWTH_FEE_PERCENT = 30

/**
 * The standard Deals rate, and what a creator is shown before a brand exists.
 *
 * Mirrors the DEFAULT on brands.platform_fee_percent (migration 0100). It is a
 * DEFAULT, not a guarantee: the fee on any real deal comes from the ladder in
 * resolveDealFee, which an ops pair rate, a per-deal override or the
 * storefront first-deal exemption can all move. Used only where there is no
 * brand to resolve against — a creator pricing a package has not met one yet.
 */
export const DEALS_STANDARD_FEE_PERCENT = 15
