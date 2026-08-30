'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from 'react'
import { timeAgo } from '@/lib/instagram-outcomes'

// Imported here, not by a page: this component is the editor preview, the
// public /c/[slug] page and /browse/[id]. Rules kept in the editor's own
// stylesheet only ever reached one of the three.
import './shopfront-preview.css'
import ShopfrontMobile from './ShopfrontMobile'
import { atHandle, profileUrl } from '@/lib/handle'

/* ── Types ────────────────────────────────────────────────────── */

export interface ShopfrontSection {
  key: string
  label: string
  enabled: boolean
}

/**
 * ONE mark for the whole page, not one per number.
 *
 * A badge beside every verified figure meant a brand read "From Instagram" four
 * or five times on a single screen, which turned the thing that should carry
 * weight into visual noise. Said once, at the top, it is a claim about the page.
 *
 * Opening it answers the two questions a brand actually has: WHICH numbers came
 * from Instagram, and how current they are. Both matter for a decision to price
 * against them, and neither was answerable before.
 *
 * A native <details>, so it needs no state, works with JavaScript off, and is
 * keyboard operable without any of that being built by hand.
 */
function VerifiedPanel({ v }: { v: VerifiedMarks }) {
  const fetched: string[] = []
  if (v.followers) fetched.push('Followers')
  if (v.posts) fetched.push('Posts')
  if (v.reach) fetched.push('Monthly reach')
  if (v.interactions) fetched.push('Interactions')
  if (v.audience) fetched.push('Audience age, gender and cities')
  if (fetched.length === 0) return null

  return (
    <details className="sf-verified">
      <summary className="sf-verified__chip">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        Verified from Instagram
        <span className="sf-verified__caret" aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </summary>

      <div className="sf-verified__body">
        <p className="sf-verified__lead">
          These figures are read directly from
          {v.username ? <> <strong>@{v.username}</strong>&rsquo;s</> : ' this creator&rsquo;s'} Instagram
          account:
        </p>
        <ul className="sf-verified__list">
          {fetched.map(f => <li key={f}>{f}</li>)}
        </ul>
        <p className="sf-verified__meta">
          Refreshed every day.
          {v.fetchedAt && <> Last updated {timeAgo(v.fetchedAt)}.</>}
        </p>
        {v.adultsOnly && (
          <p className="sf-verified__meta">
            Age and gender cover followers aged 18 and over.
          </p>
        )}
        <p className="sf-verified__meta sf-verified__meta--quiet">
          Everything else on this page is entered by the creator.
        </p>
      </div>
    </details>
  )
}

/** 1234 -> 1.2K, 1200000 -> 1.2M. Whole numbers keep no decimal. */
function formatCount(n: number): string {
  if (n >= 1_000_000) { const v = n / 1_000_000; return `${v % 1 === 0 ? v : v.toFixed(1)}M` }
  if (n >= 1_000) { const v = n / 1_000; return `${v % 1 === 0 ? v : v.toFixed(1)}K` }
  return String(n)
}

export interface PlatformStat {
  platform: 'instagram' | 'youtube'
  handle: string
  /**
   * Every figure NULLABLE, and every one self-reported.
   *
   * `engagement: number` used to sit here and was rendered as a percentage that
   * nothing computed -- it fell back to a hardcoded 6.4 on every storefront. It
   * is replaced by `interactions`, a count the creator states, because a rate we
   * cannot calculate should not be shown as one.
   *
   * null means the creator did not say. The renderer omits it rather than
   * printing a zero, which would read as a measured result.
   */
  followers: number | null
  avgViews: number | null
  interactions?: number | null
  /** YouTube only: total views in the window, not an average. */
  views?: number | null
  /** YouTube only. Free text, e.g. "1.2K hours". */
  watchTime?: string | null
  /** Omitted entirely unless there is a real series. Six hardcoded months used
   *  to be drawn here, identical on every creator's page. */
  reachData?: { month: string; value: number }[]
}

export interface AudienceData {
  ageBreakdown?: { label: string; pct: number }[]
  /** `unknown` is present only on a VERIFIED split. Instagram reports a real
   *  unknown share (19% on the account this was built against) and folding it
   *  into men would overstate one and hide the other. */
  gender?: { women: number; men: number; unknown?: number }
  topLocations?: { city: string; pct: number }[]
}

/**
 * Which figures came from a connected account rather than from the creator.
 *
 * Set ONLY from an Instagram snapshot on a healthy connection. Absent means
 * everything on the page is self-reported, which is the honest default and what
 * every storefront showed before this existed.
 */
export interface VerifiedMarks {
  followers?: boolean
  audience?: boolean
  /** Reach over the last 30 days, as Instagram reported it. Separate from
   *  `audience` because a creator under 100 followers gets no demographics but
   *  still gets a reach figure. */
  reach?: boolean
  /** Posts. Always true when a snapshot exists, since /me always returns it. */
  posts?: boolean
  /** Likes, comments, shares and saves over 30 days. */
  interactions?: boolean
  /** The age and gender percentages exclude under-18s, because the shopfront
   *  has no band for them. Surfaced so it is stated, not implied. */
  adultsOnly?: boolean
  username?: string
  /** When the snapshot was taken. A brand deciding on these numbers is owed
   *  their age, not just their provenance. */
  fetchedAt?: string
}

/* ── The cover on a showcase card ────────────────────────────────────────────
   A creator can upload a still or a clip. Instagram and YouTube will not serve
   a thumbnail from a URL without their APIs, so before this a card carrying a
   link had nothing to show but a gradient.

   A clip plays in place. The card itself is a link, so the play control has to
   swallow the click — otherwise the first tap on play navigates away from the
   page instead of starting the video. It also unmutes on that first press:
   autoplay is only permitted while muted, and a creator showing work to a brand
   means the sound.
   ────────────────────────────────────────────────────────────────────────── */
export function ContentMedia({ item }: { item: ContentItem }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  if (!item.thumbnailUrl) return null

  if (item.mediaKind !== 'video') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.thumbnailUrl} alt="" className="sf-vid-media" />
  }

  return (
    <>
      <video
        ref={ref}
        /* #t=0.1 asks for a frame a tenth of a second in.
         *
         * A <video> with no poster paints NOTHING until it plays — Safari and
         * Chrome both show an empty box — so a clip in the showcase rendered as
         * a blank tile with a play button floating on it. A media fragment makes
         * the browser seek there while preloading metadata, which gives a real
         * first frame to use as the thumbnail without shipping a second file. */
        src={/#t=/.test(item.thumbnailUrl ?? '') ? item.thumbnailUrl : `${item.thumbnailUrl}#t=0.1`}
        className="sf-vid-media"
        playsInline
        loop
        muted
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <button
        type="button"
        className="sf-vplay"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={e => {
          // Both, and in this order: preventDefault stops the anchor, and
          // stopPropagation keeps the editor's own card handlers out of it.
          e.preventDefault()
          e.stopPropagation()
          const v = ref.current
          if (!v) return
          if (v.paused) {
            // Set as a property, not a JSX attribute — React does not reliably
            // reflect `muted` to the DOM node.
            v.muted = false
            void v.play()
          } else {
            v.pause()
          }
        }}
      >
        {playing ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="#E8FF66" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="#E8FF66" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
        )}
      </button>
    </>
  )
}

export interface ContentItem {
  title: string
  type: string // Reel, Story, YouTube Short, etc.
  brand?: string
  date?: string
  views?: string
  engagement?: string
  saves?: string
  thumbnailUrl?: string   // uploaded still or clip, shown ON the card
  mediaKind?: 'image' | 'video' // how to render thumbnailUrl
  embedUrl?: string       // where the card GOES when a brand taps it
}

export interface BrandCollab {
  name: string
  type?: string // "Reel + Stories", "YouTube integration", etc.
  views?: string
  engagement?: string
  logoUrl?: string
}

export interface RateCardItem {
  key: string
  name: string
  desc: string
  pricePaise: number
  /**
   * The rate as written — "₹60,000", "From ₹60,000", "₹60,000–₹90,000". Null
   * means the creator quotes on request and no figure should be shown.
   */
  priceLabel?: string | null
  /** False for on-request items: there is no number to add to a total. */
  countsToward?: boolean
  /** True for "from" and "range": pricePaise is a floor, not the price. */
  approximate?: boolean
  platform: string
  handle: string
}

export interface ShopfrontData {
  creatorName: string
  handle: string
  slug?: string
  bio: string
  profilePhotoUrl?: string | null
  niches: string[]
  isVerified: boolean
  replyTime: string
  totalFollowers: string
  /** A COUNT the creator stated, not a rate. Blank when unsaid. */
  interactions: string
  avgViews: string
  /** Posts, from the connected account only. There is no typed equivalent, so
   *  this is absent rather than blank when Instagram is not connected. */
  postsCount?: string
  // Stats strip
  monthlyReach: string
  repeatBrands: string
  avgDealValue: string
  // Platform stats
  platforms: PlatformStat[]
  verified?: VerifiedMarks
  // Audience
  audience: AudienceData
  // Content
  contentItems: ContentItem[]
  // Brand collabs
  brandCollabs: BrandCollab[]
  // Rate card
  rateCardItems: RateCardItem[]
  /**
   * Hide the offer CTAs.
   *
   * Set when a creator is looking at their OWN shopfront in the editor. "Create
   * an offer" is a brand's action; on the creator's own screen it is a button
   * that either does nothing useful or invites them to make an offer to
   * themselves. It belongs on the public page only.
   */
  hideDealCta?: boolean
  // Sections
  sections: ShopfrontSection[]
  // Availability
}

// ── Helpers ─────────────────────────────────────────────────

function formatINR(paise: number): string {
  const rupees = Math.round(paise / 100)
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  return '₹' + rupees.toLocaleString('en-IN')
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
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

/* ── Section Wrapper (stable component identity) ─────────────── */

const SectionCtx = createContext<{
  sections: ShopfrontSection[]
  editing: boolean
  isEnabled: (key: string) => boolean
  toggleSection: (key: string) => void
}>({ sections: [], editing: false, isEnabled: () => true, toggleSection: () => {} })

function SectionWrapper({ sectionKey, children }: { sectionKey: string; children: React.ReactNode }) {
  const { sections, editing, isEnabled, toggleSection } = useContext(SectionCtx)
  if (!isEnabled(sectionKey) && !editing) return null
  return (
    <div style={{ position: 'relative', opacity: isEnabled(sectionKey) ? 1 : 0.4, transition: 'opacity .2s' }}>
      {editing && (
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--card)', borderRadius: 12, padding: '6px 14px',
          boxShadow: '0 4px 12px rgba(0,0,0,.12)', border: '1px solid var(--hairline)',
        }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            {sections.find(s => s.key === sectionKey)?.label}
          </span>
          <button
            onClick={() => toggleSection(sectionKey)}
            style={{
              width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', position: 'relative',
              background: isEnabled(sectionKey) ? 'var(--neon)' : 'var(--sec-mid-2)',
              transition: 'background .15s',
            }}
          >
            <span style={{
              position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%',
              background: 'var(--card)', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
              left: isEnabled(sectionKey) ? 18 : 2, transition: 'left .15s',
            }} />
          </button>
        </div>
      )}
      {children}
    </div>
  )
}

/* ── Component ────────────────────────────────────────────────── */

export default function ShopfrontPreview({
  data,
  editing = false,
  onSectionsChange,
  dealUrl,
  onDealClick,
  showMobileHeader = false,
}: {
  data: ShopfrontData
  editing?: boolean
  onSectionsChange?: (sections: ShopfrontSection[]) => void
  /** When set, CTA buttons link to this URL (e.g. /deals/new?creator=ID) instead of in-page anchors */
  dealUrl?: string
  /** When set, CTA buttons call this with selected rate card quantities instead of navigating */
  onDealClick?: (selectedQty: Record<string, number>) => void
  /**
   * Show the phone header (back / "Shopfront" / copy link).
   *
   * Passed only by the creator's own storefront screen. The public page has no
   * app to go back to, and /browse is inside the brand shell which has its own.
   */
  showMobileHeader?: boolean
}) {
  const sections = data.sections?.length ? data.sections : DEFAULT_SECTIONS
  const isEnabled = (key: string) => sections.find(s => s.key === key)?.enabled !== false

  // Copy link state
  const [linkCopied, setLinkCopied] = useState(false)
  const copyLink = useCallback(() => {
    const url = `https://guapd.com/c/${data.slug || data.handle}`
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }, [data.slug, data.handle])

  // Rate card state
  const [qty, setQty] = useState<Record<string, number>>({})
  const setItemQty = (key: string, delta: number) => {
    setQty(prev => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) + delta) }))
  }
  /**
   * Send the brand to the rate card rather than into the deal builder.
   *
   * Both top-level CTAs called onDealClick({}) — an empty selection — so a brand
   * arrived at /deals/new with nothing chosen and had to rebuild the order they
   * had just been looking at. The packages are the point of the page; the CTA's
   * job is to get them there.
   *
   * "Proceed to create deal", at the foot of the rate card, is what moves on,
   * and it already carries the selection.
   */
  const goToPackages = useCallback(() => {
    const el = typeof document !== 'undefined' ? document.getElementById('packages') : null
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    // A shopfront with no rate card has nothing to select, so scrolling would
    // strand them. Straight through in that case.
    onDealClick?.({})
  }, [onDealClick])


  // On-request items are excluded rather than counted as zero: a total that
  // silently omits a priced line is a quote a brand would hold us to.
  const rateTotal = data.rateCardItems.reduce(
    (s, item) => item.countsToward === false ? s : s + (qty[item.key] || 0) * item.pricePaise,
    0,
  )
  // "From" the moment any selected line is a minimum or a range — the total is
  // then a floor, and printing it as an exact figure would be a quote we cannot
  // honour.
  const rateTotalIsFloor = data.rateCardItems.some(
    (item) => (qty[item.key] || 0) > 0 && item.approximate === true,
  )
  const rateHasOnRequest = data.rateCardItems.some(
    (item) => (qty[item.key] || 0) > 0 && item.countsToward === false,
  )
  const rateCount = Object.values(qty).reduce((s, n) => s + n, 0)

  // Platform tab state
  const [activePlatform, setActivePlatform] = useState<string>(data.platforms[0]?.platform || 'instagram')

  // Audience animation
  const audRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = audRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    el.classList.add('aud-ready')
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => el.classList.toggle('aud-in', e.isIntersecting))
    }, { threshold: 0.22 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const toggleSection = useCallback((key: string) => {
    if (!onSectionsChange) return
    const updated = sections.map(s => s.key === key ? { ...s, enabled: !s.enabled } : s)
    onSectionsChange(updated)
  }, [sections, onSectionsChange])

  const sectionCtx = useMemo(() => ({ sections, editing, isEnabled, toggleSection }), [sections, editing, isEnabled, toggleSection])

  const firstName = data.creatorName.split(' ')[0]

  return (
    <SectionCtx.Provider value={sectionCtx}>
    <div className="sf-root" style={{ fontFamily: 'var(--font-ui)', color: 'var(--ink)', position: 'relative', overflowX: 'hidden', minHeight: '100vh', background: '#F7F7F4' }}>
      {/* Noise overlay */}
      <div aria-hidden="true" style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 90, opacity: 0.03, mixBlendMode: 'multiply',
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='gn'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23gn)'/%3E%3C/svg%3E\")",
      }} />

      {/* ── Which rendering ──────────────────────────────────────────────
         Both are in the DOM; CSS decides which is shown, by width.

         NOT an early return. A return fires at every size, and that is
         exactly how the desktop empty states got replaced by mobile ones
         once already — the bug looked like a design change because it was
         invisible until someone opened a laptop.
         ──────────────────────────────────────────────────────────── */}
      <div className="sf-view-desktop">

      {/* ═══ 1. HERO ═══════════════════════════════════════════ */}
      <SectionWrapper sectionKey="hero">
        <section className="sf-sec" style={{ padding: 'clamp(28px,3.6vw,60px) clamp(20px,5vw,72px) clamp(20px,2.4vw,36px)' }}>
          <div className="sf-hero-border" style={{ maxWidth: 1080, margin: '0 auto' }}>
            <div className="sf-comet" />
            <div className="sf-hero-card" style={{ borderRadius: 32, background: 'var(--card)', boxShadow: '0 34px 80px -44px rgba(40,45,25,.4)', padding: 'clamp(24px,3.4vw,48px)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: 'clamp(28px,3.8vw,56px)', alignItems: 'center' }}>
                {/* Photo card */}
                <div style={{ position: 'relative' }}>
                  <div className="sfcard" style={{ borderRadius: 22, background: 'var(--card)', border: '1px solid var(--frost-edge)', boxShadow: '0 20px 46px -30px rgba(40,45,25,.42)', padding: 10, maxWidth: 440 }}>
                    {data.profilePhotoUrl ? (
                      <img src={data.profilePhotoUrl} alt={data.creatorName} style={{ width: '100%', aspectRatio: '4/5', display: 'block', borderRadius: 16, objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', aspectRatio: '4/5', borderRadius: 16, border: '1px solid var(--sec-mid-2)', background: 'linear-gradient(150deg,#F4F8FC 0%,#F7F4FB 55%,#FAFAF8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 64, color: 'var(--ink-faint)', letterSpacing: '-0.03em' }}>
                          {getInitials(data.creatorName)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div>
                  <span className="t-meta sf-hero-eyebrow" style={{ display: 'inline-block', color: 'var(--ink-faint)' }}>Creator shopfront</span>
                  <h1 className="t-display" style={{ margin: '14px 0 0', color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    {firstName}
                    {data.isVerified && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', background: 'var(--neon)', flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      </span>
                    )}
                  </h1>
                  {/* Social handles + storefront link — single row */}
                  <div className="sf-hero-handles" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }}>
                    {data.platforms.map(p => (
                      <React.Fragment key={p.platform}>
                      <a
                        href={profileUrl(p.platform, p.handle) ?? '#'}
                        target="_blank" rel="noopener noreferrer"
                        // NOT a pill. It was one, with 12px of horizontal padding
                        // and `border: 1px solid var(--frost-edge)` -- which is
                        // rgba(255,255,255,.85), invisible on a white card. So the
                        // padding indented this row past the name and the bio while
                        // the chip that justified the indent could not be seen, and
                        // the reply time beside it used 4px. One row, two treatments,
                        // neither aligned to the column.
                        //
                        // frost-edge is a glass edge meant for the mesh background;
                        // on white it reads as nothing at all.
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '5px 10px 5px 0',
                          fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
                          color: 'var(--ink-soft)', textDecoration: 'none',
                        }}
                      >
                        {p.platform === 'instagram' ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" /></svg>
                        )}
                        {atHandle(p.handle)}
                      </a>
                      </React.Fragment>
                    ))}
                    {data.replyTime && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 0', fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-faint)' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--neon-deep)', flexShrink: 0 }} />
                        Replies in {data.replyTime}
                      </span>
                    )}
                  </div>

                  {/* Bio */}
                  <p className="t-body sf-hero-bio" style={{ color: 'var(--ink-soft)', maxWidth: 440, margin: '16px 0 0' }}>{data.bio}</p>

                  {/* Niche pills */}
                  <div className="sf-hero-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                    {data.niches.map(n => (
                      <span key={n} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 13px',
                        borderRadius: 999, background: 'var(--card)', border: '1.5px solid rgba(123,163,52,.6)',
                        fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)',
                      }}>{n}</span>
                    ))}
                  </div>

                  {/* Quick stats.

                      OMITTED when blank, not rendered empty. These three were
                      unconditional, so a creator with a verified follower count
                      and no self-entered figures got one number beside two
                      label-only blocks — a page that reads as broken rather than
                      as brief. Posts comes from the connected account, so it
                      appears only when there is one. */}
                  {(() => {
                    const heroStats = [
                      { key: 'followers', value: data.totalFollowers, label: 'Total followers', verified: data.verified?.followers },
                      { key: 'posts', value: data.postsCount ?? '', label: 'Posts', verified: data.verified?.posts },
                      { key: 'interactions', value: data.interactions, label: 'Interactions', verified: false },
                      { key: 'avgViews', value: data.avgViews, label: 'Avg views', verified: false },
                    ].filter(s => s.value !== '' && s.value != null)

                    if (heroStats.length === 0) return null

                    return (
                      <>
                      {/* Once, heading the numbers it describes. */}
                      {data.verified && <VerifiedPanel v={data.verified} />}
                      <div className="sf-hero-stats" style={{ display: 'flex', flexWrap: 'wrap', gap: 26, marginTop: 24 }}>
                        {heroStats.map(s => (
                          <div key={s.key}>
                            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.03em', fontSize: 26, lineHeight: 1 }}>{s.value}</div>
                            <div className="t-meta" style={{ color: 'var(--ink-faint)', marginTop: 5 }}>
                              {s.label}
                            </div>
                          </div>
                        ))}
                      </div>
                      </>
                    )
                  })()}

                  {/* CTAs */}
                  <div className="sf-hero-ctas" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 28 }}>
                    {data.hideDealCta ? null : onDealClick ? (
                      <button onClick={goToPackages} className="g-btn-primary sf-hero-cta" style={{ width: 180, fontSize: 14, padding: '14px 20px', boxShadow: '0 12px 26px -12px rgba(40,45,25,.45)' }}>
                        Create an offer
                      </button>
                    ) : (
                      <a href={dealUrl || '#pitch'} className="g-btn-primary sf-hero-cta" style={{ textDecoration: 'none', width: 180, fontSize: 14, padding: '14px 20px', boxShadow: '0 12px 26px -12px rgba(40,45,25,.45)' }}>
                        Create an offer
                      </a>
                    )}
                    {/* Share, beside View rates.
                        The link already lives in the handles row above, but that
                        is a row of destinations — this is an action, and it
                        belongs where the other actions are. */}
                    <button
                      type="button"
                      onClick={copyLink}
                      className="sf-hero-cta-alt"
                      aria-label={linkCopied ? 'Link copied' : 'Copy shopfront link'}
                      style={{
                        fontFamily: 'var(--font-ui)',
                        fontWeight: 700, fontSize: 14,
                        color: linkCopied ? 'var(--ink)' : 'var(--ink)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                        width: 180, padding: '14px 22px',
                        border: `1px solid ${linkCopied ? 'var(--neon-deep)' : 'var(--hairline)'}`,
                        borderRadius: 999,
                        background: linkCopied ? 'color-mix(in oklab, var(--neon) 14%, var(--card))' : 'var(--card)',
                        boxShadow: '0 12px 26px -12px rgba(40,45,25,.45),inset 0 1px 0 rgba(255,255,255,.9)',
                        cursor: 'pointer',
                      }}
                    >
                      {linkCopied ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--lime-700, #4d7c0f)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="m16 6-4-4-4 4" /><path d="M12 2v13" /></svg>
                      )}
                      {linkCopied ? 'Link copied' : 'Share'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </SectionWrapper>

      {/* ═══ 2. STATS STRIP ════════════════════════════════════ */}
      <SectionWrapper sectionKey="stats">
        <section className="sf-sec" style={{ padding: 'clamp(16px,2vw,28px) clamp(20px,5vw,72px)' }}>
          <div className="sf-stats-strip" style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: 16 }}>
            {[
              { value: data.monthlyReach, label: 'Monthly reach', verified: data.verified?.reach },
              { value: data.replyTime ? `~${data.replyTime.replace('~', '')}` : '-', label: 'Replies in', verified: false },
              { value: data.repeatBrands, label: 'Deals per month', verified: false },
              { value: data.avgDealValue, label: 'Avg deal value', verified: false },
            ].map((stat, i) => (
              <div key={i} style={{
                position: 'relative', borderRadius: 20, background: 'var(--card)', padding: '22px 24px',
                boxShadow: '0 20px 46px -30px rgba(40,45,25,.4)',
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.03em', fontSize: 34, lineHeight: 1 }}>{stat.value}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--sec-ink)' }} />
                  <span className="t-meta" style={{ color: 'var(--ink-soft)' }}>{stat.label}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </SectionWrapper>

      {/* ═══ 3. RATE CARD ══════════════════════════════════════ */}
      <SectionWrapper sectionKey="ratecard">
        <section id="packages" className="sf-sec" style={{ padding: 'clamp(28px,3.4vw,44px) clamp(20px,5vw,72px) clamp(32px,3.6vw,48px)' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <span className="t-meta" style={{ display: 'inline-block', color: 'var(--ink-faint)' }}>Rate card</span>
                <h2 className="t-title sf-h-deal" style={{ margin: '10px 0 6px' }}>Build your deal</h2>
                <p className="t-body sf-nowrap-desktop" style={{ color: 'var(--ink-soft)', whiteSpace: 'nowrap', margin: '0 0 clamp(16px,2vw,22px)' }}>
                  Add what you need at {firstName}&apos;s set rates. The total updates as you go.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0, marginBottom: 'clamp(16px,2vw,22px)' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)', fontSize: 15, opacity: 0.5 }}>guapd</span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>verified rates</span>
              </div>
            </div>

            <div style={{
              border: '1px solid var(--hairline)', borderRadius: 24, background: 'var(--card)',
              boxShadow: '0 30px 66px -40px rgba(40,45,25,.4),inset 0 1px 0 rgba(255,255,255,.9)',
              padding: 'clamp(10px,1.4vw,18px) clamp(20px,2.6vw,30px) clamp(20px,2.4vw,26px)',
            }}>
              {data.rateCardItems.map((item, i) => {
                const q = qty[item.key] || 0
                return (
                  <div key={item.key} className="sf-rate-row" style={{
                    display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) 110px auto',
                    alignItems: 'center', gap: 20, padding: '20px 0',
                    borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
                    background: q > 0 ? 'rgba(232,255,102,.14)' : 'transparent',
                    borderRadius: 14, transition: 'background .18s ease',
                  }}>
                    {/* Platform icon */}
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 14, background: 'var(--card)', border: '1px solid var(--frost-edge)', boxShadow: '0 8px 18px -12px rgba(40,45,25,.35)' }}>
                      {item.platform === 'instagram' ? (
                        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><line x1="17.5" y1="6.5" x2="17.5" y2="6.5" /></svg>
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 8.5a3 3 0 0 0-2.1-2.1C18 5.8 12 5.8 12 5.8s-6 0-7.9.6A3 3 0 0 0 2 8.5 31 31 0 0 0 1.6 12 31 31 0 0 0 2 15.5a3 3 0 0 0 2.1 2.1c1.9.6 7.9.6 7.9.6s6 0 7.9-.6A3 3 0 0 0 22 15.5 31 31 0 0 0 22.4 12 31 31 0 0 0 22 8.5z" /><path d="M10 15.2V8.8L15.5 12z" fill="currentColor" stroke="none" /></svg>
                      )}
                    </span>

                    {/* Name + desc */}
                    <div className="sf-rate-name" style={{ minWidth: 0 }}>
                      <div className="t-subhead">{item.name}</div>
                      <div className="t-body" style={{ color: 'var(--ink-soft)', marginTop: 4 }}>{item.desc}</div>
                    </div>

                    {/* Price */}
                    <div className="sf-rate-price" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, fontSize: 16, textAlign: 'right', color: 'var(--ink)' }}>
                      {item.priceLabel === null
                        ? <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12.5, color: 'var(--ink-faint)' }}>On request</span>
                        : (item.priceLabel ?? formatINR(item.pricePaise))}
                    </div>

                    {/* Stepper */}
                    <div className="sf-rate-stepper" style={{
                      justifySelf: 'end', display: 'inline-flex', alignItems: 'center', gap: 0,
                      background: 'var(--frost-1)', border: '1px solid var(--hairline)',
                      borderRadius: 999, padding: 5,
                    }}>
                      <button
                        onClick={() => setItemQty(item.key, -1)}
                        aria-label="Decrease quantity"
                        style={{
                          width: 30, height: 30, borderRadius: '50%', border: 'none',
                          background: 'var(--card)', color: 'var(--ink)', fontFamily: 'var(--font-ui)',
                          fontSize: 16, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 2px 6px -2px rgba(40,45,25,.3)',
                        }}
                      >−</button>
                      <span style={{
                        minWidth: 38, textAlign: 'center', fontFamily: 'var(--font-display)',
                        fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', color: 'var(--ink)',
                      }}>{q}</span>
                      <button
                        onClick={() => setItemQty(item.key, 1)}
                        aria-label="Increase quantity"
                        style={{
                          width: 30, height: 30, borderRadius: '50%', border: 'none',
                          background: 'var(--neon)', color: 'var(--lime-950)', fontFamily: 'var(--font-ui)',
                          fontSize: 16, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 2px 6px -2px rgba(180,210,60,.6)',
                        }}
                      >+</button>
                    </div>
                  </div>
                )
              })}

              {/* Total row */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
                marginTop: 14, paddingTop: 20, borderTop: '1px solid var(--hairline)',
              }}>
                <div>
                  <span className="t-meta" style={{ color: 'var(--ink-faint)' }}>Selected</span>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, fontSize: 17, color: 'var(--ink)', marginTop: 5 }}>
                    {rateCount === 0 ? 'None yet' : `${rateCount} deliverable${rateCount !== 1 ? 's' : ''} selected`}
                  </div>
                  {rateCount > 0 && (
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 6 }}>
                      {/* Stated as a floor whenever a selected line is a minimum
                          or a range, and flagged when one carries no price at
                          all. A total that reads exact when it is not is a quote
                          a brand would hold the creator to. */}
                      {rateTotal > 0 && (
                        <>
                          {rateTotalIsFloor ? 'From ' : ''}
                          <strong style={{ color: 'var(--ink)' }}>{formatINR(rateTotal)}</strong>
                        </>
                      )}
                      {rateHasOnRequest && (
                        <span style={{ color: 'var(--ink-faint)' }}>
                          {rateTotal > 0 ? ' + items priced on request' : 'Priced on request'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {data.hideDealCta ? null : onDealClick ? (
                  <button onClick={() => onDealClick(qty)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 700,
                    color: 'var(--lime-950)', background: 'var(--neon)',
                    borderRadius: 999, padding: '13px 24px',
                    boxShadow: '0 10px 24px -10px rgba(180,210,60,.9)',
                    opacity: rateTotal > 0 ? 1 : 0.45,
                    pointerEvents: rateTotal > 0 ? 'auto' : 'none',
                    transition: 'opacity .2s',
                  }}>
                    Proceed to create deal
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--lime-950)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </button>
                ) : (
                  <a href={dealUrl || '#pitch'} style={{
                    textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7,
                    fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 700,
                    color: 'var(--lime-950)', background: 'var(--neon)',
                    borderRadius: 999, padding: '13px 24px',
                    boxShadow: '0 10px 24px -10px rgba(180,210,60,.9)',
                    opacity: rateTotal > 0 ? 1 : 0.45,
                    pointerEvents: rateTotal > 0 ? 'auto' : 'none',
                    transition: 'opacity .2s',
                  }}>
                    Proceed to create deal
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--lime-950)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      </SectionWrapper>

      {/* ═══ 4. AUDIENCE ═══════════════════════════════════════ */}
      <SectionWrapper sectionKey="audience">
        <section className="sf-sec" style={{ padding: 'clamp(18px,2.2vw,28px) clamp(20px,5vw,72px) clamp(16px,2vw,28px)' }}>
          <div ref={audRef} style={{
            maxWidth: 1080, margin: '0 auto', position: 'relative', overflow: 'hidden',
            borderRadius: 28, border: '1.5px solid rgba(255,255,255,.9)',
            boxShadow: '0 30px 70px -46px rgba(40,45,25,.34)',
            background: 'linear-gradient(168deg,var(--sec) 0%,var(--sec-2) 30%,var(--card) 66%)',
            padding: 'clamp(26px,3.6vw,48px)',
          }}>
            {/* Header + tabs */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <h2 className="t-title" style={{ margin: '0 0 6px' }}>
                  {firstName}&apos;s <span className="t-accent">audience</span>

                </h2>
                <p className="t-body" style={{ color: 'var(--ink-soft)', maxWidth: 440, margin: 0 }}>
                    {data.verified?.audience
                      ? <>Pulled from Instagram{data.verified.adultsOnly ? ', covering followers aged 18 and over' : ''}.</>
                      : <>Figures {firstName} reports for each channel.</>}
                  </p>
              </div>
              {/* Only when there is something to switch BETWEEN. A tablist with one
                  tab is a control that cannot do anything, and it implies a second
                  channel the creator does not have. */}
              <div role="tablist" style={{ display: data.platforms.length > 1 ? 'inline-flex' : 'none', gap: 10, flexShrink: 0 }}>
                {data.platforms.map(p => {
                  const isActive = activePlatform === p.platform
                  return (
                    <button
                      key={p.platform}
                      type="button"
                      onClick={() => setActivePlatform(p.platform)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        fontFamily: 'var(--font-ui)', fontWeight: isActive ? 700 : 600,
                        fontSize: 13.5, color: isActive ? '#fff' : 'var(--ink-soft)',
                        background: isActive ? 'var(--ink)' : 'var(--card)',
                        border: `1px solid ${isActive ? 'var(--ink)' : 'var(--hairline)'}`,
                        borderRadius: 999, padding: '10px 20px', cursor: 'pointer',
                        transition: 'background .18s ease,color .18s ease',
                      }}
                    >
                      {p.platform === 'instagram' ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><line x1="17.5" y1="6.5" x2="17.5" y2="6.5" /></svg>
                      ) : (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 8.5a3 3 0 0 0-2.1-2.1C18 5.8 12 5.8 12 5.8s-6 0-7.9.6A3 3 0 0 0 2 8.5 31 31 0 0 0 1.6 12 31 31 0 0 0 2 15.5a3 3 0 0 0 2.1 2.1c1.9.6 7.9.6 7.9.6s6 0 7.9-.6A3 3 0 0 0 22 15.5 31 31 0 0 0 22.4 12 31 31 0 0 0 22 8.5z" /><path d="M10 15.2V8.8L15.5 12z" fill="currentColor" stroke="none" /></svg>
                      )}
                      {p.platform === 'instagram' ? 'Instagram' : 'YouTube'}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Platform cards */}
            {data.platforms.map(p => (
              <div key={p.platform} style={{
                // With one channel there is no toggle to select it, so the single
                // card must not depend on a selection having been made.
                display: data.platforms.length === 1 || activePlatform === p.platform ? 'block' : 'none',
                marginTop: 'clamp(24px,3vw,34px)',
              }}>
                <div style={{
                  background: 'var(--card)', borderRadius: 20, padding: 'clamp(20px,2.6vw,30px)',
                  boxShadow: 'inset 0 2px 7px rgba(40,45,25,.11),inset 0 0 0 1px rgba(40,45,25,.06)',
                }}>
                  {/* Platform header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, flexShrink: 0, borderRadius: 14, background: 'var(--card)', border: '1px solid var(--frost-edge)', boxShadow: '0 8px 18px -12px rgba(40,45,25,.3)' }}>
                        {p.platform === 'instagram' ? (
                          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><line x1="17.5" y1="6.5" x2="17.5" y2="6.5" /></svg>
                        ) : (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 8.5a3 3 0 0 0-2.1-2.1C18 5.8 12 5.8 12 5.8s-6 0-7.9.6A3 3 0 0 0 2 8.5 31 31 0 0 0 1.6 12 31 31 0 0 0 2 15.5a3 3 0 0 0 2.1 2.1c1.9.6 7.9.6 7.9.6s6 0 7.9-.6A3 3 0 0 0 22 15.5 31 31 0 0 0 22.4 12 31 31 0 0 0 22 8.5z" /><path d="M10 15.2V8.8L15.5 12z" fill="currentColor" stroke="none" /></svg>
                        )}
                      </span>
                      <div>
                        <div className="t-subhead" style={{ fontSize: 18 }}>{p.platform === 'instagram' ? 'Instagram' : 'YouTube'}</div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 1 }}>{atHandle(p.handle)}</div>
                      </div>
                    </div>
                    <a
                      href={profileUrl(p.platform, p.handle) ?? '#'}
                      target="_blank"
                      rel="noopener"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700,
                        color: 'var(--ink)', background: 'var(--card)',
                        border: '1px solid var(--hairline)', borderRadius: 999,
                        padding: '9px 16px', textDecoration: 'none',
                        flexShrink: 0, whiteSpace: 'nowrap',
                      }}
                    >
                      View {p.platform === 'instagram' ? 'Instagram' : 'YouTube'}
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
                    </a>
                  </div>

                      {/* ONE treatment for all of them. Followers was set at
                          clamp(36px,4vw,52px) while the rest were inline body text,
                          so the first number read as the headline and the others as
                          a caption under it, though a brand weighs all three.

                          Each appears only if the creator said it: a zero would read
                          as a measured result rather than as a blank. */}
                      {/* A GRID, not a flex row. Flex with a fixed gap packs three
                          or four stats against the left edge and leaves the rest of
                          a full-width card empty. auto-fit columns spread them
                          across whatever width there is and still wrap to two on a
                          phone.

                          The bottom margin is conditional: it existed to separate
                          these from the reach chart, and that chart only renders
                          when there is a real series. Without one, the margin was
                          reserving space for something that never arrived, which is
                          the empty band under the numbers. */}
                      <div className="sf-aud-stat" style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                        // Generous on desktop: these are the figures a brand reads
                        // first, and at clamp(16px,2vw,28px) three of them ran
                        // together as one string of digits.
                        gap: 'clamp(20px,2.6vw,44px)',
                        margin: p.reachData && p.reachData.length > 0
                          ? 'clamp(26px,3vw,36px) 0 clamp(24px,2.8vw,32px)'
                          : 'clamp(26px,3vw,36px) 0 clamp(4px,0.6vw,8px)',
                      }}>
                        {([
                          { v: p.followers, label: p.platform === 'instagram' ? 'Followers' : 'Subscribers' },
                          { v: p.interactions, label: 'Interactions' },
                          { v: p.avgViews, label: 'Avg views' },
                          { v: p.views, label: 'Views' },
                          { v: p.watchTime, label: 'Watch time' },
                        ] as { v: number | string | null | undefined; label: string }[])
                          .filter(st => st.v != null && st.v !== '')
                          .map(st => (
                            <div key={st.label}>
                              <div style={{
                                fontFamily: 'var(--font-display)', fontWeight: 800,
                                fontSize: 'clamp(28px,3vw,38px)', letterSpacing: '-0.03em',
                                lineHeight: 1, color: 'var(--ink)',
                              }}>
                                {typeof st.v === 'number' ? formatCount(st.v) : st.v}
                              </div>
                              <div className="t-meta" style={{ color: 'var(--ink-faint)', marginTop: 11 }}>
                                {st.label}
                              </div>
                            </div>
                          ))}
                      </div>

                  {/* Reach bar chart */}
                  {p.reachData && p.reachData.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 'clamp(18px,2.2vw,24px)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 'clamp(16px,2vw,22px)', flexWrap: 'wrap' }}>
                        <span className="t-meta" style={{ color: 'var(--ink-soft)' }}>Monthly {p.platform === 'instagram' ? 'reach' : 'views'}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-ui)', fontSize: 11.5, fontWeight: 700, color: 'var(--lime-950)', background: 'var(--neon)', borderRadius: 999, padding: '4px 11px', whiteSpace: 'nowrap' }}>
                          ▲ {p.platform === 'instagram' ? '104' : '121'}% 6-mo
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'clamp(6px,.8vw,10px)', height: 120 }}>
                        {(() => {
                          const max = Math.max(...p.reachData.map(d => d.value))
                          return p.reachData.map((d, i) => {
                            const isPeak = d.value === max
                            const h = Math.round(d.value / max * 88 + 6) + '%'
                            return (
                              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: isPeak ? 700 : 600, color: isPeak ? 'var(--ink)' : 'var(--ink-faint)' }}>
                                  {(d.value / 1000).toFixed(0)}K
                                </span>
                                <div className="aud-bar" style={{
                                  width: '100%', maxWidth: 44, height: h, borderRadius: 8,
                                  background: isPeak ? 'linear-gradient(180deg,var(--lime-400),var(--neon-deep))' : 'linear-gradient(180deg,var(--sec-mid),var(--sec-mid-2))',
                                  boxShadow: isPeak ? '0 10px 20px -8px rgba(180,215,50,.55)' : 'none',
                                  transformOrigin: 'bottom',
                                }} />
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10.5, color: 'var(--ink-faint)', fontWeight: 500 }}>{d.month}</span>
                              </div>
                            )
                          })
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Age + Gender + Location */}
            {(data.audience.ageBreakdown || data.audience.gender || data.audience.topLocations) && (
              <div style={{ marginTop: 'clamp(8px,1vw,14px)', paddingTop: 'clamp(14px,1.6vw,20px)', borderTop: '1px solid rgba(255,255,255,.5)' }}>
                {/* INSTAGRAM ONLY. Age, gender and cities are ONE set of demographics,
                    stored on the storefront rather than per channel. Left visible while
                    the YouTube tab is selected they read as the YouTube audience, which
                    nothing here measures.
                
                    Hidden rather than relabelled: someone on the YouTube tab should see
                    YouTube numbers or nothing, not Instagram numbers with a caveat. */}
                {(data.platforms.length < 2 || activePlatform === 'instagram') && (
                <div className="sf-aud-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)', gap: 'clamp(14px,1.8vw,20px)', alignItems: 'stretch' }}>
                  {/* Age breakdown */}
                  {data.audience.ageBreakdown && (
                    <div style={{
                      border: '1px solid var(--hairline)', borderRadius: 24, background: 'var(--card)',
                      boxShadow: '0 26px 56px -36px rgba(40,45,25,.34)', padding: 'clamp(24px,2.8vw,34px)',
                      display: 'flex', flexDirection: 'column',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--hairline)', paddingBottom: 13 }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink)' }}>Age breakdown</span>
                      </div>
                      {/* Highlight top age group */}
                      {(() => {
                        const top = data.audience.ageBreakdown!.reduce((a, b) => b.pct > a.pct ? b : a)
                        return (
                          <div style={{ margin: 'clamp(18px,2.2vw,26px) 0 clamp(20px,2.4vw,28px)' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(52px,6vw,76px)', letterSpacing: '-0.04em', lineHeight: .85, color: 'var(--ink)' }}>{top.pct}</span>
                              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(24px,2.6vw,32px)', color: 'var(--ink)' }}>%</span>
                            </div>
                            <p className="t-body" style={{ color: 'var(--ink-soft)', margin: '10px 0 0' }}>
                              are aged {top.label}, {firstName}&apos;s <span className="t-accent">core</span> buying audience.
                            </p>
                          </div>
                        )
                      })()}
                      <div style={{ marginTop: 'auto' }}>
                        {data.audience.ageBreakdown!.map((age, i) => {
                          const isTop = age.pct === Math.max(...data.audience.ageBreakdown!.map(a => a.pct))
                          return (
                            <div key={i} style={{ marginTop: i === 0 ? 0 : 14 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: isTop ? 700 : 500, color: isTop ? 'var(--ink)' : 'var(--ink-soft)' }}>{age.label}</span>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{age.pct}%</span>
                              </div>
                              <div style={{ height: 9, borderRadius: 20, background: 'rgba(120,130,150,.16)', overflow: 'hidden' }}>
                                <div className="aud-bar" style={{
                                  height: '100%', width: `${age.pct}%`, borderRadius: 20, transformOrigin: 'left',
                                  background: isTop ? 'var(--neon-deep)' : 'rgba(120,130,150,.4)',
                                }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Right column: Gender + Locations */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(14px,1.8vw,20px)', minWidth: 0 }}>
                    {/* Gender donut */}
                    {data.audience.gender && (() => {
                      const g = data.audience.gender!
                      // Instagram reports a share it cannot attribute, and on this
                      // account it is not a rounding error. A two-segment donut
                      // drew that share in the men colour, so the chart overstated
                      // men by exactly the amount nobody actually knows.
                      const unknown = g.unknown != null && g.unknown > 0 ? g.unknown : 0

                      // The centre reports the LARGER share, not always women.
                      // A donut whose middle read "29% women" while two thirds of
                      // it was the other colour made a brand do the subtraction to
                      // reach the fact the chart exists to state.
                      //
                      // Between women and men only. "Not stated" is the absence of
                      // an answer, so leading with it would headline a gap as if
                      // it were an audience.
                      const menLeads = g.men > g.women
                      const leadPct = menLeads ? g.men : g.women
                      const leadLabel = menLeads ? 'men' : 'women'

                      // The highlight follows the leader, so the emphasised colour
                      // and the number in the middle are describing the same slice.
                      const womenColor = menLeads ? 'var(--sec-mid-2)' : 'var(--neon-deep)'
                      const menColor = menLeads ? 'var(--neon-deep)' : 'var(--sec-mid-2)'

                      const gradient = unknown > 0
                        ? `conic-gradient(${womenColor} 0 ${g.women}%,${menColor} ${g.women}% ${g.women + g.men}%,var(--hairline) ${g.women + g.men}% 100%)`
                        : `conic-gradient(${womenColor} 0 ${g.women}%,${menColor} ${g.women}% 100%)`
                      return (
                      <div style={{
                        flex: '0 0 auto', border: '1px solid var(--hairline)', borderRadius: 24, background: 'var(--card)',
                        boxShadow: '0 22px 50px -34px rgba(40,45,25,.3)', padding: 'clamp(18px,2vw,22px) clamp(22px,2.4vw,28px)',
                        display: 'flex', flexDirection: 'column',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--hairline)', paddingBottom: 13 }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink)' }}>Gender</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 'auto', paddingTop: 16 }}>
                          <div className="aud-donut" style={{
                            position: 'relative', width: 'clamp(84px,22vw,112px)', height: 'clamp(84px,22vw,112px)', flexShrink: 0, borderRadius: '50%',
                            background: gradient,
                            boxShadow: '0 12px 26px -14px rgba(40,45,25,.35)',
                          } as React.CSSProperties}>
                            <div style={{
                              position: 'absolute', inset: 15, borderRadius: '50%', background: 'var(--card)',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 25, letterSpacing: '-0.02em', lineHeight: 1, color: 'var(--ink)' }}>{leadPct}%</span>
                              <span className="t-meta" style={{ color: 'var(--ink-faint)', marginTop: 3 }}>{leadLabel}</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <span style={{ width: 11, height: 11, borderRadius: 4, background: womenColor }} />
                              <div>
                                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--ink)' }}>{g.women}%</div>
                                <div className="t-meta" style={{ color: 'var(--ink-faint)' }}>Women</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <span style={{ width: 11, height: 11, borderRadius: 4, background: menColor }} />
                              <div>
                                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--ink)' }}>{g.men}%</div>
                                <div className="t-meta" style={{ color: 'var(--ink-faint)' }}>Men</div>
                              </div>
                            </div>
                            {/* Shown only when Instagram actually reports one, so a
                                typed two-way split is unchanged. */}
                            {unknown > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                <span style={{ width: 11, height: 11, borderRadius: 4, background: 'var(--hairline)' }} />
                                <div>
                                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--ink)' }}>{unknown}%</div>
                                  <div className="t-meta" style={{ color: 'var(--ink-faint)' }}>Not stated</div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      )
                    })()}

                    {/* Top locations */}
                    {data.audience.topLocations && (
                      <div style={{
                        flex: '1 1 auto', border: '1px solid var(--hairline)', borderRadius: 24, background: 'var(--card)',
                        boxShadow: '0 22px 50px -34px rgba(40,45,25,.3)', padding: 'clamp(22px,2.4vw,28px)',
                        display: 'flex', flexDirection: 'column',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--hairline)', paddingBottom: 13 }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink)' }}>Top locations</span>
                        </div>
                        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                          {data.audience.topLocations.map((loc, i) => {
                            const maxPct = Math.max(...data.audience.topLocations!.map(l => l.pct))
                            const isTop = loc.pct === maxPct
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: i === 0 ? 0 : 12 }}>
                                <span style={{ width: 76, flexShrink: 0, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink)' }}>{loc.city}</span>
                                <div style={{ flex: 1 }}>
                                  <div style={{ height: 8, borderRadius: 20, background: 'rgba(120,130,150,.16)', overflow: 'hidden' }}>
                                    <div className="aud-bar" style={{
                                      height: '100%', width: `${(loc.pct / maxPct) * 88}%`, borderRadius: 20,
                                      background: isTop ? 'var(--neon-deep)' : 'rgba(120,130,150,.4)',
                                      transformOrigin: 'left',
                                    }} />
                                  </div>
                                </div>
                                <span style={{ width: 34, textAlign: 'right', flexShrink: 0, fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{loc.pct}%</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                )}
              </div>
            )}
          </div>
        </section>
      </SectionWrapper>

      {/* ═══ 5. CONTENT SHOWCASE ═══════════════════════════════ */}
      {data.contentItems.length > 0 && (
        <SectionWrapper sectionKey="content">
          <section className="sf-sec" style={{ padding: 'clamp(30px,3.8vw,56px) clamp(20px,5vw,72px) clamp(16px,2vw,28px)' }}>
            <div style={{ maxWidth: 1080, margin: '0 auto' }}>
              <span className="t-meta" style={{ display: 'inline-block', color: 'var(--ink-faint)' }}>Recent work</span>
              <h2 className="t-title" style={{ margin: '10px 0 clamp(20px,2.4vw,30px)' }}>A look at {firstName}&apos;s content</h2>

              <div className="sf-exprow">
                {data.contentItems.slice(0, 5).map((item, i) => {
                  // A card opens its link only on the published page. Inside
                  // the editor a tap must not navigate a creator off the very
                  // thing they are editing.
                  const href = !editing && item.embedUrl ? item.embedUrl : undefined
                  const Card = (href ? 'a' : 'div') as React.ElementType
                  const cardProps = href
                    ? { href, target: '_blank', rel: 'noopener noreferrer', style: { textDecoration: 'none', color: 'inherit' } }
                    : {}
                  return (
                    <Card key={i} className="sf-exp" {...cardProps}>
                    <div className="sf-vid">
                      <ContentMedia item={item} />
                      <span style={{
                        position: 'absolute', left: 11, top: 11, zIndex: 3,
                        fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 9.5,
                        letterSpacing: '.05em', textTransform: 'uppercase',
                        background: 'rgba(255,255,255,.92)', color: 'var(--ink)',
                        borderRadius: 999, padding: '3px 9px',
                      }}>{item.type}</span>
                      {/* Decorative, hover-only. A video gets a real control
                          from ContentMedia instead, so the two never stack. */}
                      {!(item.thumbnailUrl && item.mediaKind === 'video') && (
                        <span className="sf-play">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="#E8FF66"><path d="M8 5v14l11-7z" /></svg>
                        </span>
                      )}
                      <div className="sf-vlab">{item.title}</div>
                    </div>
                    <div className="sf-side">
                      <div className="sf-side-in">
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em', lineHeight: 1.25, color: 'var(--ink)' }}>{item.title}</div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 6 }}>
                          {item.brand}{item.date ? ` · ${item.date}` : ''}
                        </div>
                        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
                          {item.views && (
                            <div className="sf-srow">
                              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Views</span>
                              <b style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{item.views}</b>
                            </div>
                          )}
                          {item.engagement && (
                            <div className="sf-srow">
                              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Interactions</span>
                              <b style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{item.engagement}</b>
                            </div>
                          )}
                          {item.saves && (
                            <div className="sf-srow">
                              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Saves</span>
                              <b style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{item.saves}</b>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                  )
                })}
              </div>
            </div>
          </section>
        </SectionWrapper>
      )}

      {/* ═══ 6. PAST COLLABORATIONS (Marquee) ══════════════════ */}
      {data.brandCollabs.length > 0 && (
        <SectionWrapper sectionKey="collabs">
          <section className="sf-sec" style={{ padding: 'clamp(30px,3.8vw,56px) 0 clamp(16px,2vw,28px)' }}>
            <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 clamp(20px,5vw,72px)' }}>
              <span className="t-meta" style={{ display: 'inline-block', color: 'var(--ink-faint)' }}>Past collaborations</span>
              <div style={{ margin: '10px 0 clamp(10px,1.3vw,16px)' }}>
                <h2 className="t-title" style={{ margin: '0 0 6px' }}>Brands {firstName} has delivered for</h2>
                <p className="t-body" style={{ color: 'var(--ink-soft)', maxWidth: 520, margin: 0 }}>Real campaigns, real numbers from brands who booked {firstName} and came back.</p>
                <div className="t-meta" style={{ color: 'var(--ink-faint)', marginTop: 12 }}>{data.brandCollabs.length} brands booked on our platform</div>
              </div>
            </div>

            <div className="sf-brandmarquee" aria-label={`Brands ${firstName} has worked with`} style={{
              position: 'relative', overflow: 'hidden',
              WebkitMask: 'linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)',
              mask: 'linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)',
              padding: '44px 0',
            }}>
              <div className="sf-brandtrack" style={{ display: 'flex', alignItems: 'center', gap: 40, width: 'max-content', padding: '0 20px' }}>
                {/* Double the items for seamless loop */}
                {[...data.brandCollabs, ...data.brandCollabs].map((brand, i) => (
                  <div
                    key={i}
                    // The second copy exists only so the marquee can loop
                    // seamlessly. It was also being read out by screen readers,
                    // announcing every brand twice, and on a phone — where this
                    // becomes a scrollable list rather than a loop — it would
                    // show every brand twice on screen as well.
                    className={`sf-btile${i >= data.brandCollabs.length ? ' sf-btile--dup' : ''}`}
                    aria-hidden={i >= data.brandCollabs.length}
                    style={{
                    flexShrink: 0, width: 280, height: 320, borderRadius: 24,
                    position: 'relative', overflow: 'hidden',
                    border: '1px solid var(--hairline)', background: 'var(--card)',
                    boxShadow: '0 24px 52px -34px rgba(40,45,25,.34)',
                    display: 'flex', flexDirection: 'column', padding: 18,
                  }}>
                    {/* Brand logo placeholder */}
                    <div style={{
                      width: '100%', height: 214, borderRadius: 18,
                      border: '1px solid var(--sec-mid-2)',
                      background: 'linear-gradient(150deg,#F4F8FC 0%,#F7F4FB 55%,#FAFAF8 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: 'var(--ink-faint)', letterSpacing: '-0.02em' }}>{brand.name}</span>
                    </div>
                    <div style={{ marginTop: 'auto', paddingTop: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                        <span className="t-subhead sf-btile-name" style={{ fontSize: 17 }}>{brand.name}</span>
                        {brand.type && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)' }}>{brand.type}</span>}
                      </div>
                      <div style={{ marginTop: 9, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)' }}>
                        {brand.views && <><span style={{ fontWeight: 700, color: 'var(--ink)' }}>{brand.views}</span> views</>}
                        {brand.views && brand.engagement && ' · '}
                        {brand.engagement && <><span style={{ fontWeight: 700, color: 'var(--ink)' }}>{brand.engagement}</span> engagement</>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </SectionWrapper>
      )}

      {/* ═══ 7. PITCH / CTA SECTION ════════════════════════════ */}
      <SectionWrapper sectionKey="pitch">
        <section className="sf-sec" style={{ padding: 'clamp(30px,3.8vw,56px) clamp(20px,5vw,72px) clamp(40px,4.5vw,68px)' }}>
          <div style={{
            maxWidth: 1080, margin: '0 auto', borderRadius: 28, overflow: 'hidden',
            background: 'radial-gradient(680px 460px at 12% 6%, var(--sec-2) 0%, transparent 60%),radial-gradient(620px 440px at 92% 94%, var(--sec) 0%, transparent 62%),linear-gradient(150deg,var(--sec-2) 0%,var(--sec) 100%)',
            border: '2px solid var(--card)',
            boxShadow: '0 3px 10px rgba(80,90,150,.2),0 26px 50px -18px rgba(80,90,150,.5),0 50px 90px -40px rgba(80,90,150,.55),inset 0 1px 0 rgba(255,255,255,.9)',
            padding: 'clamp(28px,3.6vw,52px)',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: 'clamp(30px,3.8vw,56px)', alignItems: 'center' }}>
              <div>
                <span className="t-meta" style={{ display: 'inline-block', color: 'var(--ink-faint)' }}>Work with {firstName}</span>
                <h2 className="t-title sf-h-offer" style={{ lineHeight: 1.03, margin: '14px 0 0' }}>Make {firstName} an <span className="t-accent">offer</span></h2>
                <p className="t-body" style={{ color: 'var(--ink-soft)', maxWidth: 420, margin: '18px 0 0' }}>
                  Pick deliverables at {firstName}&apos;s set rates and {firstName} gets a structured offer, not a DM. They review, then accept, counter, or decline. Nothing is locked until you both agree.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 26 }}>
                  {['Transparent, itemised pricing', 'Written terms before anyone commits',
                    // Omitted, not stubbed: a bullet reading "Replies in" with nothing
                    // after it is worse than one fewer bullet.
                    ...(data.replyTime ? [`Replies in ${data.replyTime}`] : [])].map((point, i) => (
                    <div key={i} className="sf-pitch-point" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 30, height: 30, borderRadius: 9, background: 'var(--neon)', flexShrink: 0,
                      }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      </span>
                      <span style={{ fontSize: 14.5, color: 'var(--ink-soft)' }}>{point}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pitch panel placeholder */}
              <div style={{
                borderRadius: 24, background: 'var(--card)', border: '1px solid var(--hairline)',
                boxShadow: '0 20px 46px -30px rgba(40,45,25,.35)', padding: 'clamp(24px,2.8vw,36px)',
                display: 'flex', flexDirection: 'column', gap: 20, minHeight: 300,
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--ink)' }}>
                  Ready to work together?
                </div>
                <p className="t-body" style={{ color: 'var(--ink-soft)' }}>
                  Select deliverables from the rate card above, then create a structured offer. {firstName} will review and respond.
                </p>
                {data.hideDealCta ? null : onDealClick ? (
                  <button onClick={goToPackages} className="g-btn-primary" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '14px 28px', marginTop: 'auto' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                    Start a deal with {firstName}
                  </button>
                ) : (
                  <a href={dealUrl || '#packages'} className="g-btn-primary" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '14px 28px', marginTop: 'auto' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                    Start a deal with {firstName}
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      </SectionWrapper>
      </div>

      <div className="sf-view-mobile">
        <ShopfrontMobile
          data={data}
          qty={qty}
          setQty={setQty}
          activePlatform={activePlatform}
          setActivePlatform={setActivePlatform}
          linkCopied={linkCopied}
          copyLink={copyLink}
          onDealClick={onDealClick}
          editing={editing}
          showHeader={showMobileHeader}
        />
      </div>
    </div>
    </SectionCtx.Provider>
  )
}
