'use client'

import { useState, useMemo } from 'react'
import { BoostingPill, OptionPill } from '@/components/DealOptionPills'
import { isFixedPrice, offerPrefillPaise, formatProductPrice } from '@/lib/product-price'
import { collabCharge, boostingCharge, offersCollab, offersBoosting, type AddonRates } from '@/lib/addons'
import { updateCampaignDraft } from './draft-actions'
import type { DraftPlacement } from './draft-actions'
import { calculateFee } from '@/lib/fee'
import { useRouter } from 'next/navigation'

interface Product {
  id: string
  platform: string
  handle: string
  product_type: string
  description: string | null
  price_paise: number
  display_price: boolean
  is_active: boolean
}

interface AddonRateRow {
  platform: string
  handle: string
  collab_rate_type: 'fixed' | 'percent' | null
  collab_rate_value: number | null
  boosting_30day_paise: number | null
}

interface Props {
  draftId: string
  creatorName: string
  products: Product[]
  /** What the creator charges per channel for collab and boosting. Absent
      means the channel offers neither, and the controls stay hidden. */
  addonRates?: AddonRateRow[]
  initialPlacements: DraftPlacement[]
  feePercent: number
  feeMode: 'on_top' | 'deducted'
  onClose: () => void
}

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(0)}K`
  return `₹${rupees.toLocaleString('en-IN')}`
}

export default function DraftPlacementEditor({ draftId, creatorName, products, addonRates = [], initialPlacements, feePercent, feeMode, onClose }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Build initial selections from existing placements
  const [selections, setSelections] = useState<Record<string, { qty: number; customPricePaise: number | null }>>(() => {
    const sel: Record<string, { qty: number; customPricePaise: number | null }> = {}
    for (const p of initialPlacements) {
      const product = products.find((pr) => pr.product_type === p.label && pr.platform === p.platform && pr.handle === p.handle)
      if (product) {
        const existing = sel[product.id]
        sel[product.id] = {
          qty: (existing?.qty ?? 0) + 1,
          customPricePaise: !isFixedPrice(product) ? (offerPrefillPaise(product) ?? p.price_paise) : null,
        }
      }
    }
    return sel
  })

  // Per-item reel types + boosting
  const [reelTypes, setReelTypes] = useState<Record<string, 'collab' | 'non_collab' | ''>>(() => {
    const rt: Record<string, 'collab' | 'non_collab' | ''> = {}
    for (const p of initialPlacements) {
      if (!p.reel_type) continue
      const product = products.find((pr) => pr.product_type === p.label && pr.platform === p.platform && pr.handle === p.handle)
      if (product) rt[product.id] = p.reel_type
    }
    return rt
  })

  const [itemBoostingRights, setItemBoostingRights] = useState<Record<string, boolean | null>>(() => {
    const br: Record<string, boolean | null> = {}
    for (const p of initialPlacements) {
      if (p.boosting_rights == null) continue
      const product = products.find((pr) => pr.product_type === p.label && pr.platform === p.platform && pr.handle === p.handle)
      if (product) br[product.id] = p.boosting_rights
    }
    return br
  })

  const [itemBoostingDuration, setItemBoostingDuration] = useState<Record<string, string>>(() => {
    const bd: Record<string, string> = {}
    for (const p of initialPlacements) {
      if (!p.boosting_duration_months) continue
      const product = products.find((pr) => pr.product_type === p.label && pr.platform === p.platform && pr.handle === p.handle)
      if (product) bd[product.id] = String(p.boosting_duration_months)
    }
    return bd
  })

  /* Matched on channel, punctuation-insensitively, the same way the offer
     builder matches them: a handle stored with a leading @ on one side and
     without on the other is the same channel. */
  const ratesFor = (p: { platform: string; handle: string }): AddonRates | null => {
    const row = addonRates.find(
      (r) => String(r.platform ?? '').trim().toLowerCase() === String(p.platform ?? '').trim().toLowerCase()
        && String(r.handle ?? '').replace(/^@/, '').toLowerCase() === String(p.handle ?? '').replace(/^@/, '').toLowerCase(),
    )
    if (!row) return null
    return {
      collabRateType: row.collab_rate_type,
      collabRateValue: row.collab_rate_value,
      boostingThirtyDayPaise: row.boosting_30day_paise,
    }
  }

  /* What the add-ons add to ONE unit of this line.
   *
   * Ticking collab or boosting changed nothing on the total, and the placement
   * was saved with the choice but no money against it - so the campaign quoted
   * the bare rate and the deal it became charged the same, silently dropping
   * what the brand had asked for. lib/addons is the one definition of these
   * numbers, shared with the storefront and the offer builder. */
  const addonsFor = (p: Product, unitPaise: number): { collab: number; boosting: number } => {
    const rates = ratesFor(p)
    if (!rates) return { collab: 0, boosting: 0 }
    const collab = reelTypes[p.id] === 'collab' && offersCollab(rates) ? collabCharge(unitPaise, rates) : 0
    const days = boostDays[p.id] ?? 0
    const boosting = days > 0 && offersBoosting(rates) ? boostingCharge(days, rates) : 0
    return { collab, boosting }
  }

  /* BoostingPill asks in DAYS, which is what the money is calculated from;
     this editor has always stored MONTHS on the placement. Seeded from the
     stored months so an existing draft opens on the right preset, and written
     back as months, rounded up, when it changes. */
  const [boostDays, setBoostDays] = useState<Record<string, number>>(() => {
    const bd: Record<string, number> = {}
    for (const p of initialPlacements) {
      if (!p.boosting_duration_months) continue
      const product = products.find((pr) => pr.product_type === p.label && pr.platform === p.platform && pr.handle === p.handle)
      if (product) bd[product.id] = p.boosting_duration_months * 30
    }
    return bd
  })

  // Group products by platform+handle
  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>()
    for (const p of products) {
      const key = `${p.platform}::${p.handle}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return map
  }, [products])

  // Compute totals
  /* This editor prices base deliverables only — it does not offer collab or
     boosting. The comment matters more than the code: the total below is a
     BASE total, and the moment an add-on control is added here it has to be
     included, or a campaign will quote one figure and its deals charge another.
     draft-actions.ts already sums the add-on columns for exactly that reason. */
  const { totalPaise, selectedCount, hasMissingPrice } = useMemo(() => {
    let total = 0
    let count = 0
    let missingPrice = false
    for (const p of products) {
      const sel = selections[p.id]
      if (!sel || sel.qty <= 0) continue
      count += sel.qty
      const base = baseFor(p, sel)
      if (base == null || base <= 0) { missingPrice = true; continue }
      const add = addonsFor(p, base)
      total += (base + add.collab + add.boosting) * sel.qty
    }
    return { totalPaise: total, selectedCount: count, hasMissingPrice: missingPrice }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, selections, reelTypes, boostDays, addonRates])

  const fee = calculateFee(totalPaise, feePercent, feeMode)

  /**
   * ONE definition of what a line costs before add-ons.
   *
   * There were three, and they disagreed. The row's figure fell back to the
   * creator's own rate, the "extras" note fell back to zero, and the summary
   * fell back to zero as well - so a "from Rs.50,000" reel with nothing typed
   * showed Rs.85K on the row (collab priced off 50,000) while calling the
   * extras Rs.30K (collab priced off 0) and totalling Rs.30K. Three numbers,
   * three different bases, none of them right.
   *
   * null means there is genuinely no figure: on_request, and nothing typed.
   */
  function baseFor(p: Product, sel: { customPricePaise: number | null } | undefined): number | null {
    if (isFixedPrice(p)) return p.price_paise
    if (sel?.customPricePaise != null) return sel.customPricePaise
    return offerPrefillPaise(p)
  }

  function setQty(productId: string, qty: number) {
    /* Seed the editable price from the creator's own rate, the way the offer
       builder does. A "from Rs.50,000" package left the field empty, so the
       brand was quoted off zero until they retyped a number the creator had
       already given them. on_request stays null: there is no figure to seed
       and inventing one puts a price in front of a brand nobody quoted. */
    const product = products.find((pr) => pr.id === productId)
    const seed = product && !isFixedPrice(product) ? offerPrefillPaise(product) : null

    setSelections((prev) => ({
      ...prev,
      [productId]: { qty, customPricePaise: prev[productId]?.customPricePaise ?? seed },
    }))
  }

  function setCustomPrice(productId: string, rupees: string) {
    const paise = rupees.trim() ? Math.round(parseFloat(rupees) * 100) : null
    setSelections((prev) => ({
      ...prev,
      [productId]: { qty: prev[productId]?.qty ?? 0, customPricePaise: paise },
    }))
  }

  async function handleSave() {
    setLoading(true)
    setError(null)

    // Build placements array: one row per unit
    const placements: DraftPlacement[] = []
    for (const p of products) {
      const sel = selections[p.id]
      if (!sel || sel.qty <= 0) continue
      /* The same base the screen quoted. Saving off a different one is how a
         draft ends up charging a number nobody was shown. */
      const unitPaise = baseFor(p, sel) ?? 0
      const rt = reelTypes[p.id]
      const br = itemBoostingRights[p.id]
      const bd = itemBoostingDuration[p.id]
      /* The MONEY, not only the choice. These columns were never written, so a
         placement carried "boosting_rights: true" with no charge against it and
         draft-actions summed a total that ignored it - the campaign quoted the
         bare rate for something the brand had asked to pay extra for. The rates
         travel too, so the figure stays explainable after the creator changes
         their card. */
      const rates = ratesFor(p)
      const add = addonsFor(p, unitPaise)
      const days = boostDays[p.id] ?? 0

      for (let i = 0; i < sel.qty; i++) {
        placements.push({
          label: p.product_type,
          platform: p.platform,
          handle: p.handle,
          price_paise: unitPaise,
          product_id: p.id,
          ...(rt ? { reel_type: rt } : {}),
          ...(br != null ? { boosting_rights: br } : {}),
          ...(br && bd ? { boosting_duration_months: parseInt(bd, 10) } : {}),
          ...(add.collab > 0
            ? {
                collab_charge_paise: add.collab,
                collab_rate_type: rates?.collabRateType ?? null,
                collab_rate_value: rates?.collabRateValue ?? null,
              }
            : {}),
          ...(add.boosting > 0
            ? {
                boosting_days: days,
                boosting_charge_paise: add.boosting,
                boosting_30day_paise: rates?.boostingThirtyDayPaise ?? null,
              }
            : {}),
        })
      }
    }

    const res = await updateCampaignDraft(draftId, placements)
    setLoading(false)
    if (res.error) { setError(res.error); return }
    onClose()
    router.refresh()
  }

  return (
    <div style={editorPanel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 700, margin: 0, color: 'var(--color-heading)' }}>
          Placements for {creatorName}
        </p>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#888' }}>×</button>
      </div>

      {error && <p style={{ fontSize: '0.75rem', color: '#dc2626', margin: '0 0 0.5rem' }}>{error}</p>}

      {products.length === 0 ? (
        <p style={{ fontSize: '0.8125rem', color: '#888', padding: '1rem 0' }}>
          This creator has no products listed. Add products via ops first.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: 400, overflowY: 'auto' }}>
          {Array.from(grouped.entries()).map(([key, prods]) => {
            const [platform, handle] = key.split('::')
            return (
              <div key={key}>
                {/* The channel this group is for, as an eyebrow rather than a
                    chip. Same line the offer builder heads its groups with. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{
                    fontFamily: 'var(--font-ui)', fontSize: 10.5, fontWeight: 700,
                    letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-soft)',
                  }}>
                    {platform} &middot; {handle?.startsWith('@') ? handle : `@${handle}`}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {prods.map((p) => {
                    const sel = selections[p.id]
                    const qty = sel?.qty ?? 0
                    const selected = qty > 0
                    const lineBase = baseFor(p, sel)

                    return (
                      /* THE OFFER BUILDER'S ROW. This screen sets the same terms
                         over several creators at once, and was drawing its own
                         smaller version of every control: a bare select for reel
                         type, 0.6rem buttons for boosting, no delivery date at
                         all. Same row, same pills, one definition. */
                      <div key={p.id} className="scp0" style={{
                        border: selected ? '1.5px solid var(--neon-deep, var(--lime-400))' : '1.5px solid var(--hairline, #EAEAE3)',
                        background: 'var(--card)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px' }}>
                          <button
                            type="button"
                            onClick={() => setQty(p.id, selected ? 0 : 1)}
                            style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '1 1 0%', minWidth: 0, padding: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-ui)', color: 'var(--ink)' }}
                          >
                            <span style={{
                              width: 24, height: 24, flex: '0 0 auto', borderRadius: '50%',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'background .16s',
                              border: selected ? '1.5px solid var(--neon-deep)' : '1.5px solid #D3DBE6',
                              background: selected ? 'var(--neon, var(--lime-400))' : 'var(--card)',
                              color: selected ? 'var(--ink)' : 'transparent',
                            }}>
                              {selected && (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                              )}
                            </span>
                            <span style={{ flex: '1 1 0%', minWidth: 0 }}>
                              <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em' }}>{p.product_type}</span>
                              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 4 }}>
                                {p.description ? `${p.description} \u00B7 ` : ''}
                                {(() => {
                                  const label = formatProductPrice(p)
                                  if (label == null) return 'Price on request'
                                  return isFixedPrice(p) ? `${label} each` : label
                                })()}
                              </span>
                            </span>
                          </button>

                          {selected && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <button type="button" className="stepbtn" aria-label="Fewer" onClick={() => { if (qty > 1) setQty(p.id, qty - 1) }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14" /></svg>
                              </button>
                              <span style={{ minWidth: 18, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>{qty}</span>
                              <button type="button" className="stepbtn" aria-label="More" onClick={() => setQty(p.id, qty + 1)}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                              </button>
                            </div>
                          )}

                          <div style={{ textAlign: 'right', minWidth: 104 }}>
                            <div style={{
                              fontFamily: 'var(--font-display)', fontSize: 18,
                              fontWeight: selected ? 800 : 700,
                              letterSpacing: '-0.02em', lineHeight: 1,
                              color: selected ? 'var(--ink)' : 'var(--ink-soft)',
                            }}>
                              {(() => {
                                if (lineBase == null) return '\u2014'
                                const add = selected ? addonsFor(p, lineBase) : { collab: 0, boosting: 0 }
                                return formatRupees((lineBase + add.collab + add.boosting) * (qty || 1))
                              })()}
                            </div>
                            {selected && (() => {
                              if (lineBase == null) return null
                              const add = addonsFor(p, lineBase)
                              const extra = add.collab + add.boosting
                              if (extra <= 0) return null
                              /* Broken out so a boost that was ticked can be
                                 seen to have cost something. */
                              return (
                                <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4, whiteSpace: 'nowrap' }}>
                                  incl. {formatRupees(extra * (qty || 1))} extras
                                </div>
                              )
                            })()}
                          </div>
                        </div>

                        {selected && (
                          <div style={{ padding: '0 18px 14px 52px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            {p.platform.toLowerCase() === 'instagram' && offersCollab(ratesFor(p)) && (
                              <OptionPill
                                label="Reel type"
                                value={reelTypes[p.id] === 'collab' ? 'Collab post' : reelTypes[p.id] === 'non_collab' ? 'Non-collab' : ''}
                                options={['Collab post', 'Non-collab']}
                                onChange={(v) => setReelTypes((prev) => ({ ...prev, [p.id]: v === 'Collab post' ? 'collab' : v === 'Non-collab' ? 'non_collab' : '' }))}
                              />
                            )}

                            {/* Boosting, in DAYS, the way the offer builder asks
                                for it. The months this screen has always stored
                                are written from the answer, rounded up: half a
                                month of granted rights is still a month. */}
                            {offersBoosting(ratesFor(p)) && (
                            <BoostingPill
                              days={boostDays[p.id] ?? null}
                              included={itemBoostingRights[p.id] ?? null}
                              onChange={(next) => {
                                if (next == null) {
                                  setItemBoostingRights((prev) => ({ ...prev, [p.id]: false }))
                                  setBoostDays((prev) => ({ ...prev, [p.id]: 0 }))
                                  setItemBoostingDuration((prev) => ({ ...prev, [p.id]: '' }))
                                  return
                                }
                                setItemBoostingRights((prev) => ({ ...prev, [p.id]: true }))
                                setBoostDays((prev) => ({ ...prev, [p.id]: next }))
                                setItemBoostingDuration((prev) => ({ ...prev, [p.id]: next > 0 ? String(Math.max(1, Math.ceil(next / 30))) : '' }))
                              }}
                            />
                            )}

                            {/* No "Deliver by" here, deliberately. A draft
                                placement has nowhere to keep a date - the offer
                                builder's dates only derive the deal's own
                                timeline, and this row becomes a deal later. A
                                pill that silently discarded what a brand typed
                                would be worse than not offering it. */}

                            {!isFixedPrice(p) && (
                              <input
                                type="number" min="0" step="1"
                                placeholder="Your price (&#8377;)"
                                className="dinput"
                                value={sel?.customPricePaise != null ? String(sel.customPricePaise / 100) : ''}
                                onChange={(e) => setCustomPrice(p.id, e.target.value)}
                                style={{ width: 140, height: 27, fontSize: 11.5, padding: '0 10px', borderRadius: 8 }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Totals + fee breakdown */}
      {selectedCount > 0 && (
        <div style={{ marginTop: '0.75rem', padding: '0.625rem 0.75rem', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e5e5' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.2rem' }}>
            <span style={{ color: '#888' }}>{selectedCount} item{selectedCount !== 1 ? 's' : ''}</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{formatRupees(totalPaise)}</span>
          </div>
          {feePercent > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#888' }}>
                <span>Fee ({feePercent}% {feeMode === 'on_top' ? 'on top' : 'deducted'})</span>
                <span style={{ fontFamily: 'monospace' }}>{feeMode === 'on_top' ? '+' : '−'}{formatRupees(fee.fee_paise)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', fontWeight: 700, borderTop: '1px solid #e5e5e5', paddingTop: '0.25rem', marginTop: '0.25rem' }}>
                <span>Brand pays</span>
                <span style={{ fontFamily: 'monospace' }}>{formatRupees(fee.brand_pays_paise)}</span>
              </div>
            </>
          )}
          {hasMissingPrice && (
            <p style={{ fontSize: '0.7rem', color: '#dc2626', margin: '0.25rem 0 0' }}>
              Set a price for all &quot;price on request&quot; items
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.375rem', marginTop: '0.75rem' }}>
        <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
        <button onClick={handleSave} disabled={loading} style={{ ...saveBtnStyle, opacity: loading ? 0.5 : 1 }}>
          {loading ? 'Saving...' : 'Save placements'}
        </button>
      </div>
    </div>
  )
}

const editorPanel: React.CSSProperties = {
  padding: '1rem',
  border: '1px solid var(--color-border, #e5e5e5)',
  borderRadius: 8,
  background: '#fff',
  marginTop: '0.5rem',
}

const platformBadge: React.CSSProperties = {
  fontSize: '0.6875rem', fontWeight: 700, textTransform: 'capitalize',
  padding: '0.1rem 0.5rem', borderRadius: 9999,
  background: '#f5f5f0', border: '1px solid #e5e5e5',
}

const productRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '0.5rem 0.625rem',
  border: '1px solid var(--color-border, #e5e5e5)', borderRadius: 6,
  background: 'var(--glass-bg, #fafafa)', gap: '0.5rem',
  transition: 'border-color 0.15s',
}

const stepperBtn: React.CSSProperties = {
  width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid #ddd', borderRadius: 4, background: '#fafafa',
  fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer',
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem', background: 'transparent',
  border: '1px solid #e5e5e5', borderRadius: 6,
  fontSize: '0.8125rem', cursor: 'pointer', color: '#888',
}

const saveBtnStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem', background: '#111', color: '#fff',
  border: 'none', borderRadius: 6, fontSize: '0.8125rem',
  fontWeight: 600, cursor: 'pointer',
}
