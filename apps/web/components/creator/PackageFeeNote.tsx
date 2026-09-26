import { GROWTH_FEE_PERCENT, DEALS_STANDARD_FEE_PERCENT } from '@/lib/fee'

/**
 * What a creator keeps, shown beside the price they are typing.
 *
 * ── Why it is here and not on a pricing page alone ──────────────────────────
 * A creator setting a rate is doing arithmetic in their head about a number
 * they have not been told. The fee was explained elsewhere, which means it was
 * explained at a moment they were not asking. This puts the answer next to the
 * question: type 5,000, see 3,500.
 *
 * ── The bar is the point ────────────────────────────────────────────────────
 * Two figures in a sentence are read as a claim. A split bar is read as a
 * proportion, and 70/30 lands before the words do. The fee side is hatched
 * rather than filled so it reads as "taken out", not as a second thing they
 * are getting.
 */
export default function PackageFeeNote({ isGrowth, pricePaise, showFirstDealNote = false }: {
  isGrowth: boolean
  /** The price currently typed, in paise. Zero or absent hides the figures. */
  pricePaise: number
  /** Deals creators can reach 0% on a first storefront deal. Growth cannot:
   *  the exemption keys off a storefront origin and they have no storefront. */
  showFirstDealNote?: boolean
}) {
  const feePercent = isGrowth ? GROWTH_FEE_PERCENT : DEALS_STANDARD_FEE_PERCENT
  const keepPercent = 100 - feePercent

  const hasPrice = pricePaise > 0
  const keepPaise = Math.round(pricePaise * (keepPercent / 100))

  const copy = isGrowth
    ? `Brands pay your listed package rate. Guapd’s ${feePercent}% fee comes from your side, never added on top. Example: list ₹5,000, receive ₹3,500.`
    : `Brands pay your listed rate. Guapd’s fee comes from your side, never added on top.${showFirstDealNote ? ` First deal with a brand you bring is 0%; after that it’s ${feePercent}%.` : ` It’s ${feePercent}%.`}`

  return (
    <div style={{ borderRadius: 18, background: '#F7F8F4', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ flexShrink: 0, marginTop: 1 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
          </svg>
        </span>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-soft)' }}>{copy}</p>
      </div>

      {/* Hidden until there is a price. A 70/30 bar over an empty field is a
          proportion of nothing, and "You receive ₹0" reads as a warning. */}
      {hasPrice && (
        <div>
          <div style={{ display: 'flex', gap: 3, height: 8 }}>
            <div style={{ flex: keepPercent, borderRadius: 999, background: 'var(--neon)' }} />
            <div style={{ flex: feePercent, minWidth: 14, borderRadius: 999, background: 'repeating-linear-gradient(135deg,#EEF0F3 0 6px,#E3E6EB 6px 12px)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 9, fontSize: 12.5, color: 'var(--ink-soft)' }}>
            <span>
              You receive{' '}
              <span style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontWeight: 700, color: 'var(--ink)' }}>
                {formatRupees(keepPaise)}
              </span>
            </span>
            <span style={{ whiteSpace: 'nowrap' }}>
              {feePercent}% of{' '}
              <span style={{ fontFamily: 'var(--font-num, var(--font-ui))' }}>{formatRupees(pricePaise)}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Whole rupees. A creator's rate is never quoted in paise. */
function formatRupees(paise: number): string {
  return '₹' + Math.round(paise / 100).toLocaleString('en-IN')
}
