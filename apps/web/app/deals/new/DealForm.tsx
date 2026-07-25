'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { createDeal } from '../actions'
import { useRouter } from 'next/navigation'
import { calculateFee } from '@/lib/fee'
import type { DealPrefill } from './page'

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
  included_revisions: number
  price_per_extra_revision_paise: number
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

export default function DealForm({ creator, products, platformFeePercent = 0, feeMode = 'on_top', prefill, campaigns = [] }: { creator: Creator; products: Product[]; platformFeePercent?: number; feeMode?: 'on_top' | 'deducted'; prefill?: DealPrefill; campaigns?: { id: string; name: string }[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [droppedItems, setDroppedItems] = useState<string[]>([])

  // Build initial selections from prefill (match items to current products)
  const prefillResult = useMemo<{ sel: Record<string, { qty: number; customPricePaise: number | null }>; dropped: string[] }>(() => {
    const sel: Record<string, { qty: number; customPricePaise: number | null }> = {}
    const dropped: string[] = []
    if (!prefill?.items?.length) return { sel, dropped }

    // Count occurrences of each item by label+platform+handle
    const itemCounts = new Map<string, { count: number; price_paise: number }>()
    for (const item of prefill.items) {
      const key = `${item.label}::${item.platform}::${item.handle}`
      const existing = itemCounts.get(key)
      if (existing) {
        existing.count++
      } else {
        itemCounts.set(key, { count: 1, price_paise: item.price_paise })
      }
    }

    // Match to current products
    Array.from(itemCounts.entries()).forEach(([key, { count, price_paise }]) => {
      const [label, platform, handle] = key.split('::')
      const product = products.find((p) => p.product_type === label && p.platform === platform && p.handle === handle)
      if (product) {
        sel[product.id] = {
          qty: count,
          customPricePaise: !product.display_price ? price_paise : null,
        }
      } else {
        dropped.push(`${label} (${platform} ${handle.startsWith('@') ? handle : `@${handle}`})`)
      }
    })

    return { sel, dropped }
  }, [prefill, products])

  // Product selections: productId → { qty, customPricePaise (for display_price=false) }
  const [selections, setSelections] = useState<Record<string, { qty: number; customPricePaise: number | null }>>(prefillResult.sel)

  // Set dropped items notice on mount
  const didSetDropped = useRef(false)
  useEffect(() => {
    if (!didSetDropped.current && prefillResult.dropped.length > 0) {
      setDroppedItems(prefillResult.dropped)
      didSetDropped.current = true
    }
  }, [prefillResult.dropped])

  // Resolve prefill usage/payment — check if it matches a preset or is custom
  function resolvePreset(value: string | null | undefined, presets: readonly string[]): { select: string; custom: string } {
    if (!value) return { select: '', custom: '' }
    if (presets.includes(value as any)) return { select: value, custom: '' }
    return { select: 'Custom', custom: value }
  }

  const prefillUsage = resolvePreset(prefill?.usage_rights, USAGE_PRESETS)
  const prefillPayment = resolvePreset(prefill?.payment_terms, PAYMENT_PRESETS)

  // Deal fields
  const [title, setTitle] = useState(prefill?.title || `Deal with ${creator.full_name}`)
  const [timelineDate, setTimelineDate] = useState('')
  const [revisionLimit, setRevisionLimit] = useState(prefill ? String(prefill.revision_limit) : '1')
  const [pricePerExtraRevision, setPricePerExtraRevision] = useState(prefill ? String(prefill.price_per_extra_revision_paise / 100) : '0')
  const [usageRights, setUsageRights] = useState(prefillUsage.select)
  const [customUsage, setCustomUsage] = useState(prefillUsage.custom)
  const [paymentTerms, setPaymentTerms] = useState(prefillPayment.select)
  const [customPayment, setCustomPayment] = useState(prefillPayment.custom)
  const [message, setMessage] = useState('')
  const [briefPitch, setBriefPitch] = useState(prefill?.brief_pitch ?? '')
  const [briefGuidelines, setBriefGuidelines] = useState(prefill?.brief_guidelines ?? '')
  const [activeTab, setActiveTab] = useState<'offer' | 'brief'>('offer')
  const [priceOverride, setPriceOverride] = useState('')
  const [requiresShipment, setRequiresShipment] = useState(false)
  const [campaignId, setCampaignId] = useState('')
  // Rights fields
  const [usageRightsEndDate, setUsageRightsEndDate] = useState(prefill?.usage_rights_end_date ?? '')
  // Per-item reel types + boosting: productId → value
  const [reelTypes, setReelTypes] = useState<Record<string, 'collab' | 'non_collab' | ''>>(() => {
    const rt: Record<string, 'collab' | 'non_collab' | ''> = {}
    if (prefill?.items) {
      for (const item of prefill.items) {
        if (!item.reel_type) continue
        const product = products.find((p) => p.product_type === item.label && p.platform === item.platform && p.handle === item.handle)
        if (product) rt[product.id] = item.reel_type as 'collab' | 'non_collab'
      }
    }
    return rt
  })
  const [itemBoostingRights, setItemBoostingRights] = useState<Record<string, boolean | null>>(() => {
    const br: Record<string, boolean | null> = {}
    if (prefill?.items) {
      for (const item of prefill.items) {
        if (item.boosting_rights == null) continue
        const product = products.find((p) => p.product_type === item.label && p.platform === item.platform && p.handle === item.handle)
        if (product) br[product.id] = item.boosting_rights
      }
    }
    return br
  })
  const [itemBoostingDuration, setItemBoostingDuration] = useState<Record<string, string>>(() => {
    const bd: Record<string, string> = {}
    if (prefill?.items) {
      for (const item of prefill.items) {
        if (!item.boosting_duration_months) continue
        const product = products.find((p) => p.product_type === item.label && p.platform === item.platform && p.handle === item.handle)
        if (product) bd[product.id] = String(item.boosting_duration_months)
      }
    }
    return bd
  })
  // Track whether revision fields have been auto-updated by product selection
  const prefillRevisionLock = useRef(!!prefill)

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

  // Pre-fill revision terms from selected products (min included, max per-extra)
  const { defaultIncluded, defaultExtraPaise } = useMemo(() => {
    const selectedProducts = products.filter((p) => {
      const s = selections[p.id]
      return s && s.qty > 0
    })
    if (selectedProducts.length === 0) return { defaultIncluded: 1, defaultExtraPaise: 0 }
    return {
      defaultIncluded: Math.min(...selectedProducts.map((p) => p.included_revisions)),
      defaultExtraPaise: Math.max(...selectedProducts.map((p) => p.price_per_extra_revision_paise)),
    }
  }, [products, selections])

  // Auto-update revision fields when product selection changes
  // Skip on first render if prefill provided (prefill values take priority initially)
  useEffect(() => {
    if (prefillRevisionLock.current) {
      prefillRevisionLock.current = false
      return
    }
    if (selectedCount > 0) {
      setRevisionLimit(String(defaultIncluded))
      setPricePerExtraRevision(String(defaultExtraPaise / 100))
    }
  }, [defaultIncluded, defaultExtraPaise, selectedCount])

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

    if (!title.trim()) {
      setError('Deal title is required')
      setActiveTab('offer')
      return
    }

    if (selectedCount === 0) {
      setError('Select at least one product')
      setActiveTab('offer')
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
    const items: { label: string; platform: string; handle: string; price_paise: number; reel_type?: 'collab' | 'non_collab'; boosting_rights?: boolean; boosting_duration_months?: number }[] = []
    for (const p of products) {
      const sel = selections[p.id]
      if (!sel || sel.qty <= 0) continue
      const unitPaise = p.display_price ? p.price_paise : (sel.customPricePaise ?? 0)
      const rt = reelTypes[p.id]
      const br = itemBoostingRights[p.id]
      const bd = itemBoostingDuration[p.id]
      for (let i = 0; i < sel.qty; i++) {
        items.push({
          label: p.product_type, platform: p.platform, handle: p.handle, price_paise: unitPaise,
          ...(rt ? { reel_type: rt } : {}),
          ...(br != null ? { boosting_rights: br } : {}),
          ...(br && bd ? { boosting_duration_months: parseInt(bd, 10) } : {}),
        })
      }
    }

    const extraRevPaise = Math.round(parseFloat(pricePerExtraRevision || '0') * 100)

    const res = await createDeal({
      creator_id: creator.id,
      title,
      deliverables: deliverablesSummary,
      price_paise: finalPaise,
      timeline_date: timelineDate || undefined,
      revision_limit: parseInt(revisionLimit, 10) || 0,
      price_per_extra_revision_paise: isNaN(extraRevPaise) ? 0 : extraRevPaise,
      usage_rights: resolvedUsage || undefined,
      payment_terms: resolvedPayment || undefined,
      message: message || undefined,
      items,
      reengaged_from: prefill?.reengaged_from,
      requires_shipment: requiresShipment,
      usage_rights_end_date: usageRightsEndDate || undefined,
      campaign_id: campaignId || undefined,
      brief_pitch: briefPitch || undefined,
      brief_guidelines: briefGuidelines || undefined,
    })

    setLoading(false)

    if (res?.error) {
      setError(res.error)
    } else if (res?.dealId) {
      router.push(`/deals/${res.dealId}`)
    } else {
      router.push('/deals')
    }
  }

  const socials = (creator.social_accounts ?? []) as SocialAccount[]

  function findSocial(platform: string, handle: string): SocialAccount | undefined {
    return socials.find((sa) => sa.platform === platform && sa.handle === handle)
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {error && <div style={errorBox}>{error}</div>}

      {droppedItems.length > 0 && (
        <div style={{ fontSize: '0.8125rem', padding: '0.625rem 0.75rem', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 'var(--radius-sm)', color: '#854d0e' }}>
          <strong>Heads up:</strong> {droppedItems.length === 1 ? 'One item' : `${droppedItems.length} items`} from the previous deal {droppedItems.length === 1 ? 'is' : 'are'} no longer offered by this creator and {droppedItems.length === 1 ? 'was' : 'were'} not pre-filled: {droppedItems.join(', ')}. Review before sending.
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--color-border, #e5e5e5)' }}>
        {(['offer', 'brief'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.5rem 1.25rem',
              fontSize: '0.8125rem',
              fontWeight: activeTab === tab ? 700 : 500,
              color: activeTab === tab ? 'var(--color-heading, #111)' : 'var(--color-muted, #888)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--color-heading, #111)' : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
              fontFamily: 'var(--font-heading, inherit)',
            }}
          >
            {tab === 'offer' ? 'Offer' : 'Brief'}
            {tab === 'brief' && (briefPitch || briefGuidelines) && (
              <span style={{ marginLeft: 6, width: 6, height: 6, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
            )}
          </button>
        ))}
      </div>

      {/* ── OFFER TAB ──────────────────────────────────────────── */}
      <div style={{ display: activeTab === 'offer' ? 'flex' : 'none', flexDirection: 'column', gap: '1.5rem' }}>

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
        <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      {/* Campaign */}
      {campaigns.length > 0 && (
        <Field label="Campaign (optional)" hint="Group this deal under a campaign">
          <select style={inputStyle} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">No campaign</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}

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

                            {/* Reel type toggle — Instagram items only */}
                            {qty > 0 && p.platform.toLowerCase() === 'instagram' && (
                              <select
                                value={reelTypes[p.id] ?? ''}
                                onChange={(e) => setReelTypes((prev) => ({ ...prev, [p.id]: e.target.value as any }))}
                                style={{ ...inputStyle, width: 120, fontSize: '0.7rem', padding: '0.2rem 0.375rem' }}
                              >
                                <option value="">Reel type...</option>
                                <option value="collab">Collab post</option>
                                <option value="non_collab">Non-collab</option>
                              </select>
                            )}

                            {/* Per-item boosting rights */}
                            {qty > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-end' }}>
                                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
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
                                          padding: '0.15rem 0.4rem',
                                          fontSize: '0.65rem',
                                          fontWeight: checked ? 700 : 500,
                                          borderRadius: 9999,
                                          border: checked ? '1.5px solid var(--color-heading)' : '1px solid var(--color-border)',
                                          background: checked ? 'var(--color-heading)' : 'var(--glass-bg)',
                                          color: checked ? '#fff' : 'var(--color-muted)',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        {label}
                                      </button>
                                    )
                                  })}
                                  {itemBoostingRights[p.id] != null && (
                                    <button
                                      type="button"
                                      onClick={() => { setItemBoostingRights((prev) => ({ ...prev, [p.id]: null })); setItemBoostingDuration((prev) => ({ ...prev, [p.id]: '' })) }}
                                      style={{ fontSize: '0.6rem', color: 'var(--color-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                                {itemBoostingRights[p.id] === true && (
                                  <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }}>
                                    {['1', '3', '6', '12'].map((m) => {
                                      const active = itemBoostingDuration[p.id] === m
                                      return (
                                        <button
                                          key={m}
                                          type="button"
                                          onClick={() => setItemBoostingDuration((prev) => ({ ...prev, [p.id]: m }))}
                                          style={{
                                            padding: '0.1rem 0.35rem',
                                            fontSize: '0.6rem',
                                            fontWeight: active ? 700 : 500,
                                            borderRadius: 9999,
                                            border: active ? '1.5px solid var(--color-heading)' : '1px solid var(--color-border)',
                                            background: active ? 'var(--section-bg-alt)' : 'var(--glass-bg)',
                                            color: active ? 'var(--color-heading)' : 'var(--color-muted)',
                                            cursor: 'pointer',
                                          }}
                                        >
                                          {m}mo
                                        </button>
                                      )
                                    })}
                                    <button
                                      type="button"
                                      onClick={() => setItemBoostingDuration((prev) => ({ ...prev, [p.id]: '' }))}
                                      style={{
                                        padding: '0.1rem 0.35rem',
                                        fontSize: '0.6rem',
                                        fontWeight: !itemBoostingDuration[p.id] ? 700 : 500,
                                        borderRadius: 9999,
                                        border: !itemBoostingDuration[p.id] ? '1.5px solid var(--color-heading)' : '1px solid var(--color-border)',
                                        background: !itemBoostingDuration[p.id] ? 'var(--section-bg-alt)' : 'var(--glass-bg)',
                                        color: !itemBoostingDuration[p.id] ? 'var(--color-heading)' : 'var(--color-muted)',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      ∞
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

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

      {/* Fee breakdown */}
      {selectedCount > 0 && platformFeePercent > 0 && finalPaise > 0 && (() => {
        const fee = calculateFee(finalPaise, platformFeePercent, feeMode)
        return (
          <div style={{ padding: '0.75rem 1rem', background: 'var(--section-bg-alt)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '0.8125rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--color-muted)' }}>Deliverables total</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{formatRupees(fee.base_paise)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--color-muted)' }}>Platform fee ({platformFeePercent}%){feeMode === 'deducted' ? ' — deducted' : ''}</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{feeMode === 'on_top' ? '+' : '−'}{formatRupees(fee.fee_paise)}</span>
            </div>
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.375rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, color: 'var(--color-heading)' }}>You pay</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-heading)' }}>{formatRupees(fee.brand_pays_paise)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-muted)' }}>Creator receives</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--color-muted)' }}>{formatRupees(fee.creator_receives_paise)}</span>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Timeline */}
      <Field label="Delivery date">
        <input style={inputStyle} type="date" value={timelineDate} onChange={(e) => setTimelineDate(e.target.value)} />
      </Field>

      {/* Revision terms — prominent, pre-filled from creator's products */}
      <fieldset style={{ ...fieldsetStyle, borderColor: selectedCount > 0 ? 'var(--color-heading)' : 'var(--color-border)' }}>
        <legend style={legendStyle}>Revision terms</legend>
        {selectedCount > 0 && (() => {
          const selectedProducts = products.filter((p) => {
            const s = selections[p.id]
            return s && s.qty > 0
          })
          const hasVariation = selectedProducts.length > 1 && (
            new Set(selectedProducts.map((p) => p.included_revisions)).size > 1 ||
            new Set(selectedProducts.map((p) => p.price_per_extra_revision_paise)).size > 1
          )
          return (
            <div style={{ fontSize: '0.75rem', color: '#666', margin: '0 0 0.75rem', padding: '0.5rem 0.625rem', background: 'var(--section-bg-alt)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
              <p style={{ margin: '0 0 0.25rem', fontWeight: 600, color: '#888', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Creator&apos;s product defaults
              </p>
              {selectedProducts.map((p) => {
                const displayHandle = p.handle.startsWith('@') ? p.handle : `@${p.handle}`
                const extraPrice = p.price_per_extra_revision_paise
                return (
                  <p key={p.id} style={{ margin: '0.15rem 0 0', lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 600 }}>{p.product_type}</span>{' '}
                    <span style={{ color: '#888' }}>({p.platform} {displayHandle})</span>
                    {' — '}
                    {p.included_revisions} rev incl
                    {extraPrice > 0 && <>, {formatRupees(extraPrice)}/extra</>}
                    {extraPrice === 0 && <>, free extras</>}
                  </p>
                )
              })}
              {hasVariation && (
                <p style={{ margin: '0.35rem 0 0', color: '#b45309', fontStyle: 'italic' }}>
                  Products have different revision terms — deal uses min included ({defaultIncluded}) and max per-extra ({formatRupees(defaultExtraPaise)}).
                </p>
              )}
              {!hasVariation && (
                <p style={{ margin: '0.25rem 0 0', color: '#888', fontStyle: 'italic' }}>
                  Adjust below if needed.
                </p>
              )}
            </div>
          )
        })()}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Field label="Included revisions" hint="Free revision rounds in this deal">
            <input style={{ ...inputStyle, width: 100 }} type="number" min="0" value={revisionLimit} onChange={(e) => setRevisionLimit(e.target.value)} />
          </Field>
          <Field label="Per extra revision (₹)" hint="Cost per revision beyond the included count">
            <input style={{ ...inputStyle, width: 140 }} type="number" min="0" step="1" value={pricePerExtraRevision} onChange={(e) => setPricePerExtraRevision(e.target.value)} placeholder="0" />
          </Field>
        </div>
        {parseFloat(pricePerExtraRevision) > 0 && (
          <p style={{ fontSize: '0.75rem', color: '#555', margin: '0.5rem 0 0' }}>
            {parseInt(revisionLimit, 10) || 0} revision{(parseInt(revisionLimit, 10) || 0) !== 1 ? 's' : ''} included, then ₹{parseFloat(pricePerExtraRevision).toLocaleString('en-IN')} per extra
          </p>
        )}
      </fieldset>

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

      {/* Content rights — deal-level fields only (boosting is per-item, set above in product rows) */}
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Content rights</legend>
        <p style={{ fontSize: '0.7rem', color: '#888', margin: '0 0 0.5rem' }}>
          Boosting rights are set per deliverable above. Usage rights expiry applies to the whole deal.
        </p>
        <Field label="Usage rights expire on" hint="When do all content usage rights end? Leave blank for perpetual.">
          <input style={inputStyle} type="date" value={usageRightsEndDate} onChange={(e) => setUsageRightsEndDate(e.target.value)} />
        </Field>
      </fieldset>

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

      {/* Product shipment */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={requiresShipment}
          onChange={(e) => setRequiresShipment(e.target.checked)}
          style={{ width: 16, height: 16, accentColor: 'var(--color-heading)' }}
        />
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-heading)' }}>
          This deal includes a product shipment
        </span>
      </label>
      {requiresShipment && (
        <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', margin: '-0.75rem 0 0 1.5rem' }}>
          You&apos;ll be able to add tracking info after the creator accepts.
        </p>
      )}

      {/* Message */}
      <Field label="Message to creator (optional)" hint="Will be sent as the first message in the deal thread">
        <textarea
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Hey! Would love to work together on..."
        />
      </Field>

      </div>{/* end offer tab */}

      {/* ── BRIEF TAB ──────────────────────────────────────────── */}
      <div style={{ display: activeTab === 'brief' ? 'flex' : 'none', flexDirection: 'column', gap: '1.5rem' }}>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: 0, lineHeight: 1.5 }}>
          Share your campaign pitch and creative guidelines with the creator. They&apos;ll see this on their deal page. This is optional.
        </p>
        <Field label="Pitch" hint="What's the campaign about? What do you want the creator to communicate?">
          <textarea
            style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
            value={briefPitch}
            onChange={(e) => setBriefPitch(e.target.value)}
            placeholder="We're launching our new savings account for Gen-Z. We want authentic, relatable content showing how easy it is to start saving..."
            maxLength={2000}
          />
        </Field>
        <Field label="Creative guidelines" hint="Any dos/don'ts, tone, hashtags, or specific talking points?">
          <textarea
            style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
            value={briefGuidelines}
            onChange={(e) => setBriefGuidelines(e.target.value)}
            placeholder="Must mention: zero-balance account, 7% interest. Don't mention competitors by name. Tone: casual, not scripted. Use #StartSaving."
            maxLength={2000}
          />
        </Field>
      </div>{/* end brief tab */}

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
        {loading ? 'Creating...' : `Create offer · ${formatRupees(platformFeePercent > 0 && feeMode === 'on_top' ? calculateFee(finalPaise, platformFeePercent, feeMode).brand_pays_paise : finalPaise)}`}
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
