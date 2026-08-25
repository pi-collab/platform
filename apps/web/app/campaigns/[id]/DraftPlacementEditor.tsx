'use client'

import { useState, useMemo } from 'react'
import { isFixedPrice, offerPrefillPaise, formatProductPrice } from '@/lib/product-price'
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

interface Props {
  draftId: string
  creatorName: string
  products: Product[]
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

export default function DraftPlacementEditor({ draftId, creatorName, products, initialPlacements, feePercent, feeMode, onClose }: Props) {
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
      const unitPaise = isFixedPrice(p) ? p.price_paise : (sel.customPricePaise ?? 0)
      total += unitPaise * sel.qty
      if (!isFixedPrice(p) && (!sel.customPricePaise || sel.customPricePaise <= 0)) {
        missingPrice = true
      }
    }
    return { totalPaise: total, selectedCount: count, hasMissingPrice: missingPrice }
  }, [products, selections])

  const fee = calculateFee(totalPaise, feePercent, feeMode)

  function setQty(productId: string, qty: number) {
    setSelections((prev) => ({
      ...prev,
      [productId]: { qty, customPricePaise: prev[productId]?.customPricePaise ?? null },
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
      const unitPaise = isFixedPrice(p) ? p.price_paise : (sel.customPricePaise ?? 0)
      const rt = reelTypes[p.id]
      const br = itemBoostingRights[p.id]
      const bd = itemBoostingDuration[p.id]
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                  <span style={platformBadge}>{platform}</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{handle?.startsWith('@') ? handle : `@${handle}`}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {prods.map((p) => {
                    const sel = selections[p.id]
                    const qty = sel?.qty ?? 0
                    return (
                      <div key={p.id} style={{ ...productRow, borderColor: qty > 0 ? '#111' : 'var(--color-border, #e5e5e5)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '0.8125rem', fontWeight: 600, margin: 0 }}>{p.product_type}</p>
                          {p.description && <p style={{ fontSize: '0.7rem', color: '#888', margin: '0.1rem 0 0' }}>{p.description}</p>}
                          <p style={{ fontSize: '0.7rem', fontWeight: 600, margin: '0.1rem 0 0', color: formatProductPrice(p) ? '#111' : '#888', fontStyle: p.display_price ? 'normal' : 'italic' }}>
                            {formatProductPrice(p) ?? 'Price on request'}
                          </p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem', flexShrink: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <button type="button" onClick={() => setQty(p.id, Math.max(0, qty - 1))} style={stepperBtn} disabled={qty === 0}>−</button>
                            <span style={{ fontSize: '0.875rem', fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{qty}</span>
                            <button type="button" onClick={() => setQty(p.id, qty + 1)} style={stepperBtn}>+</button>
                          </div>
                          {/* Reel type — Instagram only */}
                          {qty > 0 && p.platform.toLowerCase() === 'instagram' && (
                            <select
                              value={reelTypes[p.id] ?? ''}
                              onChange={(e) => setReelTypes((prev) => ({ ...prev, [p.id]: e.target.value as any }))}
                              style={{ padding: '0.15rem 0.3rem', fontSize: '0.65rem', borderRadius: 4, border: '1px solid #ddd' }}
                            >
                              <option value="">Reel type...</option>
                              <option value="collab">Collab post</option>
                              <option value="non_collab">Non-collab</option>
                            </select>
                          )}
                          {/* Boosting */}
                          {qty > 0 && (
                            <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                              {([
                                [true, 'Boost'],
                                [false, 'No boost'],
                              ] as const).map(([val, label]) => {
                                const checked = itemBoostingRights[p.id] === val
                                return (
                                  <button
                                    key={String(val)}
                                    type="button"
                                    onClick={() => {
                                      setItemBoostingRights((prev) => ({ ...prev, [p.id]: val }))
                                      if (!val) setItemBoostingDuration((prev) => ({ ...prev, [p.id]: '' }))
                                    }}
                                    style={{
                                      padding: '0.1rem 0.35rem', fontSize: '0.6rem', fontWeight: checked ? 700 : 500,
                                      borderRadius: 9999,
                                      border: checked ? '1.5px solid #111' : '1px solid #ddd',
                                      background: checked ? '#111' : '#fafafa',
                                      color: checked ? '#fff' : '#888',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {label}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          {qty > 0 && itemBoostingRights[p.id] === true && (
                            <div style={{ display: 'flex', gap: '0.15rem' }}>
                              {['1', '3', '6', '12'].map((m) => (
                                <button
                                  key={m} type="button"
                                  onClick={() => setItemBoostingDuration((prev) => ({ ...prev, [p.id]: m }))}
                                  style={{
                                    padding: '0.1rem 0.3rem', fontSize: '0.55rem', borderRadius: 9999,
                                    border: itemBoostingDuration[p.id] === m ? '1.5px solid #111' : '1px solid #ddd',
                                    background: itemBoostingDuration[p.id] === m ? '#f5f5f0' : '#fafafa',
                                    fontWeight: itemBoostingDuration[p.id] === m ? 700 : 500,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {m}mo
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => setItemBoostingDuration((prev) => ({ ...prev, [p.id]: '' }))}
                                style={{
                                  padding: '0.1rem 0.3rem', fontSize: '0.55rem', borderRadius: 9999,
                                  border: !itemBoostingDuration[p.id] ? '1.5px solid #111' : '1px solid #ddd',
                                  background: !itemBoostingDuration[p.id] ? '#f5f5f0' : '#fafafa',
                                  fontWeight: !itemBoostingDuration[p.id] ? 700 : 500,
                                  cursor: 'pointer',
                                }}
                              >
                                ∞
                              </button>
                            </div>
                          )}
                          {/* Custom price for price-on-request */}
                          {!isFixedPrice(p) && qty > 0 && (
                            <input
                              type="number" min="0" step="1" placeholder="Price (₹)"
                              value={sel?.customPricePaise != null ? String(sel.customPricePaise / 100) : ''}
                              onChange={(e) => setCustomPrice(p.id, e.target.value)}
                              style={{ width: 100, fontSize: '0.7rem', padding: '0.2rem 0.4rem', border: '1px solid #ddd', borderRadius: 4 }}
                            />
                          )}
                        </div>
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
