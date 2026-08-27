'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { formatProductPrice, normalizePriceMode } from '@/lib/product-price'
import './shopfront.css'
import { useRouter } from 'next/navigation'
import { saveChannelStats, createContentUploadUrl } from './actions'
import { PackageForm, AddonRatesEditor, RevisionPolicyEditor, type PackageRow, type AddonRateRow } from '@/app/creator/packages/PackagesClient'
import '@/app/creator/packages/packages.css'
import ShopfrontPreview, { type ShopfrontData, type ShopfrontSection, type ContentItem, type BrandCollab } from './ShopfrontPreview'
import AvatarUpload from '@/components/AvatarUpload'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { upsertStorefront, checkSlugAvailable, type StorefrontRow } from './actions'

interface Product {
  id: string
  platform: string
  handle: string
  product_type: string
  description: string | null
  price_paise: number
  /* Carried so the shared PackageForm can edit a package from here without a
     second, narrower idea of what a package is. */
  price_mode?: string | null
  price_max_paise?: number | null
  display_price?: boolean | null
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
    // EMPTY when unset, never a sample figure. These were seeded with '2.8M',
    // '68%' and '₹78K', which are initial VALUES rather than placeholders: the
    // field is then never empty, the placeholder never renders, and a creator
    // who never opens Highlights publishes those numbers as their own. Brands
    // price against these. The public page already renders '-' for a blank.
    replyTime: (stats.reply_time as string) || '',
    monthlyReach: (stats.monthly_reach as string) || '',
    repeatBrands: (stats.repeat_brands as string) || '',
    avgDealValue: (stats.avg_deal_value as string) || '',
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
  // The LIVE per-channel numbers, so the preview shows what publishing would
  // actually put on the page rather than what was last saved.
  chan: Record<string, ChannelStatFields>,
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
    const socials = (creator?.social_accounts ?? []) as Array<{ platform: string; handle: string }>
    // Built from the LIVE editor state, not from what was last saved, so the
    // preview shows what publishing would actually put on the page.
    //
    // The previous version read engagement and avgViews off storefront stats and
    // fell back to 6.4 and 340,000 -- so the preview asserted numbers the creator
    // had never entered and could not edit, then the public page asserted the
    // same ones. A blank is now blank in both places.
    const num = (v?: string) => {
      const t = (v ?? '').trim()
      if (t === '') return null
      const n = parseInt(t.replace(/\D/g, ''), 10)
      return Number.isFinite(n) ? n : null
    }
    const allPlatforms = socials
      .filter(s => s.platform === 'instagram' || s.platform === 'youtube')
      .map(s => {
        const v = chan[`${s.platform}|${s.handle}`] ?? EMPTY_CHANNEL_STATS
        return {
          platform: s.platform as 'instagram' | 'youtube',
          handle: s.handle || handle,
          followers: num(v.followers),
          avgViews: num(v.avgViews),
          interactions: num(v.interactions),
          avgViewDuration: v.avgViewDuration.trim() || null,
          uploadsPerMonth: num(v.uploadsPerMonth),
          // No reachData. Six hardcoded months used to be drawn here as though
          // they were this creator's trend, identical on every storefront.
        }
      })
    const platforms = allPlatforms.filter(p => p.platform === 'instagram')
    const youtube = allPlatforms.filter(p => p.platform === 'youtube')

  return {
    creatorName: edit.displayName || 'Creator', handle,
    bio: edit.bio || 'Creator on Guapd.',
    profilePhotoUrl: creator?.profile_photo_url,
    niches: edit.niches.length > 0 ? edit.niches : ['Creator'],
    isVerified: creator?.is_vetted ?? false, replyTime: edit.replyTime,
    // Instagram leads the storefront, so the headline is ITS number, never a
    // sum across channels: adding followers to subscribers counts the same
    // person twice and mixes two units that are not the same thing.
    totalFollowers: platforms[0]?.followers != null ? formatStat(platforms[0].followers) : '',
    interactions: platforms[0]?.interactions != null ? formatStat(platforms[0].interactions) : '',
    avgViews: platforms[0]?.avgViews != null ? formatStat(platforms[0].avgViews) : '',
    monthlyReach: edit.monthlyReach, repeatBrands: edit.repeatBrands, avgDealValue: edit.avgDealValue,
    platforms,
    youtube,
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

/* The wizard's order. It deliberately no longer matches the order the sections
   are written in below: Audience sits in the sidebar column, and moving its
   markup up to reorder the wizard would drag it out of that column in the
   normal editor too. So each card carries an explicit step number instead.

   The numbers and this list have to agree — a step nobody is gated on shows a
   blank screen, which is the failure mode with no error attached. Grep
   `step !==` to see all seven. */
const WIZARD_STEPS = [
  'Storefront link', 'About you', 'Audience', 'Rate card',
  'Content showcase', 'Past collaborations', 'Highlights',
] as const

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
  // Explicit box and no padding: a bare <button> carries browser padding, and
  // with the × set as TEXT its shape followed whatever font resolved — which is
  // how a round button came to look like a vertical oval. The glyph is an SVG
  // now, so nothing about the font can reach it.
  width: 28, height: 28, minWidth: 28, minHeight: 28, padding: 0, lineHeight: 1,
  boxSizing: 'border-box', borderRadius: '50%',
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

function Section({ title, subtitle, icon, defaultOpen, forceOpen, children }: {
  title: string; subtitle?: string; icon: React.ReactNode
  defaultOpen?: boolean; forceOpen?: boolean; children: React.ReactNode
}) {
  const [self, setSelf] = useState(defaultOpen ?? false)
  // In the wizard the card IS the step, so it cannot be collapsed — there would
  // be nothing else on the screen to look at.
  const open = forceOpen || self
  const setOpen = (v: boolean) => { if (!forceOpen) setSelf(v) }
  return (
    <div style={{
      borderRadius: 20, background: '#FFFFFF', overflow: 'hidden', marginBottom: 16,
      boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 6px 12px rgba(22,23,15,.03)',
    }}>
      <button type="button" onClick={() => setOpen(!open)} disabled={forceOpen} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
        padding: '18px 24px', border: 'none', background: 'none',
        cursor: forceOpen ? 'default' : 'pointer', textAlign: 'left',
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
          display: forceOpen ? 'none' : 'inline-flex', alignItems: 'center', justifyContent: 'center',
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

/* ── Cover upload for one showcase item ─────────────────────────────────────
   One component for both breakpoints. The desktop showcase and the phone one
   are two layouts of the same data, so a second uploader for phones would be a
   second thing to keep in step for no gain.
   ───────────────────────────────────────────────────────────────────── */
function ContentMediaUpload({ item, onChange }: {
  item: ContentItem
  onChange: (patch: Partial<ContentItem>) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function pick(file: File) {
    setErr(null); setBusy(true)
    try {
      // Ask the server to sign a path, then PUT straight to storage. The file
      // never touches our server: a server action buffers its entire body in
      // memory, which is why next.config caps them at 6 MB — a 50 MB clip would
      // simply be refused there, silently enough to look like "video is broken".
      const signed = await createContentUploadUrl({
        contentType: file.type,
        size: file.size,
        ext: file.name.split('.').pop(),
      })
      if ('error' in signed) { setErr(signed.error); return }

      const supabase = createBrowserClient()
      const { error } = await supabase.storage
        .from('storefronts')
        .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type })

      if (error) { setErr(error.message || 'Upload failed. Please try again.'); return }

      onChange({
        thumbnailUrl: signed.publicUrl,
        mediaKind: file.type.startsWith('video/') ? 'video' : 'image',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 62, height: 84, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
          border: `1px solid ${BHL}`, background: '#F4F6F2',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {item.thumbnailUrl ? (
            item.mediaKind === 'video' ? (
              /* muted + playsInline so the preview never grabs audio, and never
                 goes fullscreen on iOS the moment it is touched. */
              <video src={item.thumbnailUrl} muted playsInline preload="metadata"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={item.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
            </svg>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-start' }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = '' }}
          />
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}
            style={{ ...secondBtn, height: 38, opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Uploading\u2026' : item.thumbnailUrl ? 'Replace' : 'Upload photo or video'}
          </button>
          {item.thumbnailUrl && (
            <button type="button" onClick={() => onChange({ thumbnailUrl: undefined, mediaKind: undefined })}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)', textDecoration: 'underline' }}>
              Remove
            </button>
          )}
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)' }}>
            Images up to 5 MB, video up to 50 MB.
          </span>
        </div>
      </div>
      {err && <p style={{ margin: '8px 0 0', fontSize: 12.5, fontWeight: 600, color: 'var(--danger, #D2545A)' }}>{err}</p>}
    </div>
  )
}

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
          <button type="button" onClick={onRemove} style={removeBtn}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
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

              <Field label="Cover" hint="A still or a short clip. The link above is where the card goes; this is what it looks like, Instagram and YouTube will not hand us a thumbnail from a URL.">
                <ContentMediaUpload item={item} onChange={patch => u(patch)} />
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
          <button type="button" onClick={onRemove} style={removeBtn}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
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

/** Held as strings so "blank" is representable. See the state comment below. */
interface ChannelStatFields {
  followers: string
  avgViews: string
  interactions: string
  avgViewDuration: string
  uploadsPerMonth: string
}

const EMPTY_CHANNEL_STATS: ChannelStatFields = {
  followers: '', avgViews: '', interactions: '', avgViewDuration: '', uploadsPerMonth: '',
}

/**
 * What each platform is asked for.
 *
 * Instagram and YouTube are not the same question. A brand buying a YouTube
 * integration cares whether people are still watching when the mention lands,
 * which is what avg view duration answers and Instagram has no equivalent of.
 * Asking both channels the same four fields would mean asking each of them two
 * that do not apply.
 *
 * EVERY field is optional. None of this is measured -- there is no YouTube or
 * Meta integration in this codebase -- so all of it is a claim the creator
 * makes, and a blank one stays blank rather than becoming a zero.
 */
const CHANNEL_FIELDS: Record<string, { key: keyof ChannelStatFields; label: string; hint?: string; numeric: boolean }[]> = {
  instagram: [
    { key: 'followers', label: 'Followers', numeric: true },
    { key: 'avgViews', label: 'Avg views per reel', numeric: true },
    { key: 'interactions', label: 'Interactions per post', hint: 'Likes, comments and shares added up. A count, not a percentage.', numeric: true },
  ],
  youtube: [
    { key: 'followers', label: 'Subscribers', numeric: true },
    { key: 'avgViews', label: 'Avg views per video', hint: 'The number a brand is actually buying.', numeric: true },
    { key: 'avgViewDuration', label: 'Avg view duration', hint: 'e.g. 4:20. Tells a brand whether a mid-roll gets seen.', numeric: false },
    { key: 'uploadsPerMonth', label: 'Uploads per month', numeric: true },
  ],
}

/** Anything not named above still gets the basics. */
const DEFAULT_CHANNEL_FIELDS = CHANNEL_FIELDS.instagram

export default function StorefrontManager({
  storefront, creator, products, creatorName, addonRates = [], revisionPolicy,
}: {
  storefront: StorefrontRow | null; creator: Creator | null
  products: Product[]; creatorName: string
  addonRates?: AddonRateRow[]
  revisionPolicy?: { enabled: boolean; included: number; perExtraPaise: number }
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
  // All of them held as STRINGS. A number in state cannot represent "blank",
  // and blank is the whole point: nothing here is measured, so an untouched
  // field must publish nothing rather than 0.
  const [chan, setChan] = useState<Record<string, ChannelStatFields>>(() =>
    Object.fromEntries(
      ((creator?.social_accounts ?? []) as Array<Record<string, unknown>>)
        .filter(a => a?.handle)
        .map(a => [`${a.platform}|${a.handle}`, {
          followers: a.follower_count == null ? '' : String(a.follower_count),
          avgViews: a.avg_views == null ? '' : String(a.avg_views),
          interactions: a.interactions == null ? '' : String(a.interactions),
          avgViewDuration: a.avg_view_duration == null ? '' : String(a.avg_view_duration),
          uploadsPerMonth: a.uploads_per_month == null ? '' : String(a.uploads_per_month),
        }]),
    ),
  )

  const setChanField = useCallback((k: string, field: keyof ChannelStatFields, v: string) => {
    setChan(c => ({ ...c, [k]: { ...(c[k] ?? EMPTY_CHANNEL_STATS), [field]: v } }))
  }, [])

  /* Which package the shared form is open on: 'new', a row, or nothing.
     Same state shape the packages screen uses, because it is the same form. */
  const [pkgEditing, setPkgEditing] = useState<PackageRow | 'new' | null>(null)

  /* The channels the form offers, from the creator's own accounts — the same
     source the packages screen reads, normalised the same way. */
  const pkgChannels = ((creator?.social_accounts ?? []) as Array<{ platform?: string; handle?: string }>)
    .filter(a => a?.platform?.trim() && a?.handle?.trim())
    .map(a => ({
      platform: String(a.platform).trim().toLowerCase(),
      handle: String(a.handle).trim().replace(/^@/, ''),
    }))

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

  /* ── The build wizard ───────────────────────────────────────────────────────
     Until a shopfront has been published there is no shopfront — just seven
     empty cards, which is a wall, not a task. So the first pass runs as one
     card at a time in the order a brand reads them, and the accordion editor
     is what a creator comes back to afterwards.

     Keyed on is_published rather than a stored "seen the wizard" flag: the
     wizard's own end condition is publishing, so the state that ends it is the
     state that should gate it. A creator who abandons halfway resumes where the
     cards still are.
     ─────────────────────────────────────────────────────────────────────── */
  // router.refresh() is a server round-trip, so storefront.is_published stays
  // false for a beat after a successful publish. Every "are we published"
  // question in this component would answer wrong during that beat — the status
  // pill, the wizard gate, the welcome sheet — so the answer is held locally
  // the moment the server confirms it.
  const [justPublished, setJustPublished] = useState(false)
  const isPublished = (storefront?.is_published ?? false) || justPublished
  /* Everyone gets the guided edit, not just first-timers.
   *
   * This was gated on !isPublished, so a creator who already had a shopfront
   * never saw the step-by-step editor at all — the new experience shipped only
   * to people who had not used the old one.
   *
   * The opt-out is REMEMBERED. Forcing someone through seven cards every time
   * they come back to fix one line is the trap "Show all sections" exists to
   * avoid, and it is not much of an escape if it resets on the next visit. */
  const [showAll, setShowAll] = useState(false)
  useEffect(() => {
    try {
      if (localStorage.getItem('sf-editor-show-all') === '1') setShowAll(true)
    } catch {
      // Private mode, or storage disabled. The wizard is a fine default.
    }
  }, [])
  const dismissWizard = useCallback(() => {
    setShowAll(true)
    try { localStorage.setItem('sf-editor-show-all', '1') } catch { /* not worth failing over */ }
  }, [])

  const [step, setStep] = useState(0)
  const wizard = !showAll
  const lastStep = WIZARD_STEPS.length - 1
  // Step 1 is the only mandatory one: everything else on the page hangs off a
  // URL, and there is nothing to publish without one.
  const slugReady = slug.length >= 3 && slugStatus !== 'taken' && slugStatus !== 'invalid'
  const canAdvance = step !== 0 || slugReady

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

  async function handleSave(publish?: boolean): Promise<boolean> {
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
    if ('error' in result) { setSaving(false); setSaveMsg({ type: 'err', text: result.error ?? 'Error saving.' }); return false }

    // Follower counts live on creators.social_accounts, not on the storefront
    // row, so they are a SECOND write. Done here rather than behind their own
    // button: a number typed into the form and then lost because a second
    // button was never pressed is silent data loss, and nothing on screen gives
    // the creator any reason to suspect it.
    //
    // Skipped when there is nothing to write. saveChannelStats refuses
    // outright for a creator with no channels, and that refusal would then fail
    // EVERY save on this page rather than just the follower part.
    const chanEntries = Object.entries(chan)
    if (chanEntries.length > 0) {
      // null CLEARS, so emptying a field a creator no longer stands behind
      // actually removes it. '' -> null is the whole reason these are strings.
      const num = (v: string) => (v.trim() === '' ? null : parseInt(v.replace(/\D/g, '') || '0', 10))
      const fRes = await saveChannelStats(
        chanEntries.map(([k, v]) => {
          const [platform, handle] = k.split('|')
          return {
            platform, handle,
            followers: num(v.followers),
            avgViews: num(v.avgViews),
            interactions: num(v.interactions),
            uploadsPerMonth: num(v.uploadsPerMonth),
            avgViewDuration: v.avgViewDuration.trim() === '' ? null : v.avgViewDuration.trim(),
          }
        }),
      )
      if (!fRes.ok) { setSaving(false); setSaveMsg({ type: 'err', text: fRes.message }); return false }
    }

    setSaving(false)
    setSaveMsg({ type: 'ok', text: publish ? 'Published!' : 'Saved!' })
    if (publish) setJustPublished(true)
    router.refresh()
    return true
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
  const shopfrontData = buildShopfrontData(creator, products, storefront, resolvedSections, edit, chan, slug)

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

          {/* ── Wizard progress ───────────────────────── */}
          {wizard && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 9 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
                  Step {step + 1} of {WIZARD_STEPS.length} &middot; {WIZARD_STEPS[step]}
                </span>
                {/* Seven forced steps to change one line is a trap, not focus.
                    The way out is quiet, but it is there. */}
                <button
                  type="button"
                  onClick={dismissWizard}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-faint)', textDecoration: 'underline' }}
                >
                  Show all sections
                </button>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'rgba(24,28,36,.08)', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.round(((step + 1) / WIZARD_STEPS.length) * 100)}%`,
                  height: '100%', borderRadius: 999,
                  background: 'var(--neon-deep, #C9EB3C)',
                  transition: 'width .3s cubic-bezier(.4,0,.2,1)',
                }} />
              </div>
            </div>
          )}

          {/* ── Two-column layout ─────────────────────── */}
          {/* The sidebar is a place to park two small sections, not a second
              thing to read. While the wizard runs there is one card on screen,
              so the second track would only ever be an empty column. */}
          <div className="sf-editor-shell" style={{ display: 'grid', gridTemplateColumns: wizard ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 340px', gap: 24, alignItems: 'start' }}>

            {/* ═══ Left column ════════════════════════════ */}
            <div>
              {/* ── URL ─────────────────────────────────── */}
              <div style={{ display: wizard && step !== 0 ? 'none' : undefined }}>
                <Section forceOpen={wizard} title="Storefront link" subtitle="This goes in your bio, so pick something short and memorable" icon={IconLink} defaultOpen>
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
              </div>

              {/* ── About you ─────────────────────────────── */}
              <div style={{ display: wizard && step !== 1 ? 'none' : undefined }}>
                <Section forceOpen={wizard} title="About you" subtitle="Photo, name, bio, and what you create" icon={IconUser} defaultOpen>
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
              </div>

              <div style={{ display: wizard && step !== 2 ? 'none' : undefined }}>
                <Section forceOpen={wizard} title="Audience" subtitle="Who follows you" icon={IconUsers}>
                  <Field label="Your numbers" hint="Per channel, and all optional. Leave anything you cannot back up blank; a blank is simply not shown.">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {((creator?.social_accounts ?? []) as Array<{ platform?: string; handle?: string }>)
                        .filter(a => a?.handle)
                        .map(a => {
                          const k = `${a.platform}|${a.handle}`
                          const plat = String(a.platform ?? '').trim().toLowerCase()
                          const fields = CHANNEL_FIELDS[plat] ?? DEFAULT_CHANNEL_FIELDS
                          const vals = chan[k] ?? EMPTY_CHANNEL_STATS
                          return (
                            <div key={k} style={{ borderRadius: 12, border: `1px solid ${BHL}`, padding: '12px 14px' }}>
                              <div style={{
                                fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 700,
                                color: 'var(--ink)', marginBottom: 10,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {plat.charAt(0).toUpperCase() + plat.slice(1)} &middot; @{String(a.handle).replace(/^@/, '')}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {fields.map(f => (
                                  <div key={f.key}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                      <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)' }}>
                                        {f.label}
                                      </span>
                                      <input
                                        type="text"
                                        inputMode={f.numeric ? 'numeric' : 'text'}
                                        aria-label={`${f.label} on ${plat}`}
                                        placeholder={f.numeric ? 'e.g. 12400' : 'e.g. 4:20'}
                                        value={vals[f.key]}
                                        onChange={e => {
                                          // Digits only for counts, and kept as a STRING so a
                                          // leading zero can be typed over rather than sticking,
                                          // the same bug the age bands had. Duration is free text
                                          // because "4:20" is how a creator reads a watch time.
                                          const v = f.numeric
                                            ? e.target.value.replace(/\D/g, '').slice(0, 11).replace(/^0+(?=\d)/, '')
                                            : e.target.value.slice(0, 12)
                                          setChanField(k, f.key, v)
                                        }}
                                        // A VISIBLE field. This inherited the
                                        // borderless style from the old followers
                                        // row, which worked only because that value
                                        // was always populated with "0". Blank, right
                                        // aligned and borderless, it reads as static
                                        // text and nobody can tell it is typeable.
                                        style={{
                                          width: 130, textAlign: 'right',
                                          height: 38, padding: '0 12px',
                                          borderRadius: 10, border: `1px solid ${BHL}`,
                                          background: '#fff', outline: 'none',
                                          fontFamily: 'var(--font-display)', fontWeight: 800,
                                          fontSize: 15, color: 'var(--ink)',
                                        }}
                                      />
                                    </div>
                                    {f.hint && (
                                      <p style={{ margin: '3px 0 0', fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.4 }}>
                                        {f.hint}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      {((creator?.social_accounts ?? []) as unknown[]).length === 0 && (
                        <p style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)' }}>
                          Add a channel on your profile first.
                        </p>
                      )}
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
                                const digits = e.target.value.replace(/\D/g, '').slice(0, 3).replace(/^0+(?=\d)/, '')
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
                        <input
                          type="range" min={0} max={100} value={edit.genderWomen}
                          onChange={e => set('genderWomen', parseInt(e.target.value))}
                          className="sf-range"
                          // --fill drives the track gradient: a native range gives no
                          // hook for styling "the part left of the thumb".
                          style={{ flex: 1, ['--fill' as string]: `${edit.genderWomen}%` }}
                        />
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
                            <input type="text" inputMode="numeric" value={loc.pct === 0 ? '' : String(loc.pct)} placeholder="0" onChange={e => {
                              const u = [...edit.topLocations]; u[i] = { ...loc, pct: parseInt(e.target.value) || 0 }; set('topLocations', u)
                            }} style={{ ...dinputSmall, width: 50, textAlign: 'center' }} />
                            <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>%</span>
                          </div>
                          <button onClick={() => set('topLocations', edit.topLocations.filter((_, j) => j !== i))} style={removeBtn}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
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

              {/* ── Rate card ─────────────────────────────── */}
              <div style={{ display: wizard && step !== 3 ? 'none' : undefined }}>
                <Section forceOpen={wizard} title="Rate card" subtitle="What you offer and what it costs" icon={IconUser}>
                  {/* Packages are edited on their own screen because they are not
                      shopfront content — they pre-fill offers and gate the
                      dashboard checklist, and a creator can take deals without
                      ever building a shopfront. Duplicating the editor here would
                      give one table two owners. */}
                  <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-soft)' }}>
                    {products.length === 0
                      ? 'Nothing priced yet. Brands need at least one package to send you an offer, with or without a shopfront.'
                      : `${products.length} package${products.length === 1 ? '' : 's'} across your channels.`}
                  </p>
                  {/* The SAME form the packages screen uses, mounted here.
                      It was a link to that screen, so tapping it mid-edit threw away
                      everything typed since the last save. Now nobody leaves: one editor,
                      one savePackage, one creator_products table — which is what makes
                      "saved here shows up there" true by construction rather than by two
                      screens agreeing to behave the same way. */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {products.map(pr => (
                      <div key={pr.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', borderRadius: 12, border: `1px solid ${BHL}`,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{pr.product_type}</div>
                          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>
                            {pr.platform} &middot; @{String(pr.handle).replace(/^@/, '')}
                          </div>
                        </div>
                        <button type="button" onClick={() => setPkgEditing(pr as unknown as PackageRow)} style={{ ...secondBtn, height: 34 }}>
                          Edit
                        </button>
                      </div>
                    ))}
                  
                    <button
                      type="button"
                      onClick={() => setPkgEditing('new')}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                        alignSelf: 'flex-start',
                        minHeight: 40, padding: '0 16px', borderRadius: 999,
                        background: products.length === 0 ? 'var(--neon)' : '#fff',
                        border: products.length === 0 ? 'none' : `1px solid ${BHL}`,
                        color: products.length === 0 ? 'var(--lime-950)' : 'var(--ink)',
                        fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      {products.length === 0 ? 'Set your packages' : 'Add a package'}
                    </button>
                  
                    {/* The rest of the rate card: what a creator charges ON TOP of a
                        package, and how many revision rounds a deal includes. Here for the
                        same reason the packages moved — this step should be the WHOLE rate
                        card, not the part that happens to be packages. Both are the same
                        components the packages screen uses, so there is one editor for each
                        and no second version to drift. */}
                    {pkgChannels.map(ch => (
                      <AddonRatesEditor
                        key={`${ch.platform}/${ch.handle}`}
                        platform={ch.platform}
                        handle={ch.handle}
                        initial={addonRates.find(
                          r => String(r.platform ?? '').trim().toLowerCase() === ch.platform
                            && String(r.handle ?? '').replace(/^@/, '').toLowerCase() === ch.handle.toLowerCase(),
                        )}
                      />
                    ))}
                  
                    <RevisionPolicyEditor initial={revisionPolicy} />
                  </div>
                </Section>
              </div>

              {/* ── Content showcase ───────────────────────── */}
              <div style={{ display: wizard && step !== 4 ? 'none' : undefined }}>
                <Section forceOpen={wizard} title="Content showcase" subtitle="Your best work. Brands expand each piece to see the stats" icon={IconFilm}>
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
              </div>

              {/* ── Past collabs ───────────────────────────── */}
              <div style={{ display: wizard && step !== 5 ? 'none' : undefined }}>
                <Section forceOpen={wizard} title="Past collaborations" subtitle="Brands you've delivered for. They scroll as a marquee on your page" icon={IconHandshake}>
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
            </div>

            {/* ═══ Right column (sidebar) ═════════════════ */}
            <div style={{ position: wizard ? 'static' : 'sticky', top: 24 }}>
              {/* ── Highlights ──────────────────────────────── */}
              <div style={{ display: wizard && step !== 6 ? 'none' : undefined }}>
                <Section forceOpen={wizard} title="Highlights" subtitle="Numbers brands notice first" icon={IconChart} defaultOpen>
                  <Field label="Monthly reach">
                    <input type="text" value={edit.monthlyReach} onChange={e => set('monthlyReach', e.target.value)} placeholder="2.8M" style={dinput} />
                  </Field>
                  <Field label="Deals per month">
                    <input type="text" value={edit.repeatBrands} onChange={e => set('repeatBrands', e.target.value)} placeholder="4" style={dinput} />
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
              </div>

              {/* ── Audience ────────────────────────────────── */}
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
            {/* The wizard already says where you are, in words, at the top of
                the page. A DRAFT pill down here is the same fact twice, and it
                crowds a bar that has three controls on a phone. */}
            {!wizard && (
              <span style={{ ...metaLabel, marginRight: 'auto', marginBottom: 0 }}>
                {isPublished ? 'PUBLISHED' : 'DRAFT'}{saving ? ' \u00B7 SAVING...' : ''}
              </span>
            )}

            {/* Back only exists once there is somewhere to go back to. Icon
                only: it is the one control here nobody needs a word for. */}
            {wizard && step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                disabled={saving}
                aria-label="Back a step"
                title="Back"
                style={{ ...secondBtn, marginRight: 'auto', width: 44, height: 44, padding: 0, gap: 0, justifyContent: 'center', opacity: saving ? 0.5 : 1 }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              </button>
            )}

            {/* Step 1 has no Back, so nothing is pushing the buttons right. */}
            {wizard && step === 0 && <span style={{ marginRight: 'auto' }} />}

            {/* Saving a draft mid-wizard is what makes leaving safe. */}
            <button onClick={() => handleSave(false)} disabled={saving || !slug || slug.length < 3}
              style={{ ...secondBtn, opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
              Save draft
            </button>

            {wizard && step < lastStep ? (
              <button
                // Saves on the way OUT of each step. Advancing used to be
                // setStep alone, so everything typed on a step lived only in
                // React state until someone remembered to press "Save draft".
                onClick={async () => { if (await handleSave(false)) setStep(step + 1) }}
                disabled={!canAdvance || saving}
                title={canAdvance ? undefined : 'Pick an available link first'}
                style={{
                  ...primaryBtn,
                  background: 'var(--neon)', color: 'var(--ink)', fontWeight: 800,
                  boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
                  opacity: canAdvance ? 1 : 0.4,
                  cursor: canAdvance ? 'pointer' : 'not-allowed',
                }}
              >
                Continue
              </button>
            ) : (
              <button
                onClick={async () => {
                  // Publishing IS finishing. Staying in the editor afterwards
                  // leaves someone looking at the form whose whole point was
                  // reaching the published page.
                  if (await handleSave(true)) setMode('preview')
                }}
                disabled={saving || !slug || slug.length < 3 || slugStatus === 'taken'}
                style={{
                  ...primaryBtn,
                  background: 'var(--neon)', color: 'var(--ink)',
                  fontWeight: 800,
                  boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
                  opacity: (saving || !slug || slug.length < 3 || slugStatus === 'taken') ? 0.4 : 1,
                }}>
                Publish
              </button>
            )}
          </div>

          <div style={{ height: 40 }} />
        </div>

        {/* Mounted once for the whole editor. On close we refresh so the list
            above and the preview both pick up the change without leaving. */}
        {pkgEditing && (
          <PackageForm
            channels={pkgChannels}
            existing={pkgEditing === 'new' ? null : pkgEditing}
            onClose={() => { setPkgEditing(null); router.refresh() }}
          />
        )}
      </main>
    )
  }

  /* ── PREVIEW MODE ─────────────────────────────────────── */

  return (
    <div style={{ position: 'relative' }}>
      {isNew && !welcomeDismissed && !justPublished ? (
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
            {isPublished ? 'PUBLISHED' : 'DRAFT'}
          </span>
            {/* Ghost while Publish sits beside it; once published it is the only
                action on the bar, and the only action should not look secondary. */}
            <button onClick={() => setMode('edit')} style={isPublished ? {
              ...primaryBtn, background: 'var(--neon)', color: 'var(--ink)', fontWeight: 800,
              boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
            } : {
              ...secondBtn, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', color: '#fff',
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
            Edit
          </button>
          {/* This said "Publish" and called setMode('edit') — it published
              nothing, and it said it beside a pill already reading PUBLISHED.
              A published shopfront has nothing left to publish, so the button
              is simply gone and Edit is the way back in. It reappears only for
              a draft, where it now really does publish. */}
          {!isPublished && (
            <button
              onClick={() => { handleSave(true) }}
              disabled={saving || !slug || slug.length < 3}
              style={{
                ...primaryBtn, background: 'var(--neon)', color: 'var(--ink)', fontWeight: 800,
                boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
                opacity: (saving || !slug || slug.length < 3) ? 0.4 : 1,
                cursor: (saving || !slug || slug.length < 3) ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Publishing\u2026' : 'Publish'}
            </button>
          )}
        </div>
      )}
      <ShopfrontPreview data={shopfrontData} editing={false} showMobileHeader />
    </div>
  )
}

function slugFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
}
