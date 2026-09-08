/**
 * How a fee is described in words, in one place.
 *
 * Every screen that shows a fee guards its row on `fee_paise > 0`, so a 0%
 * deal silently rendered NO fee line at all — on the brand's deal page, the
 * creator's, and both "Full terms" panels. A missing row is not an
 * explanation: the reader is left to work out whether the fee is zero, unset,
 * or broken. These helpers give that row something true to say.
 *
 * The REASON comes from deals.fee_basis, never from the amount being zero. An
 * ops pair rate, a per-deal override and a brand on 0% all produce the same
 * zero, and telling one of those creators their deal was free because of a
 * storefront referral is a specific false claim about how they were found.
 */

/** Wording for a zero fee. Null when the fee is non-zero and needs no note. */
export function zeroFeeNote(
  feePercent: number | null | undefined,
  feeBasis: string | null | undefined,
  audience: 'brand' | 'creator',
  creatorFirstName?: string | null,
): string | null {
  if (feePercent == null || feePercent > 0) return null

  if (feeBasis === 'storefront_first_deal') {
    return audience === 'creator'
      ? '0% · first deal from your storefront'
      : `No platform fee · first deal from ${creatorFirstName || 'this creator'}’s storefront`
  }

  // Covers an ops pair rate of 0, a fee_pct_override of 0, a brand on 0%, and
  // deals created before fee_basis existed (NULL). Says only what is certain.
  return 'No platform fee on this deal'
}

/**
 * Who bears a non-zero fee, from the reader's side.
 *
 * Written out because it was hardcoded as ", paid by the brand" on the
 * creator's Full terms panel regardless of fee_mode. Since 0499 made
 * 'deducted' the platform rule, that line told every creator the brand was
 * paying a fee that was in fact coming out of their own side.
 */
export function feeBearerNote(
  feeMode: 'on_top' | 'deducted' | string | null | undefined,
  audience: 'brand' | 'creator',
): string {
  if (feeMode === 'on_top') return audience === 'brand' ? ', paid by you' : ', paid by the brand'
  return audience === 'brand' ? ', deducted from creator' : ', deducted'
}
