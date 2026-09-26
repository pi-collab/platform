import 'server-only'

/**
 * What fee a new deal carries, and why.
 *
 * Migration 0450 captured brand↔creator origin and said plainly that no fee
 * logic read it yet. This is that logic.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 * 15%, deducted from the creator's side, EXCEPT the first deal between a brand
 * and the creator whose storefront brought that brand to Guapd — that one is
 * free. Not the brand's first deal on the platform: the first deal with THAT
 * creator. A brand introduced by Creator A pays full fee on its first deal with
 * Creator B, because B introduced nobody.
 *
 * ── Precedence ─────────────────────────────────────────────────────────────
 *   1. brand_creator_rates.fee_pct  — an ops override, set by a human for a
 *      stated reason. It wins over everything, including the 0% rule: if ops
 *      has set a rate for this pair, that is a decision already made.
 *   2. The storefront first-deal exemption (0%).
 *   3. GROWTH: 30%, deducted, for any deal on the growth track. A Growth
 *      creator sells a fixed package at a rate they set, and the fee comes out
 *      of it — no markup on the brand. This REPLACES the brand's standard rate
 *      rather than sitting beside it, and it ignores the brand's fee_mode:
 *      on_top would put a markup on a price the brand was shown as final.
 *   4. brands.platform_fee_percent  — the brand's standard rate.
 *
 * ── What consumes the exemption ────────────────────────────────────────────
 * Any deal between the pair that was not declined or cancelled. A brand that
 * sends an offer and the creator declines has not had a deal, and taking the
 * creator's one free deal away because a brand changed its mind would be a
 * penalty for someone else's decision.
 *
 * The result is SNAPSHOT onto the deal at creation. Re-resolving later would
 * mean a deal's fee could change after both sides agreed it.
 */

/**
 * Which rung decided the fee. Snapshotted onto deals.fee_basis so a screen can
 * explain a number instead of inferring a reason from its size — a zero is not
 * self-explanatory, and guessing gets it wrong for ops rates and overrides.
 */
export type FeeBasis =
  | 'brand_standard'
  | 'ops_pair_rate'
  | 'storefront_first_deal'
  | 'growth_standard'
  | 'deal_override'

export interface ResolvedFee {
  feePercent: number
  feeMode: 'on_top' | 'deducted'
  basis: FeeBasis
  /** Set when the storefront exemption applied, for the UI to explain itself. */
  storefrontFirstDeal: boolean
  /** Set when an ops override decided it. */
  opsOverride: boolean
}

type Client = { from: (t: string) => any }

const NOT_A_DEAL = ['declined', 'cancelled']

/** The Growth track's platform fee. Deducted from the creator, never on top. */
/* GROWTH_FEE_PERCENT and DEALS_STANDARD_FEE_PERCENT live in lib/fee.ts:
   this module is server-only, and the creator-facing fee note that needs them
   renders on the client. Re-exported below so server callers keep one import. */
export { GROWTH_FEE_PERCENT, DEALS_STANDARD_FEE_PERCENT } from '@/lib/fee'
import { GROWTH_FEE_PERCENT } from '@/lib/fee'

export async function resolveDealFee(
  supabase: Client,
  brandId: string,
  creatorId: string,
  brandFeePercent: number,
  brandFeeMode: 'on_top' | 'deducted',
  /* Defaulted so every existing caller keeps its exact behaviour. Only the
     growth campaign path passes 'growth'. */
  track: 'deals' | 'growth' = 'deals',
): Promise<ResolvedFee> {
  // 1. An ops override is a human decision about this exact pair.
  const { data: pairRate } = await supabase
    .from('brand_creator_rates')
    .select('fee_pct')
    .eq('brand_id', brandId)
    .eq('creator_id', creatorId)
    .maybeSingle()

  if (pairRate && typeof pairRate.fee_pct === 'number') {
    return {
      feePercent: pairRate.fee_pct,
      feeMode: brandFeeMode,
      basis: 'ops_pair_rate',
      storefrontFirstDeal: false,
      opsOverride: true,
    }
  }

  // 2. The storefront exemption, for this pair's first real deal.
  const { data: origin } = await supabase
    .from('brand_creator_origin')
    .select('origin')
    .eq('brand_id', brandId)
    .eq('creator_id', creatorId)
    .maybeSingle()

  if (origin?.origin === 'storefront') {
    const { count } = await supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .eq('creator_id', creatorId)
      .not('status', 'in', `(${NOT_A_DEAL.join(',')})`)

    if ((count ?? 0) === 0) {
      return {
        feePercent: 0,
        feeMode: brandFeeMode,
        basis: 'storefront_first_deal',
        storefrontFirstDeal: true,
        opsOverride: false,
      }
    }
  }

  /* 3. The growth track's own rate.
        Placed BELOW the storefront exemption rather than above it so that
        exemption keeps its meaning — though in practice it cannot fire here: a
        storefront origin comes from /c/[slug], and Growth creators have
        packages, not storefronts.

        feeMode is FORCED to 'deducted', not taken from the brand. The brand is
        shown the creator's package price and pays exactly that; on_top would
        quietly add 30% to a number presented as final. */
  if (track === 'growth') {
    return {
      feePercent: GROWTH_FEE_PERCENT,
      feeMode: 'deducted',
      basis: 'growth_standard',
      storefrontFirstDeal: false,
      opsOverride: false,
    }
  }

  // 4. The brand's standard rate.
  return {
    feePercent: brandFeePercent,
    feeMode: brandFeeMode,
    basis: 'brand_standard',
    storefrontFirstDeal: false,
    opsOverride: false,
  }
}
