'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { createDeal } from '../actions'
import { uploadBriefAttachment, removeBriefAttachment } from './upload-actions'
import PointsInput from './PointsInput'
import { useRouter } from 'next/navigation'
import { calculateFee } from '@/lib/fee'
import type { DealPrefill } from './page'
import { trackEvent, priceBucket } from '@/lib/analytics'

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
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

// Platform icons
function InstagramIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" /></svg>
}

function YouTubeIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 17V7a3 3 0 0 1 3-3h13a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3Z" /><path d="m10 9 5 3-5 3Z" /></svg>
}

function PlatformIcon({ platform }: { platform: string }) {
  const p = platform.toLowerCase()
  if (p === 'instagram') return <InstagramIcon />
  if (p === 'youtube') return <YouTubeIcon />
  return null
}

export default function DealForm({ creator, products, platformFeePercent = 0, feeMode = 'on_top', prefill, campaigns = [], storefrontSelections }: { creator: Creator; products: Product[]; platformFeePercent?: number; feeMode?: 'on_top' | 'deducted'; prefill?: DealPrefill; campaigns?: { id: string; name: string }[]; storefrontSelections?: Record<string, number> }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [droppedItems, setDroppedItems] = useState<string[]>([])

  // Build initial selections from prefill
  const prefillResult = useMemo<{ sel: Record<string, { qty: number; customPricePaise: number | null }>; dropped: string[] }>(() => {
    const sel: Record<string, { qty: number; customPricePaise: number | null }> = {}
    const dropped: string[] = []
    if (!prefill?.items?.length) return { sel, dropped }

    const itemCounts = new Map<string, { count: number; price_paise: number }>()
    for (const item of prefill.items) {
      const key = `${item.label}::${item.platform}::${item.handle}`
      const existing = itemCounts.get(key)
      if (existing) { existing.count++ }
      else { itemCounts.set(key, { count: 1, price_paise: item.price_paise }) }
    }

    Array.from(itemCounts.entries()).forEach(([key, { count, price_paise }]) => {
      const [label, platform, handle] = key.split('::')
      const product = products.find((p) => p.product_type === label && p.platform === platform && p.handle === handle)
      if (product) {
        sel[product.id] = { qty: count, customPricePaise: !product.display_price ? price_paise : null }
      } else {
        dropped.push(`${label} (${platform} ${handle.startsWith('@') ? handle : `@${handle}`})`)
      }
    })
    return { sel, dropped }
  }, [prefill, products])

  const [selections, setSelections] = useState<Record<string, { qty: number; customPricePaise: number | null }>>(() => {
    // If storefront selections exist (from browse rate card), use those
    if (storefrontSelections && Object.keys(prefillResult.sel).length === 0) {
      const sel: Record<string, { qty: number; customPricePaise: number | null }> = {}
      for (const [productId, qty] of Object.entries(storefrontSelections)) {
        if (products.some(p => p.id === productId)) {
          sel[productId] = { qty, customPricePaise: null }
        }
      }
      return sel
    }
    return prefillResult.sel
  })

  const didSetDropped = useRef(false)
  useEffect(() => {
    if (!didSetDropped.current && prefillResult.dropped.length > 0) {
      setDroppedItems(prefillResult.dropped)
      didSetDropped.current = true
    }
  }, [prefillResult.dropped])

  function resolvePreset(value: string | null | undefined, presets: readonly string[]): { select: string; custom: string } {
    if (!value) return { select: '', custom: '' }
    if (presets.includes(value as any)) return { select: value, custom: '' }
    return { select: 'Custom', custom: value }
  }

  const prefillUsage = resolvePreset(prefill?.usage_rights, USAGE_PRESETS)
  const prefillPayment = resolvePreset(prefill?.payment_terms, PAYMENT_PRESETS)

  const [title, setTitle] = useState(prefill?.title || `Deal with ${creator.full_name}`)
  const [revisionLimit, setRevisionLimit] = useState(prefill ? String(prefill.revision_limit) : '1')
  const [pricePerExtraRevision, setPricePerExtraRevision] = useState(prefill ? String(prefill.price_per_extra_revision_paise / 100) : '0')
  const [usageRights, setUsageRights] = useState(prefillUsage.select)
  const [customUsage, setCustomUsage] = useState(prefillUsage.custom)
  const [paymentTerms, setPaymentTerms] = useState(prefillPayment.select)
  const [customPayment, setCustomPayment] = useState(prefillPayment.custom)
  const [message, setMessage] = useState('')
  const [briefPitch, setBriefPitch] = useState(prefill?.brief_pitch ?? '')
  const [briefGuidelines, setBriefGuidelines] = useState(prefill?.brief_guidelines ?? '')
  const [briefAvoid, setBriefAvoid] = useState('')
  const [briefAttachments, setBriefAttachments] = useState<{ name: string; storage_path: string; size_bytes: number; content_type: string }[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [priceOverride, setPriceOverride] = useState('')
  const [requiresShipment, setRequiresShipment] = useState(false)
  const [campaignId, setCampaignId] = useState('')
  const [usageRightsEndDate, setUsageRightsEndDate] = useState(prefill?.usage_rights_end_date ?? '')

  // Per-item delivery dates: productId → date string
  const [itemDeliveryDates, setItemDeliveryDates] = useState<Record<string, string>>({})

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
  const prefillRevisionLock = useRef(!!prefill)

  // All unique platforms (for anchor tabs)
  const platforms = useMemo(() => {
    const set = new Set<string>()
    for (const p of products) set.add(p.platform)
    return Array.from(set)
  }, [products])

  // Collapsed groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

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

  // Compute total from selections
  const { totalPaise, selectedCount, deliverablesSummary, hasMissingPrice } = useMemo(() => {
    let total = 0
    let count = 0
    const lines: string[] = []

    for (const p of products) {
      const sel = selections[p.id]
      if (!sel || sel.qty <= 0) continue
      count += sel.qty
      const unitPaise = p.display_price ? p.price_paise : (sel.customPricePaise ?? 0)
      total += unitPaise * sel.qty
      const qtyPrefix = sel.qty > 1 ? `${sel.qty}\u00D7 ` : ''
      const priceNote = !p.display_price && sel.customPricePaise != null ? ` @ ${formatRupees(sel.customPricePaise)}` : ''
      const displayHandle = p.handle.startsWith('@') ? p.handle : `@${p.handle}`
      lines.push(`${qtyPrefix}${p.product_type}${priceNote} (${p.platform} ${displayHandle})`)
    }

    let missingPrice = false
    for (const p of products) {
      const s = selections[p.id]
      if (!s || s.qty <= 0) continue
      if (!p.display_price && (!s.customPricePaise || s.customPricePaise <= 0)) { missingPrice = true; break }
    }

    return { totalPaise: total, selectedCount: count, deliverablesSummary: lines.join(' + '), hasMissingPrice: missingPrice }
  }, [products, selections])

  const { defaultIncluded, defaultExtraPaise } = useMemo(() => {
    const selectedProducts = products.filter((p) => { const s = selections[p.id]; return s && s.qty > 0 })
    if (selectedProducts.length === 0) return { defaultIncluded: 1, defaultExtraPaise: 0 }
    return {
      defaultIncluded: Math.min(...selectedProducts.map((p) => p.included_revisions)),
      defaultExtraPaise: Math.max(...selectedProducts.map((p) => p.price_per_extra_revision_paise)),
    }
  }, [products, selections])

  useEffect(() => {
    if (prefillRevisionLock.current) { prefillRevisionLock.current = false; return }
    if (selectedCount > 0) {
      setRevisionLimit(String(defaultIncluded))
      setPricePerExtraRevision(String(defaultExtraPaise / 100))
    }
  }, [defaultIncluded, defaultExtraPaise, selectedCount])

  const finalPaise = priceOverride.trim() ? Math.round(parseFloat(priceOverride) * 100) : totalPaise

  function setQty(productId: string, qty: number) {
    setSelections((prev) => ({ ...prev, [productId]: { qty, customPricePaise: prev[productId]?.customPricePaise ?? null } }))
    if (qty === 0) setItemDeliveryDates((prev) => { const next = { ...prev }; delete next[productId]; return next })
  }

  function setCustomPrice(productId: string, rupees: string) {
    const paise = rupees.trim() ? Math.round(parseFloat(rupees) * 100) : null
    setSelections((prev) => ({ ...prev, [productId]: { qty: prev[productId]?.qty ?? 0, customPricePaise: paise } }))
  }

  // Derive deal-level timeline_date from per-item dates (latest date)
  const derivedTimelineDate = useMemo(() => {
    const dates = Object.entries(itemDeliveryDates)
      .filter(([pid]) => { const s = selections[pid]; return s && s.qty > 0 })
      .map(([, d]) => d)
      .filter(Boolean)
      .sort()
    return dates.length > 0 ? dates[dates.length - 1] : ''
  }, [itemDeliveryDates, selections])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) { setError('Deal title is required'); return }
    if (selectedCount === 0) { setError('Select at least one product'); return }
    if (hasMissingPrice) { setError('Enter a price for all "price on request" products'); return }
    if (isNaN(finalPaise) || finalPaise <= 0) { setError('Total price must be greater than ₹0'); return }

    // Validate: every selected deliverable needs a delivery date
    const missingDates: string[] = []
    for (const p of products) {
      const sel = selections[p.id]
      if (!sel || sel.qty <= 0) continue
      if (!itemDeliveryDates[p.id]) missingDates.push(p.product_type)
    }
    if (missingDates.length > 0) {
      setError(`Set a delivery date for: ${missingDates.join(', ')}`)
      return
    }

    setLoading(true)

    const resolvedUsage = usageRights === 'Custom' ? customUsage : usageRights
    const resolvedPayment = paymentTerms === 'Custom' ? customPayment : paymentTerms

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
      timeline_date: derivedTimelineDate || undefined,
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
      brief_avoid: briefAvoid || undefined,
      brief_attachments: briefAttachments.length > 0 ? briefAttachments : undefined,
    })

    if (res?.error) { setLoading(false); setError(res.error) }
    else {
      // Amount is BUCKETED — exact deal values are commercially sensitive and
      // should not leave for a third-party analytics tool.
      trackEvent('offer_sent', {
        price_bucket: priceBucket(res?.pricePaise ?? finalPaise),
        deal_number: res?.dealCount ?? null,
        repeat_creator: (res?.pairCount ?? 0) > 1,
      })

      // Retention signal. Fires from the second deal onward; filter on
      // deal_number === 2 for the strict "started a second deal" cohort.
      if ((res?.dealCount ?? 0) >= 2) {
        trackEvent('deal_2_started', {
          deal_number: res?.dealCount ?? null,
          repeat_creator: (res?.pairCount ?? 0) > 1,
        })
      }

      if (res?.dealId) router.push(`/deals/${res.dealId}`)
      else router.push('/deals')
    }
  }

  const firstName = creator.full_name.split(' ')[0]

  // Build summary lines
  const summaryLines = useMemo(() => {
    const lines: { label: string; amount: number }[] = []
    for (const p of products) {
      const sel = selections[p.id]
      if (!sel || sel.qty <= 0) continue
      const unitPaise = p.display_price ? p.price_paise : (sel.customPricePaise ?? 0)
      lines.push({ label: `${sel.qty} \u00D7 ${p.product_type}`, amount: unitPaise * sel.qty })
    }
    return lines
  }, [products, selections])

  const feeInfo = useMemo(() => {
    if (platformFeePercent > 0 && finalPaise > 0) return calculateFee(finalPaise, platformFeePercent, feeMode)
    return null
  }, [finalPaise, platformFeePercent, feeMode])

  // Anchor IDs for platform sections
  function platformAnchor(platform: string) {
    return `deliv-${platform.toLowerCase().replace(/\s+/g, '-')}`
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div style={{ fontSize: 13, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, color: '#dc2626', marginBottom: 20, fontWeight: 500 }}>
          {error}
        </div>
      )}

      {droppedItems.length > 0 && (
        <div style={{ fontSize: 13, padding: '10px 14px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 12, color: '#854d0e', marginBottom: 20 }}>
          <strong>Heads up:</strong> {droppedItems.length === 1 ? 'One item' : `${droppedItems.length} items`} from the previous deal {droppedItems.length === 1 ? 'is' : 'are'} no longer offered and {droppedItems.length === 1 ? 'was' : 'were'} not pre-filled: {droppedItems.join(', ')}.
        </div>
      )}

      {/* ══════ DEAL NAME ══════ */}
      <div className="surface" style={{ padding: '16px 24px', marginBottom: 20 }}>
        <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, display: 'block' }}>Deal name</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`Deal with ${creator.full_name}`}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              padding: '6px 12px',
              border: '1.5px solid var(--border-hairline)',
              borderRadius: 10,
              background: 'var(--sec-2)',
              outline: 'none',
              color: 'var(--ink)',
              width: '100%',
              minWidth: 200,
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--neon-deep)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-hairline)' }}
          />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.5 }}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
        </div>
      </div>

      {/* ══════ DELIVERABLES CARD ══════ */}
      <div className="surface" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Select deliverables</h3>
          <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>Rates are set by {firstName} &middot; pricing can&apos;t go lower</span>
        </div>

        {/* Platform anchor tabs — scroll to section on click */}
        {platforms.length > 1 && (
          <div style={{ display: 'flex', gap: 2, marginTop: 24, paddingBottom: 0, borderBottom: '1.5px solid var(--border-hairline)' }}>
            {platforms.map((plat) => (
              <a
                key={plat}
                href={`#${platformAnchor(plat)}`}
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(platformAnchor(plat))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                style={{
                  position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7,
                  height: 38, padding: '0 18px', borderRadius: '12px 12px 0 0',
                  fontSize: 13, fontWeight: 700, textDecoration: 'none', cursor: 'pointer',
                  border: '1.5px solid var(--border-hairline)',
                  borderBottom: '1.5px solid var(--card)',
                  background: 'var(--card)', color: 'var(--ink)',
                  boxShadow: '0 -2px 8px rgba(22,23,15,.03)',
                  fontFamily: 'var(--font-ui)', marginBottom: -1.5,
                }}
              >
                {plat}
              </a>
            ))}
          </div>
        )}

        {/* All product groups in vertical list */}
        {products.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginTop: 20 }}>This creator has no products listed.</p>
        ) : (
          <>
            {Array.from(grouped.entries()).map(([key, prods], groupIdx) => {
              const [platform, handle] = key.split('::')
              const displayHandle = handle?.startsWith('@') ? handle : `@${handle}`
              const isCollapsed = collapsedGroups.has(key)

              return (
                <div key={key} style={{ marginTop: groupIdx === 0 ? 20 : 40, scrollMarginTop: 100 }} id={Array.from(grouped.keys()).findIndex((k) => k.startsWith(platform + '::')) === groupIdx ? platformAnchor(platform) : undefined}>
                  {/* Channel header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 12, padding: '0 6px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ display: 'inline-flex', color: 'var(--ink)' }}>
                        <PlatformIcon platform={platform} />
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink)' }}>
                        {platform} &middot; {displayHandle}
                      </span>
                    </span>
                    {/* Show/hide toggle */}
                    {groupIdx > 0 && (
                      <button
                        type="button"
                        onClick={() => setCollapsedGroups((prev) => {
                          const next = new Set(prev)
                          if (next.has(key)) next.delete(key); else next.add(key)
                          return next
                        })}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', padding: 0 }}
                      >
                        {isCollapsed ? 'Show' : 'Hide'}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ transform: isCollapsed ? 'none' : 'rotate(180deg)', transition: 'transform .16s' }}><path d="m6 9 6 6 6-6" /></svg>
                      </button>
                    )}
                  </div>

                  {/* Product cards */}
                  {!isCollapsed && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {prods.map((p) => {
                        const sel = selections[p.id]
                        const qty = sel?.qty ?? 0
                        const selected = qty > 0
                        const unitPaise = p.display_price ? p.price_paise : (sel?.customPricePaise ?? 0)

                        return (
                          <div key={p.id} className="scp0" style={{
                            border: selected ? '1.5px solid var(--neon-deep, var(--lime-400))' : '1.5px solid var(--hairline, #EAEAE3)',
                            background: 'var(--card)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px' }}>
                              {/* Checkbox + name */}
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
                                    {p.display_price ? `${formatRupees(p.price_paise)} each` : 'Price on request'}
                                  </span>
                                </span>
                              </button>

                              {/* Qty stepper */}
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

                              {/* Price */}
                              <div style={{ textAlign: 'right', minWidth: 104 }}>
                                <div style={{
                                  fontFamily: 'var(--font-display)', fontSize: 18,
                                  fontWeight: selected ? 800 : 700,
                                  letterSpacing: '-0.02em', lineHeight: 1,
                                  color: selected ? 'var(--ink)' : 'var(--ink-soft)',
                                }}>
                                  {p.display_price
                                    ? formatRupees(unitPaise * (qty || 1))
                                    : (selected && sel?.customPricePaise ? formatRupees(sel.customPricePaise * qty) : '\u2014')
                                  }
                                </div>
                              </div>
                            </div>

                            {/* Options row — reel type, boosting, delivery date, custom price */}
                            {selected && (
                              <div style={{ padding: '0 18px 14px 52px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                {/* Reel type (Instagram only) */}
                                {p.platform.toLowerCase() === 'instagram' && (
                                  <OptionPill
                                    label="Reel type"
                                    value={reelTypes[p.id] === 'collab' ? 'Collab post' : reelTypes[p.id] === 'non_collab' ? 'Non-collab' : ''}
                                    options={['Collab post', 'Non-collab']}
                                    onChange={(v) => setReelTypes((prev) => ({ ...prev, [p.id]: v === 'Collab post' ? 'collab' : v === 'Non-collab' ? 'non_collab' : '' as any }))}
                                  />
                                )}

                                {/* Boosting rights */}
                                <OptionPill
                                  label="Boosting rights"
                                  value={itemBoostingRights[p.id] === true ? (itemBoostingDuration[p.id] ? `${itemBoostingDuration[p.id]} mo` : 'Yes') : itemBoostingRights[p.id] === false ? 'Not included' : ''}
                                  options={['7 days', '30 days', '90 days', 'Not included']}
                                  onChange={(v) => {
                                    if (v === 'Not included') {
                                      setItemBoostingRights((prev) => ({ ...prev, [p.id]: false }))
                                      setItemBoostingDuration((prev) => ({ ...prev, [p.id]: '' }))
                                    } else {
                                      setItemBoostingRights((prev) => ({ ...prev, [p.id]: true }))
                                      const months = v === '7 days' ? '1' : v === '30 days' ? '1' : v === '90 days' ? '3' : ''
                                      setItemBoostingDuration((prev) => ({ ...prev, [p.id]: months }))
                                    }
                                  }}
                                />

                                {/* Per-deliverable delivery date */}
                                <DatePill
                                  value={itemDeliveryDates[p.id] ?? ''}
                                  onChange={(v) => setItemDeliveryDates((prev) => ({ ...prev, [p.id]: v }))}
                                />

                                {/* Custom price for on-request products */}
                                {!p.display_price && (
                                  <input
                                    type="number" min="0" step="1"
                                    placeholder="Your price (₹)"
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
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* Summary lines */}
        {selectedCount > 0 && (
          <div style={{ marginTop: 26, paddingTop: 20, borderTop: '1px solid var(--border-hairline)' }}>
            {summaryLines.map((line, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '9px 0' }}>
                <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{line.label}</span>
                <b style={{ fontSize: 14, fontWeight: 700 }}>{formatRupees(line.amount)}</b>
              </div>
            ))}
            {feeInfo && (
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '9px 0' }}>
                <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Platform fee ({platformFeePercent}%)</span>
                <b style={{ fontSize: 14, fontWeight: 700 }}>{formatRupees(feeInfo.fee_paise)}</b>
              </div>
            )}
          </div>
        )}

        {/* Total box */}
        {selectedCount > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
            padding: '18px 22px', marginTop: 22, borderRadius: 14,
            border: '1.5px solid var(--neon-deep, var(--lime-400))',
            background: 'color-mix(in oklab, var(--neon, var(--lime-400)) 16%, var(--card))',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
              {selectedCount} deliverable{selectedCount !== 1 ? 's' : ''} &middot; deal total
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, fontSize: 28, color: 'var(--ink)' }}>
              {formatRupees(feeInfo ? feeInfo.brand_pays_paise : finalPaise)}
            </span>
          </div>
        )}
      </div>

      {/* ══════ BRIEF DETAILS CARD ══════ */}
      <div className="surface" style={{ padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Brief details</h3>

        {/* Campaign selector */}
        {campaigns.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '16px 18px', borderRadius: 14, background: 'var(--sec-2)', marginTop: 20 }}>
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink)' }}>Is this part of a campaign?</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>Group this deal with other creators you&apos;re running the same push with.</div>
            </div>
            <select className="dinput" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} style={{ width: 'auto', minWidth: 220, height: 44, paddingLeft: 14 }}>
              <option value="">Not part of a campaign</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {/* Brief + Terms grid */}
        <div className="brief-grid" style={{ marginTop: 24 }}>
          {/* Left: Brief */}
          <div style={{ borderRadius: 16, border: '1px solid var(--hairline)', padding: 22, display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Brief</div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 9 }}>The pitch</div>
              <textarea className="dinput" rows={4} placeholder="What the campaign is, why him, and what you want the audience to feel." value={briefPitch} onChange={(e) => setBriefPitch(e.target.value)} maxLength={2000} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 9 }}>Creative guidelines</div>
              <PointsInput value={briefGuidelines} onChange={setBriefGuidelines} placeholder="Tone, must-mentions, hashtags…" />
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 9 }}>What to avoid</div>
              <PointsInput value={briefAvoid} onChange={setBriefAvoid} placeholder="Competitor mentions, off-brand language…" />
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 9 }}>Attachments</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 12 }}>Mood boards, brand guidelines, reference videos, up to 50 MB each.</div>
              {briefAttachments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {briefAttachments.map((att, i) => (
                    <div key={att.storage_path} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--sec-2, #F4F8FC)', border: '1px solid var(--hairline)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--ink-faint)', flexShrink: 0 }}>{(att.size_bytes / (1024 * 1024)).toFixed(1)} MB</span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await removeBriefAttachment(att.storage_path)
                          setBriefAttachments((prev) => prev.filter((_, j) => j !== i))
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: 'var(--ink-soft)' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, border: '1px dashed var(--hairline)', background: 'var(--card)', cursor: uploadingFile ? 'wait' : 'pointer', opacity: uploadingFile ? 0.6 : 1 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M12 3v13M7 8l5-5 5 5" /></svg>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-soft)' }}>{uploadingFile ? 'Uploading\u2026' : 'Add file'}</span>
                <input
                  type="file"
                  style={{ display: 'none' }}
                  disabled={uploadingFile}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (file.size > 50 * 1024 * 1024) {
                      alert('File too large. Maximum size is 50 MB.')
                      e.target.value = ''
                      return
                    }
                    setUploadingFile(true)
                    const fd = new FormData()
                    fd.append('file', file)
                    const res = await uploadBriefAttachment(fd)
                    setUploadingFile(false)
                    e.target.value = ''
                    if (res.error) { alert(res.error); return }
                    if (res.attachment) setBriefAttachments((prev) => [...prev, res.attachment!])
                  }}
                />
              </label>
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 9 }}>Message</div>
              <textarea className="dinput" rows={3} placeholder="Optional: a note to send with the offer." value={message} onChange={(e) => setMessage(e.target.value)} style={{ width: '100%' }} />
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 9 }}>This becomes the first message in your thread with {firstName}.</div>
            </div>
          </div>

          {/* Right: Terms */}
          <div style={{ borderRadius: 16, border: '1px solid var(--hairline)', padding: 22, display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Terms</div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 9 }}>Revisions</div>
              <select className="dinput" value={`${revisionLimit}::${pricePerExtraRevision}`} onChange={(e) => {
                const [rl, per] = e.target.value.split('::')
                setRevisionLimit(rl)
                setPricePerExtraRevision(per)
              }} style={{ width: '100%' }}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={`${n}::${pricePerExtraRevision}`}>
                    {n} included {parseFloat(pricePerExtraRevision) > 0 ? `\u00B7 \u20B9${parseFloat(pricePerExtraRevision).toLocaleString('en-IN')} per extra` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 9 }}>Usage rights</div>
              <select className="dinput" value={usageRights} onChange={(e) => setUsageRights(e.target.value)} style={{ width: '100%' }}>
                <option value="">Select...</option>
                {USAGE_PRESETS.map((u) => <option key={u} value={u}>{u}{usageRightsEndDate ? ` \u00B7 to ${new Date(usageRightsEndDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</option>)}
                <option value="Custom">Custom</option>
              </select>
              {usageRights === 'Custom' && (
                <input className="dinput" value={customUsage} onChange={(e) => setCustomUsage(e.target.value)} placeholder="Describe usage rights..." style={{ marginTop: 8, width: '100%' }} />
              )}
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 9 }}>Payment terms</div>
              <select className="dinput" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} style={{ width: '100%' }}>
                <option value="">Select...</option>
                {PAYMENT_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                <option value="Custom">Custom</option>
              </select>
              {paymentTerms === 'Custom' && (
                <input className="dinput" value={customPayment} onChange={(e) => setCustomPayment(e.target.value)} placeholder="Describe payment terms..." style={{ marginTop: 8, width: '100%' }} />
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={() => setRequiresShipment(!requiresShipment)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-ui)', color: 'var(--ink)' }}
              >
                <span style={{
                  width: 22, height: 22, flex: '0 0 auto', borderRadius: 7,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background .16s',
                  border: requiresShipment ? '1.5px solid var(--neon-deep)' : '1.5px solid #D3DBE6',
                  background: requiresShipment ? 'var(--neon, var(--lime-400))' : 'var(--card)',
                  color: requiresShipment ? 'var(--ink)' : 'transparent',
                }}>
                  {requiresShipment && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  )}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.4 }}>This deal includes a product shipment</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 26, paddingTop: 22, borderTop: '1px solid var(--border-hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', maxWidth: 420 }}>
            {firstName} can accept, counter, or decline. You will be notified either way.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="pill"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, height: 48, padding: '0 20px',
                borderRadius: 12, background: 'var(--card)', border: '1px solid var(--hairline)',
                boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 8px 16px rgba(22,23,15,.04)',
                fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer',
              }}
            >
              Save draft
            </button>
            <button
              type="submit"
              disabled={loading || selectedCount === 0 || hasMissingPrice}
              className="neonbtn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 9, height: 48, padding: '0 24px',
                borderRadius: 12, background: 'var(--neon, var(--lime-400))', border: 'none',
                fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 14, letterSpacing: '-0.01em',
                color: 'var(--ink)', cursor: loading || selectedCount === 0 || hasMissingPrice ? 'not-allowed' : 'pointer',
                boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
                opacity: loading || selectedCount === 0 || hasMissingPrice ? 0.5 : 1,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
              {loading ? 'Creating...' : 'Create offer'}
            </button>
          </div>
        </div>
      </div>

      <input type="hidden" name="title" value={title} />
    </form>
  )
}

/* ── Option pill with hidden select ── */
/* ── Custom date picker pill ── */
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const
const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const

function DatePill({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Viewing month/year (defaults to selected date or today)
  const base = value ? new Date(value + 'T00:00:00') : new Date()
  const [viewYear, setViewYear] = useState(base.getFullYear())
  const [viewMonth, setViewMonth] = useState(base.getMonth())

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1)
  const startDow = (firstDay.getDay() + 6) % 7 // Monday = 0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate()

  const cells: { day: number; current: boolean; dateStr: string }[] = []
  // Previous month fill
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevMonthDays - i
    const m = viewMonth === 0 ? 11 : viewMonth - 1
    const y = viewMonth === 0 ? viewYear - 1 : viewYear
    cells.push({ day: d, current: false, dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true, dateStr: `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
  }
  // Next month fill
  const remaining = 7 - (cells.length % 7)
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1
      const y = viewMonth === 11 ? viewYear + 1 : viewYear
      cells.push({ day: d, current: false, dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
    }
  }

  const todayStr = new Date().toISOString().split('T')[0]

  function prev() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1) }
    else setViewMonth(viewMonth - 1)
  }
  function next() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1) }
    else setViewMonth(viewMonth + 1)
  }

  const displayText = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : null

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => {
          if (!open) {
            const b = value ? new Date(value + 'T00:00:00') : new Date()
            setViewYear(b.getFullYear())
            setViewMonth(b.getMonth())
          }
          setOpen(!open)
        }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, height: 27,
          padding: '0 10px', borderRadius: 8,
          background: 'var(--sec, #F4F8FC)',
          border: value ? '1px solid transparent' : '1px dashed var(--border-hairline)',
          fontSize: 11.5, cursor: 'pointer', fontFamily: 'var(--font-ui)',
          color: 'var(--ink)', whiteSpace: 'nowrap',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
        <span style={{ color: 'var(--ink-soft)' }}>Deliver by</span>
        {displayText && <b style={{ fontWeight: 700 }}>{displayText}</b>}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
          width: 280, padding: '14px 16px 12px',
          background: 'var(--card)', borderRadius: 16,
          border: '1px solid var(--hairline, #EAEAE3)',
          boxShadow: '0 4px 6px rgba(22,23,15,.04), 0 12px 28px rgba(22,23,15,.1), 0 32px 64px rgba(22,23,15,.06)',
          fontFamily: 'var(--font-ui)',
        }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button type="button" onClick={prev} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'var(--sec, #F4F8FC)', border: 'none', cursor: 'pointer', color: 'var(--ink)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.01em' }}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={next} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'var(--sec, #F4F8FC)', border: 'none', cursor: 'pointer', color: 'var(--ink)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>

          {/* Day-of-week headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, marginBottom: 4 }}>
            {DAY_LABELS.map((d) => (
              <span key={d} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 600, color: 'var(--ink-faint)', padding: '4px 0', letterSpacing: '0.04em' }}>{d}</span>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((cell, i) => {
              const isSelected = cell.dateStr === value
              const isToday = cell.dateStr === todayStr
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onChange(cell.dateStr); setOpen(false) }}
                  style={{
                    width: '100%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12.5, fontWeight: isSelected ? 800 : isToday ? 700 : 500,
                    fontFamily: 'var(--font-ui)',
                    borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: isSelected ? 'var(--neon, #E8FF66)' : 'transparent',
                    color: !cell.current ? 'var(--ink-faint)' : isSelected ? 'var(--ink)' : 'var(--ink)',
                    opacity: cell.current ? 1 : 0.35,
                    outline: isToday && !isSelected ? '1.5px solid var(--border-hairline)' : 'none',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--sec, #F4F8FC)' }}
                  onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>

          {/* Footer: Today + Clear */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border-hairline)' }}>
            <button type="button" onClick={() => { onChange(''); setOpen(false) }} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontFamily: 'var(--font-ui)' }}>Clear</button>
            <button type="button" onClick={() => { onChange(todayStr); setOpen(false) }} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontFamily: 'var(--font-ui)' }}>Today</button>
          </div>
        </div>
      )}
    </div>
  )
}

function OptionPill({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 27, padding: '0 6px 0 10px', borderRadius: 8, background: 'var(--sec, #F4F8FC)', fontSize: 11.5, position: 'relative' }}>
      <span style={{ color: 'var(--ink-soft)' }}>{label}</span>
      {value && <b style={{ fontWeight: 700 }}>{value}</b>}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2.4" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
      >
        <option value="">Select...</option>
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </span>
  )
}
