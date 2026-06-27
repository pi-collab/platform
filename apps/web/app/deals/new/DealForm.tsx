'use client'

import { useState, useMemo } from 'react'
import { createDeal } from '../actions'
import { useRouter } from 'next/navigation'

interface SocialAccount {
  platform: string
  handle: string
  url: string | null
  follower_count: number | null
  verified: boolean
}

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

interface Creator {
  id: string
  full_name: string
  niches: string[] | null
  handle: string | null
  profile_photo_url: string | null
  social_accounts: SocialAccount[] | null
}

const USAGE_PRESETS = [
  'One-time social post',
  '6 months, all platforms',
  'Perpetual, all media',
] as const

const PAYMENT_PRESETS = [
  '50% advance, 50% on approval',
  '100% on approval',
  '100% advance',
] as const

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(0)}K`
  return `₹${rupees.toLocaleString('en-IN')}`
}

function formatFollowers(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`
  return n.toLocaleString('en-IN')
}

export default function DealForm({ creator, products }: { creator: Creator; products: Product[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Product selections: productId → { qty, customPricePaise (for display_price=false) }
  const [selections, setSelections] = useState<Record<string, { qty: number; customPricePaise: number | null }>>({})

  // Deal fields
  const [title, setTitle] = useState(`Deal with ${creator.full_name}`)
  const [timelineDate, setTimelineDate] = useState('')
  const [revisionLimit, setRevisionLimit] = useState('1')
  const [usageRights, setUsageRights] = useState('')
  const [customUsage, setCustomUsage] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [customPayment, setCustomPayment] = useState('')
  const [message, setMessage] = useState('')
  const [priceOverride, setPriceOverride] = useState('')

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

  // Compute total from selections (all in paise)
  const { totalPaise, selectedCount, deliverablesSummary, hasMissingPrice } = useMemo(() => {
    let total = 0
    let count = 0
    const lines: string[] = []

    for (const p of products) {
      const sel = selections[p.id]
      if (!sel || sel.qty <= 0) continue
      count += sel.qty

      // Price per unit: use product price if display_price=true, else use custom price
      const unitPaise = p.display_price ? p.price_paise : (sel.customPricePaise ?? 0)
      total += unitPaise * sel.qty

      const qtyPrefix = sel.qty > 1 ? `${sel.qty}× ` : ''
      const priceNote = !p.display_price && sel.customPricePaise != null ? ` @ ${formatRupees(sel.customPricePaise)}` : ''
      const displayHandle = p.handle.startsWith('@') ? p.handle : `@${p.handle}`
      lines.push(`${qtyPrefix}${p.product_type}${priceNote} (${p.platform} ${displayHandle})`)
    }

    // Check if any on-request product is selected without a price
    let missingPrice = false
    for (const p of products) {
      const s = selections[p.id]
      if (!s || s.qty <= 0) continue
      if (!p.display_price && (!s.customPricePaise || s.customPricePaise <= 0)) {
        missingPrice = true
        break
      }
    }

    return { totalPaise: total, selectedCount: count, deliverablesSummary: lines.join(' + '), hasMissingPrice: missingPrice }
  }, [products, selections])

  // Final price: override if set, else computed total
  const finalPaise = priceOverride.trim()
    ? Math.round(parseFloat(priceOverride) * 100)
    : totalPaise

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (selectedCount === 0) {
      setError('Select at least one product')
      return
    }

    if (hasMissingPrice) {
      setError('Enter a price for all "price on request" products')
      return
    }

    if (isNaN(finalPaise) || finalPaise <= 0) {
      setError('Total price must be greater than ₹0')
      return
    }

    setLoading(true)

    const resolvedUsage = usageRights === 'Custom' ? customUsage : usageRights
    const resolvedPayment = paymentTerms === 'Custom' ? customPayment : paymentTerms

    // Build structured items array: one row per unit (qty 2 → 2 rows)
    const items: { label: string; platform: string; handle: string; price_paise: number }[] = []
    for (const p of products) {
      const sel = selections[p.id]
      if (!sel || sel.qty <= 0) continue
      const unitPaise = p.display_price ? p.price_paise : (sel.customPricePaise ?? 0)
      for (let i = 0; i < sel.qty; i++) {
        items.push({ label: p.product_type, platform: p.platform, handle: p.handle, price_paise: unitPaise })
      }
    }

    const res = await createDeal({
      creator_id: creator.id,
      title,
      deliverables: deliverablesSummary,
      price_paise: finalPaise,
      timeline_date: timelineDate || undefined,
      revision_limit: parseInt(revisionLimit, 10) || 0,
      usage_rights: resolvedUsage || undefined,
      payment_terms: resolvedPayment || undefined,
      message: message || undefined,
      items,
    })

    setLoading(false)

    if (res?.error) {
      setError(res.error)
    } else {
      // TODO: navigate to /deals/[id] once deal detail page exists
      router.push('/browse')
    }
  }

  const socials = (creator.social_accounts ?? []) as SocialAccount[]

  function findSocial(platform: string, handle: string): SocialAccount | undefined {
    return socials.find((sa) => sa.platform === platform && sa.handle === handle)
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {error && <div style={errorBox}>{error}</div>}

      {/* Creator (read-only) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'var(--section-bg-alt)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
        {creator.profile_photo_url ? (
          <img src={creator.profile_photo_url} alt={creator.full_name} style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', objectFit: 'cover', border: '1px solid var(--color-border)' }} />
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', background: '#e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8125rem', color: '#888' }}>
            {creator.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
          </div>
        )}
        <div>
          <p style={{ fontWeight: 700, fontSize: '0.875rem', margin: 0, color: 'var(--color-heading)' }}>{creator.full_name}</p>
          {creator.handle && <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', margin: 0 }}>{creator.handle}</p>}
        </div>
      </div>

      {/* Title */}
      <Field label="Deal title">
        <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>

      {/* ── Product selection ──────────────────────────────────── */}
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Select deliverables</legend>

        {products.length === 0 ? (
          <p style={{ fontSize: '0.8125rem', color: '#888' }}>This creator has no products listed. Add products via ops first.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {Array.from(grouped.entries()).map(([key, prods]) => {
              const [platform, handle] = key.split('::')
              const sa = findSocial(platform, handle)
              return (
                <div key={key}>
                  {/* Channel header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={platformBadge}>{platform}</span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{handle?.startsWith('@') ? handle : `@${handle}`}</span>
                    {sa?.follower_count != null && sa.follower_count > 0 && (
                      <span style={{ fontSize: '0.75rem', color: '#888' }}>{formatFollowers(sa.follower_count)}</span>
                    )}
                  </div>

                  {/* Product rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    {prods.map((p) => {
                      const sel = selections[p.id]
                      const qty = sel?.qty ?? 0
                      return (
                        <div key={p.id} style={{ ...productRow, borderColor: qty > 0 ? '#111' : 'var(--color-border)' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '0.8125rem', fontWeight: 600, margin: 0 }}>{p.product_type}</p>
                            {p.description && <p style={{ fontSize: '0.75rem', color: '#888', margin: '0.1rem 0 0' }}>{p.description}</p>}
                            <p style={{ fontSize: '0.75rem', fontWeight: 600, margin: '0.15rem 0 0', color: p.display_price ? '#111' : '#888', fontStyle: p.display_price ? 'normal' : 'italic' }}>
                              {p.display_price ? formatRupees(p.price_paise) : 'Price on request'}
                            </p>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.375rem', flexShrink: 0 }}>
                            {/* Qty stepper */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                              <button type="button" onClick={() => setQty(p.id, Math.max(0, qty - 1))} style={stepperBtn} disabled={qty === 0}>−</button>
                              <span style={{ fontSize: '0.875rem', fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{qty}</span>
                              <button type="button" onClick={() => setQty(p.id, qty + 1)} style={stepperBtn}>+</button>
                            </div>

                            {/* Custom price input for display_price=false products */}
                            {!p.display_price && qty > 0 && (
                              <input
                                type="number"
                                min="0"
                                step="1"
                                placeholder="Your price (₹)"
                                value={sel?.customPricePaise != null ? String(sel.customPricePaise / 100) : ''}
                                onChange={(e) => setCustomPrice(p.id, e.target.value)}
                                style={{ ...inputStyle, width: 120, fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
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

        {/* Running total */}
        {selectedCount > 0 && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e5e5' }}>
            <p style={{ fontSize: '0.75rem', color: '#888', margin: '0 0 0.25rem' }}>
              {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
            </p>
            <p style={{ fontSize: '0.8125rem', color: '#555', margin: '0 0 0.375rem', lineHeight: 1.4 }}>
              {deliverablesSummary}
            </p>
            <p style={{ fontSize: '1rem', fontWeight: 700, margin: 0, fontFamily: 'monospace' }}>
              Total: {formatRupees(totalPaise)}
            </p>
          </div>
        )}
      </fieldset>

      {/* Price override */}
      <Field label="Total price (₹)" hint="Auto-calculated from products. Override if needed.">
        <input
          style={inputStyle}
          type="number"
          min="0"
          step="1"
          placeholder={totalPaise > 0 ? String(totalPaise / 100) : '0'}
          value={priceOverride}
          onChange={(e) => setPriceOverride(e.target.value)}
        />
        {priceOverride.trim() && Math.round(parseFloat(priceOverride) * 100) !== totalPaise && (
          <p style={{ fontSize: '0.7rem', color: '#b45309', margin: '0.25rem 0 0' }}>
            Overriding calculated total of {formatRupees(totalPaise)}
          </p>
        )}
      </Field>

      {/* Timeline */}
      <Field label="Delivery date">
        <input style={inputStyle} type="date" value={timelineDate} onChange={(e) => setTimelineDate(e.target.value)} />
      </Field>

      {/* Revision limit */}
      <Field label="Revision limit" hint="How many revision rounds the creator gets">
        <input style={inputStyle} type="number" min="0" value={revisionLimit} onChange={(e) => setRevisionLimit(e.target.value)} />
      </Field>

      {/* Usage rights */}
      <Field label="Usage rights">
        <select style={inputStyle} value={usageRights} onChange={(e) => setUsageRights(e.target.value)}>
          <option value="">Select...</option>
          {USAGE_PRESETS.map((u) => <option key={u} value={u}>{u}</option>)}
          <option value="Custom">Custom</option>
        </select>
        {usageRights === 'Custom' && (
          <input style={{ ...inputStyle, marginTop: '0.375rem' }} value={customUsage} onChange={(e) => setCustomUsage(e.target.value)} placeholder="Describe usage rights..." />
        )}
      </Field>

      {/* Payment terms */}
      <Field label="Payment terms">
        <select style={inputStyle} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
          <option value="">Select...</option>
          {PAYMENT_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
          <option value="Custom">Custom</option>
        </select>
        {paymentTerms === 'Custom' && (
          <input style={{ ...inputStyle, marginTop: '0.375rem' }} value={customPayment} onChange={(e) => setCustomPayment(e.target.value)} placeholder="Describe payment terms..." />
        )}
      </Field>

      {/* Message */}
      <Field label="Message to creator (optional)" hint="Will be sent as the first message in the deal thread">
        <textarea
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Hey! Would love to work together on..."
        />
      </Field>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || selectedCount === 0 || hasMissingPrice}
        style={{
          padding: '0.75rem 1.5rem',
          background: loading || selectedCount === 0 || hasMissingPrice ? 'var(--color-subtle)' : 'var(--accent)',
          color: loading || selectedCount === 0 || hasMissingPrice ? '#fff' : 'var(--accent-text)',
          border: 'none',
          borderRadius: 'var(--radius-lg)',
          fontWeight: 700,
          fontSize: '0.9375rem',
          cursor: loading || selectedCount === 0 || hasMissingPrice ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-heading)',
          alignSelf: 'flex-start',
        }}
      >
        {loading ? 'Creating...' : `Create offer · ${formatRupees(finalPaise)}`}
      </button>
    </form>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-heading)' }}>{label}</span>
      {hint && <span style={{ fontSize: '0.7rem', color: '#888' }}>{hint}</span>}
      {children}
    </label>
  )
}

/* ── Styles ─────────────────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.625rem',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: '0.875rem',
  outline: 'none',
  background: 'rgba(255,255,255,0.2)',
}

const fieldsetStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  padding: '1rem',
  margin: 0,
}

const legendStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 700,
  padding: '0 0.25rem',
  color: 'var(--color-heading)',
}

const platformBadge: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 700,
  textTransform: 'capitalize',
  padding: '0.1rem 0.5rem',
  borderRadius: 9999,
  background: 'var(--section-bg-alt)',
  border: '1px solid var(--color-border)',
}

const productRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.625rem 0.75rem',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--glass-bg)',
  gap: '0.75rem',
  transition: 'border-color 0.15s',
}

const stepperBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--glass-bg)',
  fontSize: '1rem',
  fontWeight: 700,
  cursor: 'pointer',
  color: 'var(--color-heading)',
}

const errorBox: React.CSSProperties = {
  color: '#dc2626',
  fontSize: '0.8125rem',
  padding: '0.5rem 0.75rem',
  background: '#fef2f2',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid #fecaca',
}
