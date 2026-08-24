'use client'

import { useState, useCallback } from 'react'
import { formatProductPrice, normalizePriceMode } from '@/lib/product-price'
import './shopfront.css'
import { useRouter } from 'next/navigation'
import { saveFollowerCounts } from './actions'
import ShopfrontPreview, { type ShopfrontData, type ShopfrontSection, type ContentItem, type BrandCollab } from './ShopfrontPreview'
import AvatarUpload from '@/components/AvatarUpload'
import { upsertStorefront, checkSlugAvailable, type StorefrontRow } from './actions'

interface Product {
  id: string
  platform: string
  handle: string
  product_type: string
  description: string | null
  price_paise: number
  is_active: boolean
}

interface Creator {
  id: string
  full_name: string
  handle: string | null
  bio: string | null
  niches: string[] | null
  profile_photo_url: string | null
  social_accounts: unknown
  worked_with: string[] | null
  is_vetted: boolean
}

const DEFAULT_SECTIONS: ShopfrontSection[] = [
  { key: 'hero', label: 'Hero', enabled: true },
  { key: 'stats', label: 'Stats Strip', enabled: true },
  { key: 'ratecard', label: 'Rate Card', enabled: true },
  { key: 'audience', label: 'Audience', enabled: true },
  { key: 'content', label: 'Content Showcase', enabled: true },
  { key: 'collabs', label: 'Past Collaborations', enabled: true },
  { key: 'pitch', label: 'Work With Me', enabled: true },
]

/* ── Editable state ───────────────────────────────────────── */

interface EditState {
  displayName: string
  bio: string
  niches: string[]
  replyTime: string
  monthlyReach: string
  repeatBrands: string
  avgDealValue: string
  ageBreakdown: { label: string; pct: number }[]
  genderWomen: number
  topLocations: { city: string; pct: number }[]
  contentItems: ContentItem[]
  brandCollabs: BrandCollab[]
}

function initEditState(creator: Creator | null, storefront: StorefrontRow | null): EditState {
  const stats = (storefront?.stats ?? {}) as Record<string, unknown>
  const workedWith = creator?.worked_with ?? []
  const storedAudience = (stats.audience ?? {}) as Record<string, unknown>
  const storedAge = (storedAudience.age_breakdown ?? null) as { label: string; pct: number }[] | null
  const storedGender = (storedAudience.gender_women ?? null) as number | null
  const storedLocations = (storedAudience.top_locations ?? null) as { city: string; pct: number }[] | null
  const storedContent = (stats.content_items ?? null) as ContentItem[] | null
  const storedCollabs = (stats.brand_collabs ?? null) as BrandCollab[] | null

  return {
    displayName: storefront?.display_name || creator?.full_name || '',
    bio: storefront?.bio || creator?.bio || '',
    niches: (storefront?.categories?.length ? storefront.categories : creator?.niches) ?? [],
    replyTime: (stats.reply_time as string) || '~4h',
    monthlyReach: (stats.monthly_reach as string) || '2.8M',
    repeatBrands: (stats.repeat_brands as string) || '68%',
    avgDealValue: (stats.avg_deal_value as string) || '₹78K',
    ageBreakdown: storedAge || [
      { label: '18–24', pct: 32 }, { label: '25–34', pct: 41 },
      { label: '35–44', pct: 18 }, { label: '45+', pct: 9 },
    ],
    genderWomen: storedGender ?? 61,
    topLocations: storedLocations || [
      { city: 'Mumbai', pct: 22 }, { city: 'Delhi', pct: 17 },
      { city: 'Bengaluru', pct: 14 }, { city: 'Pune', pct: 11 },
    ],
    contentItems: storedContent || [
      { title: 'Product review', type: 'Reel', brand: 'Brand', date: 'Jul 2026', views: '1.2M', engagement: '7.5%', saves: '28K' },
      { title: 'Day in my life', type: 'Reel', brand: 'Brand', date: 'Jun 2026', views: '800K', engagement: '6.2%', saves: '15K' },
      { title: 'Tutorial', type: 'Reel', brand: 'Brand', date: 'Jun 2026', views: '650K', engagement: '8.1%', saves: '32K' },
      { title: 'Unboxing', type: 'Story', brand: 'Brand', date: 'May 2026', views: '400K', engagement: '5.8%', saves: '10K' },
      { title: 'Get ready with me', type: 'Reel', brand: 'Brand', date: 'May 2026', views: '900K', engagement: '7.2%', saves: '22K' },
    ],
    brandCollabs: storedCollabs || workedWith.map(b => ({ name: b, type: 'Reel + Stories', views: '1.2M', engagement: '6.8%' })),
  }
}

function formatStat(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return n.toString()
}

/** Determine which sections have real content (not just defaults) */
function sectionsWithAutoHide(sections: ShopfrontSection[], edit: EditState, products: Product[], hasStorefront: boolean): ShopfrontSection[] {
  // For new creators (dummy preview), show everything
  if (!hasStorefront) return sections
  const hasContent = edit.contentItems.some(i => i.title.trim())
  const hasCollabs = edit.brandCollabs.some(c => c.name.trim())
  const hasRates = products.length > 0
  const hasAudience = edit.topLocations.some(l => l.city.trim())
  return sections.map(s => {
    if (s.key === 'content' && !hasContent) return { ...s, enabled: false }
    if (s.key === 'collabs' && !hasCollabs) return { ...s, enabled: false }
    if (s.key === 'ratecard' && !hasRates) return { ...s, enabled: false }
    if (s.key === 'audience' && !hasAudience) return { ...s, enabled: false }
    return s
  })
}

function buildShopfrontData(
  creator: Creator | null, products: Product[],
  storefront: StorefrontRow | null, sections: ShopfrontSection[], edit: EditState,
  currentSlug?: string,
): ShopfrontData {
  const handle = creator?.handle || 'creator'
  const rateCardItems = products.map(p => ({
    key: p.id, name: p.product_type, desc: p.description || '',
    pricePaise: p.price_paise, platform: p.platform, handle: p.handle,
        // Mode travels with the number so the shopfront can print "From ₹60,000"
        // and keep an on-request line out of the running total.
        priceLabel: formatProductPrice(p),
        countsToward: normalizePriceMode(p) !== 'on_request',
        approximate: normalizePriceMode(p) === 'from' || normalizePriceMode(p) === 'range',
  }))
  if (rateCardItems.length === 0) {
    rateCardItems.push(
      { key: 'reel', name: 'Instagram Reel', desc: 'Per reel, feed-posted', pricePaise: 6000000, platform: 'instagram', handle , priceLabel: formatProductPrice({ price_paise: 6000000 }), countsToward: true, approximate: false },
      { key: 'story', name: 'Instagram Story', desc: 'Per story, with link sticker', pricePaise: 2500000, platform: 'instagram', handle , priceLabel: formatProductPrice({ price_paise: 2500000 }), countsToward: true, approximate: false },
    )
  }
  const socials = (creator?.social_accounts ?? []) as Array<{ platform: string; handle: string; follower_count?: number }>
  const platforms = socials
    .filter(s => s.platform === 'instagram' || s.platform === 'youtube')
    .map(s => ({
      platform: s.platform as 'instagram' | 'youtube', handle: s.handle || handle,
      followers: s.follower_count || 0, engagement: storefront?.stats?.engagement_rate || 6.4,
      avgViews: storefront?.stats?.avg_views || 0,
      reachData: [
        { month: 'Feb', value: 210000 }, { month: 'Mar', value: 260000 },
        { month: 'Apr', value: 235000 }, { month: 'May', value: 300000 },
        { month: 'Jun', value: 355000 }, { month: 'Jul', value: 428000 },
      ],
    }))
  if (platforms.length === 0) {
    platforms.push({
      platform: 'instagram', handle,
      followers: storefront?.stats?.followers || 500000,
      engagement: storefront?.stats?.engagement_rate || 6.4,
      avgViews: storefront?.stats?.avg_views || 340000,
      reachData: [
        { month: 'Feb', value: 210000 }, { month: 'Mar', value: 260000 },
        { month: 'Apr', value: 235000 }, { month: 'May', value: 300000 },
        { month: 'Jun', value: 355000 }, { month: 'Jul', value: 428000 },
      ],
    })
  }
  const totalFollowers = storefront?.stats?.followers || platforms.reduce((s, p) => s + p.followers, 0)
  return {
    creatorName: edit.displayName || 'Creator', handle,
    bio: edit.bio || 'Creator on Guapd.',
    profilePhotoUrl: creator?.profile_photo_url,
    niches: edit.niches.length > 0 ? edit.niches : ['Creator'],
    isVerified: creator?.is_vetted ?? false, replyTime: edit.replyTime,
    totalFollowers: formatStat(totalFollowers),
    engagementRate: `${storefront?.stats?.engagement_rate || 6.4}%`,
    avgViews: formatStat(storefront?.stats?.avg_views || 340000),
    monthlyReach: edit.monthlyReach, repeatBrands: edit.repeatBrands, avgDealValue: edit.avgDealValue,
    platforms,
    audience: {
      ageBreakdown: edit.ageBreakdown,
      gender: { women: edit.genderWomen, men: 100 - edit.genderWomen },
      topLocations: edit.topLocations,
    },
    contentItems: edit.contentItems, brandCollabs: edit.brandCollabs,
    rateCardItems, sections,
    // The creator is looking at their own shopfront; the offer buttons are for
    // brands on the public page.
    hideDealCta: true,
    slug: currentSlug || storefront?.slug,
  }
}

/* ── Design tokens (matching rest of app) ─────────────────── */

const BHL = 'var(--border-hairline, #EAEAE3)' // border-hairline used throughout
const FROST = 'var(--frost-edge)'

const dinput: React.CSSProperties = {
  outline: 'none', border: `1.5px solid #D3DBE6`, background: 'var(--card)',
  borderRadius: 12, fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink)',
  width: '100%', height: 46, padding: '0 14px',
  boxShadow: 'inset 0 1px 3px rgba(40,45,25,.07)',
  transition: 'border-color .16s ease, box-shadow .16s ease',
  boxSizing: 'border-box' as const,
}

const dinputSmall: React.CSSProperties = {
  ...dinput, height: 38, fontSize: 13, padding: '0 12px',
}

const dtextarea: React.CSSProperties = {
  ...dinput, height: 'auto', minHeight: 80, padding: 14, resize: 'vertical' as const,
  lineHeight: 1.55,
}

const metaLabel: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 9.5, lineHeight: 1.4,
  letterSpacing: '.14em', textTransform: 'uppercase' as const,
  color: 'var(--ink-faint)', marginBottom: 8,
}

const removeBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: '50%',
  border: `1px solid ${BHL}`, background: '#FFFFFF',
  color: 'var(--ink-faint)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 16, fontWeight: 500, flexShrink: 0, transition: 'color .15s',
}

// Primary action button (matches neonBtn / hot action)
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  height: 46, padding: '0 24px', borderRadius: 999,
  background: 'var(--ink)', border: 'none',
  fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13.5,
  color: '#FFFFFF', cursor: 'pointer',
}

// Secondary button (matches secondaryBtn / btn-w)
const secondBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  height: 46, padding: '0 22px', borderRadius: 999,
  background: '#FFFFFF', border: `1px solid ${BHL}`,
  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13.5,
  color: 'var(--ink)', cursor: 'pointer',
}

/* ── Accordion section ────────────────────────────────────── */

function Section({ title, subtitle, icon, defaultOpen, children }: {
  title: string; subtitle?: string; icon: React.ReactNode
  defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <div style={{
      borderRadius: 20, background: '#FFFFFF', overflow: 'hidden', marginBottom: 16,
      boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 6px 12px rgba(22,23,15,.03)',
    }}>
      <button type="button" onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
        padding: '18px 24px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
          background: 'var(--card)', border: `1px solid ${FROST}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, letterSpacing: '-0.015em', color: 'var(--ink)' }}>{title}</div>
          {subtitle && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.4 }}>{subtitle}</div>}
        </div>
        <span style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: 'var(--card)', border: `1px solid ${FROST}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transition: 'transform .25s ease', transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && <div style={{ padding: '4px 24px 24px' }}>{children}</div>}
    </div>
  )
}

/* ── Reusable helpers ─────────────────────────────────────── */

function Field({ label, hint, children, style: s }: { label: string; hint?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ marginBottom: 18, ...s }}>
      <label style={metaLabel}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 5, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  )
}

function AddButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      ...primaryBtn, width: '100%', height: 44, borderRadius: 14,
      opacity: disabled ? 0.3 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      {label}
    </button>
  )
}

/* ── Section icons (matching sidebar icon style) ──────────── */

const IC = 'var(--ink-soft)'
const IconLink = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={IC} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
const IconUser = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={IC} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
const IconChart = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={IC} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
const IconUsers = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={IC} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
const IconFilm = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={IC} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" /></svg>
const IconHandshake = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={IC} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17 2 2a1 1 0 1 0 3-3" /><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88" /><path d="m11 17-2-2a1 1 0 1 0-3 3" /><path d="m10 14-2.5-2.5a1 1 0 1 0-3 3l3.88 3.88a3 3 0 0 0 4.24 0l.88-.88" /><path d="M7 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2H7V4Z" /></svg>

/* ── Content type chips ───────────────────────────────────── */

const CONTENT_TYPES = ['Reel', 'Story', 'YouTube Short', 'YouTube', 'Post'] as const

function ContentTypeChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {CONTENT_TYPES.map(t => {
        const active = value === t
        return (
          <button key={t} type="button" onClick={() => onChange(t)} style={{
            padding: '6px 14px', borderRadius: 999,
            border: `1.5px solid ${active ? 'var(--ink)' : BHL}`,
            background: active ? 'var(--ink)' : '#FFFFFF',
            fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
            color: active ? '#FFFFFF' : 'var(--ink-soft)',
            cursor: 'pointer', transition: 'all .15s',
          }}>{t}</button>
        )
      })}
    </div>
  )
}

/* ── Content card ─────────────────────────────────────────── */

function ContentCard({ item, index, total, isNew, onUpdate, onRemove, onMove }: {
  item: ContentItem; index: number; total: number; isNew?: boolean
  onUpdate: (updated: ContentItem) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const [expanded, setExpanded] = useState(isNew ?? false)
  const u = (patch: Partial<ContentItem>) => onUpdate({ ...item, ...patch })

  return (
    <div style={{
      borderRadius: 16, overflow: 'hidden',
      border: `1px solid ${expanded ? 'var(--ink)' : BHL}`,
      background: '#FFFFFF',
      boxShadow: expanded ? '0 1px 2px rgba(22,23,15,.04), 0 10px 22px rgba(22,23,15,.06)' : '0 1px 2px rgba(22,23,15,.03)',
      transition: 'border-color .2s, box-shadow .2s',
    }}>
      {/* Collapsed row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
        cursor: 'pointer',
      }} onClick={() => setExpanded(!expanded)}>
        <span style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: 'var(--card)', border: `1px solid ${FROST}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, color: 'var(--ink-soft)',
        }}>{index + 1}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--ink)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{item.title || 'Untitled piece'}</div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>
            {item.type}{item.brand ? ` \u00B7 ${item.brand}` : ''}{item.views ? ` \u00B7 ${item.views} views` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {index > 0 && (
            <button type="button" onClick={() => onMove(-1)} style={{
              width: 26, height: 26, borderRadius: '50%', border: `1px solid ${BHL}`, background: '#FFFFFF',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2.5" strokeLinecap="round"><path d="m18 15-6-6-6 6" /></svg>
            </button>
          )}
          {index < total - 1 && (
            <button type="button" onClick={() => onMove(1)} style={{
              width: 26, height: 26, borderRadius: '50%', border: `1px solid ${BHL}`, background: '#FFFFFF',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          )}
          <button type="button" onClick={onRemove} style={removeBtn}>&times;</button>
        </div>

        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2.5" strokeLinecap="round"
          style={{ transition: 'transform .25s ease', transform: expanded ? 'rotate(180deg)' : 'rotate(0)', flexShrink: 0 }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div style={{ padding: '2px 18px 20px', borderTop: `1px solid ${BHL}` }}>
          <div style={{ paddingTop: 16 }}>
            <Field label="Title">
              <input type="text" value={item.title} onChange={e => u({ title: e.target.value })}
                placeholder="What was this content about?" maxLength={200} style={dinput} />
            </Field>

            <Field label="Content type">
              <ContentTypeChip value={item.type} onChange={v => u({ type: v })} />
            </Field>

            <Field label="Content link" hint="Paste the Instagram reel, YouTube video, or any public link so brands can preview your work.">
              <div style={{
                display: 'flex', alignItems: 'center',
                border: '1.5px solid #D3DBE6', borderRadius: 12, overflow: 'hidden',
                background: 'var(--card)',
                boxShadow: 'inset 0 1px 3px rgba(40,45,25,.07)',
              }}>
                <span style={{
                  padding: '0 14px', height: 46, background: '#F4F6F2',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  borderRight: `1px solid ${BHL}`,
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </span>
                <input type="url" value={item.embedUrl || ''} onChange={e => u({ embedUrl: e.target.value })}
                  placeholder="https://www.instagram.com/reel/..."
                  style={{ flex: 1, height: 46, padding: '0 14px', fontSize: 13.5, fontFamily: 'var(--font-ui)', color: 'var(--ink)', background: 'transparent', border: 'none', outline: 'none', minWidth: 0 }} />
              </div>
            </Field>

            <div className="sf-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Brand">
                <input type="text" value={item.brand || ''} onChange={e => u({ brand: e.target.value })}
                  placeholder="Brand name" style={dinput} />
              </Field>
              <Field label="When">
                <input type="text" value={item.date || ''} onChange={e => u({ date: e.target.value })}
                  placeholder="Jul 2026" style={dinput} />
              </Field>
            </div>

            {/* Performance block */}
            <div style={{
              borderRadius: 14, padding: '16px 18px',
              background: '#F4F6F2', border: `1px solid ${BHL}`,
            }}>
              <div style={{ ...metaLabel, marginBottom: 12 }}>Performance</div>
              <div className="sf-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ ...metaLabel, marginBottom: 5, fontSize: 9 }}>Views</div>
                  <input type="text" value={item.views || ''} onChange={e => u({ views: e.target.value })}
                    placeholder="1.2M" style={{ ...dinputSmall, background: '#FFFFFF' }} />
                </div>
                <div>
                  <div style={{ ...metaLabel, marginBottom: 5, fontSize: 9 }}>Engagement</div>
                  <input type="text" value={item.engagement || ''} onChange={e => u({ engagement: e.target.value })}
                    placeholder="7.5%" style={{ ...dinputSmall, background: '#FFFFFF' }} />
                </div>
                <div>
                  <div style={{ ...metaLabel, marginBottom: 5, fontSize: 9 }}>Saves</div>
                  <input type="text" value={item.saves || ''} onChange={e => u({ saves: e.target.value })}
                    placeholder="28K" style={{ ...dinputSmall, background: '#FFFFFF' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Brand collab card ────────────────────────────────────── */

function CollabCard({ collab, index, isNew, onUpdate, onRemove }: {
  collab: BrandCollab; index: number; isNew?: boolean
  onUpdate: (updated: BrandCollab) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(isNew ?? true)
  const u = (patch: Partial<BrandCollab>) => onUpdate({ ...collab, ...patch })

  return (
    <div style={{
      borderRadius: 16, overflow: 'hidden',
      border: `1px solid ${expanded ? 'var(--ink)' : BHL}`,
      background: '#FFFFFF',
      transition: 'border-color .2s',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
        cursor: 'pointer',
      }} onClick={() => setExpanded(!expanded)}>
        <span style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: 'var(--card)', border: `1px solid ${FROST}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--ink-soft)',
        }}>{collab.name ? collab.name[0].toUpperCase() : String(index + 1)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--ink)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{collab.name || 'Brand name'}</div>
          {collab.type && <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 1 }}>{collab.type}{collab.views ? ` \u00B7 ${collab.views} views` : ''}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button type="button" onClick={onRemove} style={removeBtn}>&times;</button>
        </div>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2.5" strokeLinecap="round"
          style={{ transition: 'transform .25s ease', transform: expanded ? 'rotate(180deg)' : 'rotate(0)', flexShrink: 0 }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div style={{ padding: '2px 18px 18px', borderTop: `1px solid ${BHL}` }}>
          <div style={{ paddingTop: 14 }}>
            <Field label="Brand name">
              <input type="text" value={collab.name} onChange={e => u({ name: e.target.value })}
                placeholder="e.g. Groww, boAt, Mamaearth" style={dinput} />
            </Field>
            <div className="sf-grid-3" style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 0.8fr', gap: 10 }}>
              <Field label="What you delivered" style={{ marginBottom: 0 }}>
                <input type="text" value={collab.type || ''} onChange={e => u({ type: e.target.value })}
                  placeholder="Reel + Stories" style={dinputSmall} />
              </Field>
              <Field label="Views" style={{ marginBottom: 0 }}>
                <input type="text" value={collab.views || ''} onChange={e => u({ views: e.target.value })}
                  placeholder="1.2M" style={dinputSmall} />
              </Field>
              <Field label="Engagement" style={{ marginBottom: 0 }}>
                <input type="text" value={collab.engagement || ''} onChange={e => u({ engagement: e.target.value })}
                  placeholder="6.8%" style={dinputSmall} />
              </Field>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Main Component ───────────────────────────────────────── */

export default function StorefrontManager({
  storefront, creator, products, creatorName,
}: {
  storefront: StorefrontRow | null; creator: Creator | null
  products: Product[]; creatorName: string
}) {
  const router = useRouter()
  const isNew = storefront === null
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  // The welcome panel covers the sample shopfront it is describing, so it must
  // be dismissible. Dismissing reveals the sample; the bar that takes its place
  // keeps the edit action one tap away, so the way in is never lost.
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)
  const [sections, setSections] = useState<ShopfrontSection[]>(DEFAULT_SECTIONS)
  const [edit, setEdit] = useState<EditState>(() => initEditState(creator, storefront))


  // What the first three age bands leave for the last. Derived per render rather
  // than stored, so it cannot drift from the numbers above it. Floored at zero:
  // the inputs are clamped now, but a shopfront saved before that clamp existed
  // can still hold bands that overflow 100.
  // Follower counts, keyed per channel. Held apart from `edit` because they
  // belong to creators.social_accounts, not the storefront row — a different
  // table with a different save.
  const [followers, setFollowers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ((creator?.social_accounts ?? []) as Array<{ platform?: string; handle?: string; follower_count?: number }>)
        .filter(a => a?.handle)
        .map(a => [`${a.platform}|${a.handle}`, String(a.follower_count ?? 0)]),
    ),
  )
  const [savingFollowers, setSavingFollowers] = useState(false)

  const ageRemainder = Math.max(
    0,
    100 - (edit.ageBreakdown ?? []).slice(0, -1).reduce((t, a) => t + (a.pct || 0), 0),
  )
  const [nicheInput, setNicheInput] = useState('')
  const [newContentIdx, setNewContentIdx] = useState<number | null>(null)
  const [newCollabIdx, setNewCollabIdx] = useState<number | null>(null)

  const publishedSlug = storefront?.is_published ? storefront.slug : null
  const [slug, setSlug] = useState(storefront?.slug ?? slugFromName(creatorName))
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [slugError, setSlugError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const set = useCallback(<K extends keyof EditState>(key: K, val: EditState[K]) => {
    setEdit(prev => ({ ...prev, [key]: val }))
  }, [])

  const handleSlugChange = useCallback((val: string) => {
    const normalized = val.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setSlug(normalized)
    setSlugStatus('idle'); setSlugError(null)
    if (!normalized || normalized.length < 3) return
    if (normalized.length > 30) { setSlugStatus('invalid'); setSlugError('Max 30 characters'); return }
    const t = setTimeout(async () => {
      setSlugStatus('checking')
      const r = await checkSlugAvailable(normalized)
      setSlugStatus(r.available ? 'available' : 'taken')
      setSlugError(r.available ? null : (r.error ?? 'Not available'))
    }, 400)
    return () => clearTimeout(t)
  }, [])

  async function handleSave(publish?: boolean) {
    setSaveMsg(null); setSaving(true)
    const stats: Record<string, unknown> = {
      followers: storefront?.stats?.followers, avg_views: storefront?.stats?.avg_views,
      engagement_rate: storefront?.stats?.engagement_rate,
      monthly_reach: edit.monthlyReach, repeat_brands: edit.repeatBrands,
      avg_deal_value: edit.avgDealValue, reply_time: edit.replyTime,
      audience: { age_breakdown: edit.ageBreakdown, gender_women: edit.genderWomen, top_locations: edit.topLocations },
      content_items: edit.contentItems, brand_collabs: edit.brandCollabs,
    }
    const result = await upsertStorefront({
      slug, display_name: edit.displayName || undefined, bio: edit.bio || undefined,
      categories: edit.niches, stats, platform_links: [], content_items: [],
      show_rates: true, show_past_collabs: edit.brandCollabs.length > 0,
      is_published: publish ?? storefront?.is_published ?? false,
    })
    setSaving(false)
    if ('error' in result) { setSaveMsg({ type: 'err', text: result.error ?? 'Error saving.' }) }
    else { setSaveMsg({ type: 'ok', text: publish ? 'Published!' : 'Saved!' }); router.refresh() }
  }

  function addNiche() {
    const v = nicheInput.trim()
    if (v && !edit.niches.includes(v) && edit.niches.length < 5) {
      set('niches', [...edit.niches, v]); setNicheInput('')
    }
  }

  function addContentItem() {
    const newItem: ContentItem = { title: '', type: 'Reel', brand: '', date: '', views: '', engagement: '', saves: '', embedUrl: '' }
    const newItems = [...edit.contentItems, newItem]
    set('contentItems', newItems)
    setNewContentIdx(newItems.length - 1)
  }

  function addCollab() {
    const newCollab: BrandCollab = { name: '', type: 'Reel + Stories', views: '', engagement: '' }
    const newCollabs = [...edit.brandCollabs, newCollab]
    set('brandCollabs', newCollabs)
    setNewCollabIdx(newCollabs.length - 1)
  }

  function updateContentItem(index: number, updated: ContentItem) {
    const items = [...edit.contentItems]; items[index] = updated; set('contentItems', items)
  }

  function moveContentItem(index: number, dir: -1 | 1) {
    const items = [...edit.contentItems]
    const target = index + dir
    if (target < 0 || target >= items.length) return
    ;[items[index], items[target]] = [items[target], items[index]]
    set('contentItems', items)
  }

  function updateCollab(index: number, updated: BrandCollab) {
    const collabs = [...edit.brandCollabs]; collabs[index] = updated; set('brandCollabs', collabs)
  }

  const resolvedSections = sectionsWithAutoHide(sections, edit, products, !!storefront)
  const shopfrontData = buildShopfrontData(creator, products, storefront, resolvedSections, edit, slug)

  /* ── EDIT MODE ────────────────────────────────────────── */

  if (mode === 'edit') {
    return (
      <main style={{ flex: 1, minWidth: 0, padding: 'clamp(24px,3vw,40px) clamp(20px,4vw,48px) clamp(60px,6vw,100px)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>

          {/* ── Header (matches deals hero card) ──────── */}
          <div style={{
            borderRadius: 20, background: '#FFFFFF', padding: 28, marginBottom: 30,
            boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 6px 12px rgba(22,23,15,.03)',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(24px,2.6vw,30px)', lineHeight: 1.15, letterSpacing: '-0.02em', margin: 0, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                  Build your{' '}
                  <span style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontWeight: 400, letterSpacing: 0, fontSize: '1.12em' }}>storefront</span>
                </h1>

                {/* Icon only. The word sat beside a title that had to wrap to
                    make room for it; an eye needs no label and gives the
                    heading its line back. */}
                <button
                  onClick={() => setMode('preview')}
                  aria-label="Preview shopfront"
                  title="Preview"
                  style={{ ...secondBtn, flexShrink: 0, width: 40, height: 40, padding: 0, gap: 0, justifyContent: 'center' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                </button>
              </div>

              {/* Full width, under the title row. It was sharing the line with
                  the preview button and wrapping at half the available space. */}
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '10px 0 0' }}>
                This is how brands discover and evaluate you. Fill it in, preview it, publish when ready.
              </p>
            </div>
          </div>

          {/* ── Two-column layout ─────────────────────── */}
          <div className="sf-editor-shell" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 24, alignItems: 'start' }}>

            {/* ═══ Left column ════════════════════════════ */}
            <div>
              {/* ── URL ─────────────────────────────────── */}
              <Section title="Storefront link" subtitle="This goes in your bio, so pick something short and memorable" icon={IconLink} defaultOpen>
                <div style={{
                  display: 'flex', alignItems: 'center',
                  border: `1.5px solid ${slugStatus === 'available' ? 'var(--lime-400)' : slugStatus === 'taken' || slugStatus === 'invalid' ? 'var(--danger, #D2545A)' : '#D3DBE6'}`,
                  borderRadius: 12, padding: '0 6px 0 14px', background: 'var(--card)',
                  boxShadow: 'inset 0 1px 3px rgba(40,45,25,.07)',
                  transition: 'border-color .2s',
                }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-faint)', whiteSpace: 'nowrap', userSelect: 'none' }}>guapd.com/c/</span>
                  <input type="text" value={slug} onChange={e => handleSlugChange(e.target.value)}
                    style={{ flex: 1, padding: '13px 8px', fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em', color: 'var(--ink)', background: 'transparent', border: 'none', outline: 'none', minWidth: 0 }} />
                  {slugStatus === 'checking' && <span style={{ fontSize: 11, color: 'var(--ink-faint)', padding: '0 10px', whiteSpace: 'nowrap' }}>Checking...</span>}
                  {slugStatus === 'available' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: 'var(--lime-50)', marginRight: 4 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--lime-700)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    </span>
                  )}
                  {(slugStatus === 'taken' || slugStatus === 'invalid') && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: 'var(--danger-soft, #FFEBEB)', marginRight: 4 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--danger, #D2545A)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </span>
                  )}
                </div>
                {slugError && <p style={{ fontSize: 12.5, color: 'var(--danger, #D2545A)', marginTop: 6, fontWeight: 600 }}>{slugError}</p>}
                {publishedSlug && slug !== publishedSlug && (
                  <p style={{ fontSize: 12.5, color: 'var(--amber-700, #92600A)', marginTop: 6, lineHeight: 1.5, background: 'var(--amber-50, #FFF8E1)', border: '1px solid var(--amber-200, #FFE082)', borderRadius: 8, padding: '8px 12px' }}>
                    Changing your URL will make <strong>guapd.com/c/{publishedSlug}</strong> stop working. Update your bio and anywhere you&apos;ve shared the old link before saving.
                  </p>
                )}
              </Section>

              {/* ── Rate card ─────────────────────────────── */}
              <Section title="Rate card" subtitle="What you offer and what it costs" icon={IconUser}>
                {/* Packages are edited on their own screen because they are not
                    shopfront content — they pre-fill offers and gate the
                    dashboard checklist, and a creator can take deals without
                    ever building a shopfront. Duplicating the editor here would
                    give one table two owners. */}
                <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-soft)' }}>
                  {products.length === 0
                    ? 'Nothing priced yet. Brands need at least one package to send you an offer — with or without a shopfront.'
                    : `${products.length} package${products.length === 1 ? '' : 's'} across your channels.`}
                </p>
                <a
                  href="/creator/packages?from=shopfront"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    minHeight: 40, padding: '0 16px', borderRadius: 999,
                    background: products.length === 0 ? 'var(--neon)' : '#fff',
                    border: products.length === 0 ? 'none' : `1px solid ${BHL}`,
                    color: products.length === 0 ? 'var(--lime-950)' : 'var(--ink)',
                    fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  {products.length === 0 ? 'Set your packages' : 'Manage packages'}
                </a>
              </Section>

              {/* ── About you ─────────────────────────────── */}
              <Section title="About you" subtitle="Photo, name, bio, and what you create" icon={IconUser} defaultOpen>
                {/* The photo is the largest thing on the published shopfront —
                    a 4/5 card beside the name — so it belongs in the editor
                    that builds it, not only on a settings screen two taps away.
                    Uploading refreshes the route, so the preview updates. */}
                <Field label="Profile photo" hint="Shown at the top of your shopfront. Brands see this first.">
                  <AvatarUpload currentUrl={creator?.profile_photo_url ?? null} name={edit.displayName || creator?.full_name || ''} />
                </Field>
                <Field label="Display name">
                  <input type="text" value={edit.displayName} onChange={e => set('displayName', e.target.value)} placeholder="How brands will see your name" maxLength={100} style={dinput} />
                </Field>
                <Field label="Bio" hint="One or two lines telling brands what you bring to the table.">
                  <textarea value={edit.bio} onChange={e => set('bio', e.target.value)} placeholder="Everyday money, style and slow travel for a young Indian audience that actually buys." maxLength={500} rows={3} style={dtextarea} />
                </Field>
                <Field label="Reply time" hint="How fast you typically come back to a brand. Brands read this as a signal of how you work.">
                  <input type="text" value={edit.replyTime} onChange={e => set('replyTime', e.target.value)} placeholder="~4h" maxLength={20} style={dinput} />
                </Field>
                <Field label="Your niches" hint={edit.niches.length < 5 ? 'Type and press Enter or click Add. Up to 5.' : undefined}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: edit.niches.length > 0 ? 12 : 0 }}>
                    {edit.niches.map(n => (
                      <span key={n} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        padding: '5px 11px', borderRadius: 999,
                        background: '#FAFAF7', border: `1px solid ${BHL}`,
                        fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--ink)',
                      }}>
                        {n}
                        <button onClick={() => set('niches', edit.niches.filter(x => x !== n))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 16, lineHeight: 1, padding: 0 }}>&times;</button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" value={nicheInput} onChange={e => setNicheInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNiche() } }}
                      placeholder={edit.niches.length >= 5 ? 'Max 5 niches' : 'e.g. Personal finance'} maxLength={30}
                      disabled={edit.niches.length >= 5} style={dinput} />
                    <button onClick={addNiche} disabled={!nicheInput.trim() || edit.niches.length >= 5}
                      style={{
                        ...primaryBtn, height: 46, padding: '0 20px', borderRadius: 12, flexShrink: 0,
                        opacity: !nicheInput.trim() || edit.niches.length >= 5 ? 0.25 : 1,
                        cursor: !nicheInput.trim() || edit.niches.length >= 5 ? 'not-allowed' : 'pointer',
                      }}>
                      Add
                    </button>
                  </div>
                </Field>
              </Section>

              {/* ── Content showcase ───────────────────────── */}
              <Section title="Content showcase" subtitle="Your best work. Brands expand each piece to see the stats" icon={IconFilm}>
                <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink-soft)', margin: '0 0 16px', lineHeight: 1.6 }}>
                  Add your top-performing content. Tap a piece to fill in details and paste the reel or video link.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {edit.contentItems.map((item, i) => (
                    <ContentCard
                      key={i} item={item} index={i} total={edit.contentItems.length}
                      isNew={newContentIdx === i}
                      onUpdate={updated => { updateContentItem(i, updated); if (newContentIdx === i) setNewContentIdx(null) }}
                      onRemove={() => { set('contentItems', edit.contentItems.filter((_, j) => j !== i)); setNewContentIdx(null) }}
                      onMove={dir => moveContentItem(i, dir)}
                    />
                  ))}
                </div>

                <div style={{ marginTop: 14 }}>
                  <AddButton label="Add content piece" onClick={addContentItem} disabled={edit.contentItems.length >= 8} />
                </div>
                {edit.contentItems.length >= 8 && (
                  <div style={{ fontSize: 12, color: 'var(--ink-faint)', textAlign: 'center', marginTop: 8 }}>Maximum 8 pieces. Remove one to add another.</div>
                )}
              </Section>

              {/* ── Past collabs ───────────────────────────── */}
              <Section title="Past collaborations" subtitle="Brands you've delivered for. They scroll as a marquee on your page" icon={IconHandshake}>
                <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink-soft)', margin: '0 0 16px', lineHeight: 1.6 }}>
                  Add the brands you&apos;ve worked with. Visiting brands see your track record at a glance.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {edit.brandCollabs.map((collab, i) => (
                    <CollabCard
                      key={i} collab={collab} index={i}
                      isNew={newCollabIdx === i}
                      onUpdate={updated => { updateCollab(i, updated); if (newCollabIdx === i) setNewCollabIdx(null) }}
                      onRemove={() => { set('brandCollabs', edit.brandCollabs.filter((_, j) => j !== i)); setNewCollabIdx(null) }}
                    />
                  ))}
                </div>

                <div style={{ marginTop: 14 }}>
                  <AddButton label="Add brand" onClick={addCollab} disabled={edit.brandCollabs.length >= 12} />
                </div>
              </Section>
            </div>

            {/* ═══ Right column (sidebar) ═════════════════ */}
            <div style={{ position: 'sticky', top: 24 }}>
              {/* ── Highlights ──────────────────────────────── */}
              <Section title="Highlights" subtitle="Numbers brands notice first" icon={IconChart} defaultOpen>
                <Field label="Monthly reach">
                  <input type="text" value={edit.monthlyReach} onChange={e => set('monthlyReach', e.target.value)} placeholder="2.8M" style={dinput} />
                </Field>
                <Field label="Deals per month">
                  <input type="text" value={edit.repeatBrands} onChange={e => set('repeatBrands', e.target.value)} placeholder="68%" style={dinput} />
                </Field>
                <Field label="Avg deal value">
                  <input type="text" value={edit.avgDealValue} onChange={e => set('avgDealValue', e.target.value)} placeholder="₹78K" style={dinput} />
                </Field>
                <div style={{
                  padding: '10px 14px', borderRadius: 12, background: '#F4F6F2', border: `1px solid ${BHL}`,
                  fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5,
                }}>
                  Your rate card pulls from your products. <a href="/creator/deals" style={{ color: 'var(--ink)', textDecoration: 'underline', fontWeight: 600 }}>manage rates</a>.
                </div>
              </Section>

              {/* ── Audience ────────────────────────────────── */}
              <Section title="Audience" subtitle="Who follows you" icon={IconUsers}>
                <Field label="Followers" hint="Per channel. Brands see the total at the top of your shopfront.">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {((creator?.social_accounts ?? []) as Array<{ platform?: string; handle?: string }>)
                      .filter(a => a?.handle)
                      .map(a => {
                        const k = `${a.platform}|${a.handle}`
                        return (
                          <div key={k} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            borderRadius: 12, border: `1px solid ${BHL}`, padding: '10px 14px',
                          }}>
                            <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {a.platform} &middot; @{String(a.handle).replace(/^@/, '')}
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              aria-label={`Followers on ${a.platform}`}
                              value={followers[k] ?? '0'}
                              onChange={e => {
                                // Digits only, and stored as a STRING so a leading zero can
                                // be typed over rather than sticking — the same bug the age
                                // bands had.
                                const digits = e.target.value.replace(/\D/g, '').slice(0, 11)
                                setFollowers(f => ({ ...f, [k]: digits }))
                              }}
                              style={{ width: 110, textAlign: 'right', border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}
                            />
                          </div>
                        )
                      })}
                    {((creator?.social_accounts ?? []) as unknown[]).length === 0 && (
                      <p style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)' }}>
                        Add a channel on your profile first.
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={savingFollowers}
                      onClick={async () => {
                        setSavingFollowers(true)
                        const res = await saveFollowerCounts(
                          Object.entries(followers).map(([k, v]) => {
                            const [platform, handle] = k.split('|')
                            return { platform, handle, followers: parseInt(v || '0', 10) }
                          }),
                        )
                        setSavingFollowers(false)
                        setSaveMsg(res.ok
                          ? { type: 'ok', text: 'Follower counts saved.' }
                          : { type: 'err', text: res.message })
                      }}
                      style={{ ...secondBtn, alignSelf: 'flex-start' }}
                    >
                      {savingFollowers ? 'Saving…' : 'Save followers'}
                    </button>
                  </div>
                </Field>

                <Field label="Age breakdown">
                  <div className="sf-grid-pairs" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    {edit.ageBreakdown.map((age, i) => (
                      <div key={i} style={{
                        borderRadius: 12, border: `1px solid ${BHL}`, padding: '10px 14px',
                        background: age.pct === Math.max(...edit.ageBreakdown.map(a => a.pct))
                              ? 'color-mix(in oklab, var(--neon) 22%, #fff)'
                              : '#FFFFFF',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)', fontWeight: 500 }}>{age.label}</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                          <input
                            type="text"
                            inputMode="numeric"
                            /* The LAST band is derived, not typed. Four numbers that must total
                               100 is arithmetic homework, and the fourth is the one nobody can
                               get wrong if we do it for them. */
                            readOnly={i === edit.ageBreakdown.length - 1}
                            /* A STRING, not a number. As type="number" holding a numeric value
                               this showed "045": typing into a field containing 0 produces the
                               string "045", parseInt gives 45, and React sees its value prop
                               still 45 — so it never rewrites the DOM and the zero stays. */
                            value={i === edit.ageBreakdown.length - 1 ? String(ageRemainder) : String(age.pct)}
                            onChange={e => {
                              if (i === edit.ageBreakdown.length - 1) return
                              const digits = e.target.value.replace(/\D/g, '').slice(0, 3)
                              const typed = digits === '' ? 0 : parseInt(digits, 10)
                              /* Bounded by what the other typed bands already take, so the four
                                 can never add up to more than 100. */
                              const others = edit.ageBreakdown
                                .slice(0, -1)
                                .reduce((sum, a, k) => (k === i ? sum : sum + (a.pct || 0)), 0)
                              const u = [...edit.ageBreakdown]
                              u[i] = { ...age, pct: Math.max(0, Math.min(typed, 100 - others)) }
                              u[u.length - 1] = {
                                ...u[u.length - 1],
                                pct: Math.max(0, 100 - u.slice(0, -1).reduce((t, a) => t + (a.pct || 0), 0)),
                              }
                              set('ageBreakdown', u)
                            }}
                            style={{ width: 40, border: 'none', background: 'none', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--ink)', textAlign: 'right', outline: 'none' }} />
                          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 12, color: 'var(--ink-faint)' }}>%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Field>

                <Field label="Gender split">
                  <div style={{ padding: '14px 16px', borderRadius: 12, border: `1px solid ${BHL}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--ink)', minWidth: 34 }}>{edit.genderWomen}%</div>
                      <input type="range" min={0} max={100} value={edit.genderWomen} onChange={e => set('genderWomen', parseInt(e.target.value))}
                        style={{ flex: 1, accentColor: 'var(--lime-400)', height: 6 }} />
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--ink)', minWidth: 34, textAlign: 'right' }}>{100 - edit.genderWomen}%</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-faint)', marginTop: 6, padding: '0 2px' }}>
                      <span>Women</span><span>Men</span>
                    </div>
                  </div>
                </Field>

                <Field label="Top locations">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {edit.topLocations.map((loc, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="text" value={loc.city} onChange={e => {
                          const u = [...edit.topLocations]; u[i] = { ...loc, city: e.target.value }; set('topLocations', u)
                        }} placeholder="City" style={{ ...dinputSmall, flex: 1 }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <input type="number" value={loc.pct} min={0} max={100} onChange={e => {
                            const u = [...edit.topLocations]; u[i] = { ...loc, pct: parseInt(e.target.value) || 0 }; set('topLocations', u)
                          }} style={{ ...dinputSmall, width: 50, textAlign: 'center' }} />
                          <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>%</span>
                        </div>
                        <button onClick={() => set('topLocations', edit.topLocations.filter((_, j) => j !== i))} style={removeBtn}>&times;</button>
                      </div>
                    ))}
                  </div>
                  {edit.topLocations.length < 6 && (
                    <div style={{ marginTop: 10 }}>
                      <AddButton label="Add city" onClick={() => set('topLocations', [...edit.topLocations, { city: '', pct: 0 }])} />
                    </div>
                  )}
                </Field>
              </Section>
            </div>

          </div>

          {/* ── Sticky save bar ───────────────────────────── */}
          {saveMsg && (
            <div style={{
              maxWidth: 1080, margin: '0 auto 14px',
              padding: '12px 18px', borderRadius: 14, fontSize: 13.5, fontWeight: 600,
              background: saveMsg.type === 'ok' ? 'color-mix(in oklab, var(--neon) 14%, var(--card))' : 'var(--danger-soft, #FFEBEB)',
              color: saveMsg.type === 'ok' ? 'var(--ink)' : 'var(--danger, #dc2626)',
              border: `1.5px solid ${saveMsg.type === 'ok' ? 'var(--neon-deep)' : 'var(--danger, #D2545A)'}`,
            }}>{saveMsg.text}</div>
          )}
          <div style={{
            position: 'sticky', bottom: 20, zIndex: 50, maxWidth: 1080, margin: '0 auto',
            display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center',
            padding: '14px 24px', borderRadius: 999,
            background: '#FFFFFF', border: `1px solid ${BHL}`,
            boxShadow: '0 1px 2px rgba(22,23,15,.04), 0 10px 22px rgba(22,23,15,.06), 0 40px 72px rgba(22,23,15,.07)',
          }}>
            <span style={{ ...metaLabel, marginRight: 'auto', marginBottom: 0 }}>
              {storefront?.is_published ? 'PUBLISHED' : 'DRAFT'}{saving ? ' \u00B7 SAVING...' : ''}
            </span>
            <button onClick={() => handleSave(false)} disabled={saving || !slug || slug.length < 3}
              style={{ ...secondBtn, opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
              Save draft
            </button>
            <button onClick={() => { handleSave(true) }} disabled={saving || !slug || slug.length < 3 || slugStatus === 'taken'}
              style={{
                ...primaryBtn,
                background: 'var(--neon)', color: 'var(--ink)',
                fontWeight: 800,
                boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
                opacity: (saving || !slug || slug.length < 3 || slugStatus === 'taken') ? 0.4 : 1,
              }}>
              Publish
            </button>
          </div>

          <div style={{ height: 40 }} />
        </div>
      </main>
    )
  }

  /* ── PREVIEW MODE ─────────────────────────────────────── */

  return (
    <div style={{ position: 'relative' }}>
      {isNew && !welcomeDismissed ? (
        /* ── Welcome CTA for new creators ────────────────── */
        <div className="sf-welcome-sheet" style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
          background: 'linear-gradient(to top, rgba(255,255,255,1) 60%, rgba(255,255,255,0))',
          padding: '80px 24px 40px', display: 'flex', justifyContent: 'center',
        }}>
          <div className="sf-welcome-card" style={{
            maxWidth: 520, width: '100%', textAlign: 'center',
            background: '#FFFFFF', borderRadius: 24, padding: '36px 32px 32px',
            boxShadow: '0 4px 12px rgba(22,23,15,.06), 0 20px 48px rgba(22,23,15,.1)',
            border: `1px solid ${BHL}`,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', margin: '0 auto 18px',
              background: 'color-mix(in oklab, var(--neon) 14%, var(--card))',
              border: '1.5px solid var(--neon-deep)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
            </div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(22px,3vw,28px)',
              letterSpacing: '-0.025em', color: 'var(--ink)', margin: '0 0 10px', lineHeight: 1.15,
            }}>
              Your{' '}
              <span style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontWeight: 400, letterSpacing: 0, fontSize: '1.08em' }}>storefront</span>
            </h2>
            <p style={{
              fontFamily: 'var(--font-ui)', fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-soft)',
              margin: '0 0 24px', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto',
            }}>
              This is the page brands see when they want to work with you: your rates, your best content, your audience, all in one place. Share the link in your bio and let brands come to you.
            </p>
            <button onClick={() => setMode('edit')} style={{
              ...primaryBtn,
              background: 'var(--neon)', color: 'var(--ink)', fontWeight: 800,
              fontSize: 15, height: 52, padding: '0 36px',
              boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
            }}>
              Make it yours
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
            </button>
            {/* The panel covers the very thing it is describing. This lets a
                creator look before deciding, and the bar that replaces it keeps
                the edit action one tap away. */}
            <button
              type="button"
              onClick={() => setWelcomeDismissed(true)}
              style={{
                display: 'block', margin: '14px auto 0', padding: '10px 20px',
                border: 'none', background: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 600,
                color: 'var(--ink-soft)', textDecoration: 'underline', textUnderlineOffset: 3,
              }}
            >
              Okay, let me look around first
            </button>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)', margin: '14px 0 0', lineHeight: 1.5 }}>
              What you see below is a sample. Replace the numbers with yours.
            </p>
          </div>
        </div>
      ) : (
        /* ── Returning creator bar ───────────────────────── */
        <div className="sf-status-bar" style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--ink)', borderRadius: 999, padding: '8px 10px 8px 20px',
          boxShadow: '0 16px 40px -12px rgba(0,0,0,.4)',
        }}>
          <span style={{ ...metaLabel, color: 'rgba(255,255,255,.5)', marginBottom: 0 }}>
            {storefront?.is_published ? 'PUBLISHED' : 'DRAFT'}
          </span>
          <button onClick={() => setMode('edit')} style={{
            ...secondBtn, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', color: '#fff',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
            Edit
          </button>
          <button onClick={() => setMode('edit')} style={{
            ...primaryBtn, background: 'var(--neon)', color: 'var(--ink)', fontWeight: 800,
            boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
          }}>
            Publish
          </button>
        </div>
      )}
      <ShopfrontPreview data={shopfrontData} editing={false} />
    </div>
  )
}

function slugFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
}
