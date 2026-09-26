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
  const feePaise = Math.round(basePaise * feePercent / 100)
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
