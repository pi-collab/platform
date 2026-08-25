'use client'

import React from 'react'
import type { ShopfrontData, ContentItem, BrandCollab } from './ShopfrontPreview'
import { profileUrl } from '@/lib/handle'
import './shopfront-mobile.css'

/* ── The shopfront as the mobile design draws it ──────────────────────────────
   Generated from "Creator Shopfront Mobile Standalone" by
   scripts/shopfront-mobile-from-export.py, then wired to real data here.

   This is a SECOND RENDERING of the same page, not a replacement. Desktop keeps
   ShopfrontPreview's markup untouched; which one is shown is decided in CSS, by
   width, because an early return is a routing decision — it fires at every
   size, and that is precisely how the desktop empty states got replaced by
   mobile ones once already.

   All state lives in ShopfrontPreview and arrives here as props. Two components
   holding their own copy of the rate-card quantities would be two totals that
   drift, and only one of them is the one an offer is built from.

   The export's phone shell is gone: a 58px status-bar spacer, an inner scroll
   container, a sticky back/share header and a bottom tab bar. The page scrolls
   itself, and CreatorTabBar already owns the bottom of the viewport.
   ────────────────────────────────────────────────────────────────────────── */

export interface ShopfrontMobileProps {
  data: ShopfrontData
  qty: Record<string, number>
  setQty: React.Dispatch<React.SetStateAction<Record<string, number>>>
  activePlatform: string
  setActivePlatform: (p: string) => void
  linkCopied: boolean
  copyLink: () => void
  onDealClick?: (selectedQty: Record<string, number>) => void
  editing?: boolean
  /**
   * The design's sticky page header: back, title, notifications.
   *
   * OPT-IN, and off by default. On the public /c/<slug> page there is no app to
   * go back to and no notifications to open, and a second header inside a page
   * that already has one is what put two headers on the questions screen.
   */
  showHeader?: boolean
}

interface RateVM {
  name: string
  desc: string
  qty: number
  priceDisplay: string
  priceFontSize: string
  rowBg: string
  isReel: boolean
  isStory: boolean
  isYtShort: boolean
  isYtInt: boolean
  isCustom: boolean
  isFromRow: boolean
  isPriceOnRequest: boolean
  showFromInput: boolean
  fromAmount: string
  customQuote: string
  inc: () => void
  dec: () => void
  onFromAmount: () => void
  onCustomQuote: () => void
  slot: string
}

/**
 * The export's picture placeholder, resolved.
 *
 * It ships as <image-slot id fit placeholder>, none of which are DOM
 * attributes — React drops unknown props, so left alone these render an empty
 * span and the card looks like it failed to load. `url` empty falls back to the
 * tinted block the design uses before an image exists.
 */
function Slot({ url, alt, style }: { url?: string; alt: string; style: React.CSSProperties }) {
  if (!url) return <span aria-hidden="true" style={{ background: '#F1F4FA', ...style }} />
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      /* Empty on purpose. The card's title is the next line, so this image adds
         nothing for a screen reader — and a broken image renders its alt text,
         which put the title over the badge and an empty frame. */
      alt=""
      title={alt}
      style={{ objectFit: 'cover', background: '#F1F4FA', ...style }}
    />
  )
}

/**
 * Reveal on scroll.
 *
 * The export ships .sr / .sr-pre / .sr-in and the transition between them, but
 * nothing that ADDS those classes — so every section rendered final-state and
 * the page had none of the movement the desktop one has. This is the same
 * mechanism ShopfrontPreview uses, applied to the generated markup.
 */
function useReveal(root: React.RefObject<HTMLElement>) {
  React.useEffect(() => {
    const el = root.current
    if (!el) return
    const targets = Array.from(el.querySelectorAll('.sr'))
    // No observer, or reduced motion: leave everything visible. A reveal that
    // cannot fire must not be what hides the page.
    if (typeof IntersectionObserver === 'undefined' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    targets.forEach(t => t.classList.add('sr-pre'))
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return
        e.target.classList.remove('sr-pre')
        e.target.classList.add('sr-in')
        io.unobserve(e.target)
      })
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 })
    targets.forEach(t => io.observe(t))
    return () => io.disconnect()
  }, [root])
}

export default function ShopfrontMobile({
  data, qty, setQty, activePlatform, setActivePlatform,
  linkCopied, copyLink, onDealClick, editing, showHeader = false,
}: ShopfrontMobileProps) {
  /* ── View model ───────────────────────────────────────────────────────────
     The generated markup reads plain fields. Everything derived is computed
     here so the markup stays as the design drew it. */

  const rateItems: RateVM[] = data.rateCardItems.map(item => {
    const k = item.key
    const n = qty[k] ?? 0
    const platform = (item.platform ?? '').toLowerCase()
    // No `type` on RateCardItem — the deliverable is carried in the name
    // ("Reel", "Shorts", "Integration"), so the icon is chosen from that.
    const type = item.name.toLowerCase()
    const platformLabel = platform === 'instagram' ? 'Instagram' : platform === 'youtube' ? 'YouTube' : ''
    return {
      // "Reel" alone is ambiguous once a creator sells on both channels, and
      // the rate card no longer groups by platform on a phone.
      name: platformLabel && !item.name.toLowerCase().startsWith(platform)
        ? `${platformLabel} ${item.name}`
        : item.name,
      desc: item.desc ?? '',
      qty: n,
      // priceLabel is null exactly when the creator quotes on request, which
      // is also what drives isPriceOnRequest below — one source, not two.
      priceDisplay: item.priceLabel ?? '',
      // The design shrinks a long figure rather than letting it wrap.
      priceFontSize: (item.priceLabel ?? '').length > 9 ? '15px' : '17px',
      rowBg: n > 0 ? 'color-mix(in oklab, var(--neon) 9%, transparent)' : 'transparent',
      isReel: platform === 'instagram' && type.includes('reel'),
      isStory: platform === 'instagram' && type.includes('story'),
      isYtShort: platform === 'youtube' && type.includes('short'),
      isYtInt: platform === 'youtube' && !type.includes('short'),
      isCustom: false,
      isFromRow: item.approximate === true,
      isPriceOnRequest: !item.priceLabel,
      showFromInput: false,
      fromAmount: '',
      customQuote: '',
      inc: () => setQty(q => ({ ...q, [k]: (q[k] ?? 0) + 1 })),
      dec: () => setQty(q => ({ ...q, [k]: Math.max(0, (q[k] ?? 0) - 1) })),
      onFromAmount: () => {},
      onCustomQuote: () => {},
      slot: '',
    }
  })

  const selectedCount = Object.values(qty).reduce((a, b) => a + b, 0)
  const rateTotalLabel = selectedCount === 0
    ? 'Nothing selected yet'
    : `${selectedCount} item${selectedCount === 1 ? '' : 's'} selected`

  const contentItems = data.contentItems.slice(0, 5).map((c: ContentItem) => ({
    name: c.title,
    brand: c.brand ?? '',
    views: c.views ?? '',
    engagement: c.engagement ?? '',
    slot: c.thumbnailUrl ?? '',
    // The export draws these cards as plain divs, so a tap went nowhere. The
    // desktop card has been a link since the showcase work; this restores that
    // on a phone, where tapping a reel is the obvious thing to do.
    url: !editing ? (c.embedUrl ?? '') : '',
  }))

  const brandItems = data.brandCollabs.map((b: BrandCollab) => ({
    name: b.name,
    content: b.type ?? '',
    views: b.views ?? '',
    engagement: b.engagement ?? '',
    slot: '',
  }))

  const igShow = activePlatform === 'instagram'
  const ytShow = activePlatform === 'youtube'
  /* The export's tab buttons carry NO class — every one of their styles lived
     in this bound object, so reproducing only the background and colour left
     two default browser buttons sitting in the track. */
  const tabBase: React.CSSProperties = {
    border: 'none',
    borderRadius: 999,
    padding: '7px 16px',
    fontFamily: 'var(--font-ui)',
    fontSize: 12.5,
    fontWeight: 600,
    lineHeight: 1,
    cursor: 'pointer',
    transition: 'background .15s ease, color .15s ease',
    WebkitAppearance: 'none',
  }
  const tabOn: React.CSSProperties = { ...tabBase, background: '#fff', color: 'var(--ink)', boxShadow: '0 1px 3px rgba(22,23,15,.10)' }
  const tabOff: React.CSSProperties = { ...tabBase, background: 'transparent', color: 'var(--ink-soft)' }
  const igTabStyle = igShow ? tabOn : tabOff
  const ytTabStyle = ytShow ? tabOn : tabOff
  const setIG = () => setActivePlatform('instagram')
  const setYT = () => setActivePlatform('youtube')

  // The export hardcodes its sample handles; these are the real ones.
  const igProfileUrl = profileUrl('instagram', data.platforms.find(p => p.platform === 'instagram')?.handle ?? '') ?? '#'
  const ytProfileUrl = profileUrl('youtube', data.platforms.find(p => p.platform === 'youtube')?.handle ?? '') ?? '#'

  /* ── Everything the export hardcoded ──────────────────────────────────────
     The converter only replaced {{ bindings }}. Every other value in the design
     was {`${firstName}’s`} — his name, handle, niches, follower counts, age bands,
     cities. On a public shopfront that is not a cosmetic bug: /c/chan rendered
     a different creator's identity. */
  const firstName = data.creatorName.split(' ')[0] ?? data.creatorName
  const lastName = data.creatorName.split(' ').slice(1).join(' ')

  const ig = data.platforms.find(p => p.platform === 'instagram')
  const yt = data.platforms.find(p => p.platform === 'youtube')
  const compact = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n)

  const age = data.audience.ageBreakdown ?? []
  const cities = data.audience.topLocations ?? []
  const womenPct = data.audience.gender?.women ?? 0
  const menPct = data.audience.gender?.men ?? Math.max(0, 100 - womenPct)

  const shareLabel = linkCopied ? 'Copied' : 'Share'
  const copyShopfrontLink = copyLink

  /* In the editor a tap must not throw a creator off the page they are editing.
     Otherwise it carries the CURRENT SELECTION, not an empty one: the rate card
     is what a brand has just been building, and handing the deal builder {}
     makes them choose it all again. */
  const goToCreateOffer = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!editing) onDealClick?.(qty)
  }
  const rateCtaOpacity = selectedCount === 0 ? 0.45 : 1
  const rateCtaPointer = selectedCount === 0 ? 'none' : 'auto'
  /* The design sets a MONEY TOTAL at 24px here. Ours is a count of items, and
     "Nothing selected yet" at 24px reads as the loudest thing on the card while
     saying the least. */
  const rateTotalStyle: React.CSSProperties = {
    fontFamily: 'var(--font-ui)',
    fontWeight: 600,
    fontSize: 15,
    lineHeight: 1.4,
    marginTop: 3,
    color: selectedCount === 0 ? 'var(--ink-soft)' : 'var(--ink)',
  }

  // Referenced by the generated markup; named here so an unused-binding is a
  // compile error rather than a blank card.
  void rateTotalStyle; void rateCtaOpacity; void rateCtaPointer; void shareLabel

  const rootRef = React.useRef<HTMLDivElement>(null)
  useReveal(rootRef)

  return (
    <div className="sfm" ref={rootRef}>
      {showHeader && (
        <div className="sfm-appbar">
          <button type="button" onClick={() => history.back()} aria-label="Back" className="sfm-appbar__back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          {/* The design puts the wordmark here. On this page the wordmark says
              nothing the surrounding app has not already said, so it names the
              page instead. */}
          <span className="sfm-appbar__title">Shopfront</span>
          <button type="button" onClick={copyLink} aria-label={linkCopied ? 'Link copied' : 'Copy shopfront link'} className="sfm-appbar__action">
            {linkCopied ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--lime-700, #4d7c0f)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="m16 6-4-4-4 4" /><path d="M12 2v13" /></svg>
            )}
          </button>
        </div>
      )}
      <div style={{padding: '8px 20px 0', display: 'flex', flexDirection: 'column', gap: '48px'}}>

              {/* IDENTITY */}
              <div className="sr sf-hero-border">
              <div className="sf-comet"></div>
              <div className="mcard" style={{padding: '30px 26px', textAlign: 'center'}}>
                <Slot url={data.profilePhotoUrl ?? undefined} alt={data.creatorName} style={{width: '100%', aspectRatio: '4/5', display: 'block', margin: '0 auto'}} />
                <h1 style={{fontFamily: 'var(--font-display)', fontWeight: '500', letterSpacing: '-0.01em', fontSize: '27px', lineHeight: '1.2', margin: '22px 0 0', color: 'var(--ink)'}}>{firstName} <span className="opit">{lastName}</span></h1>
                <div style={{fontSize: '12.5px', color: 'var(--wg-500)', marginTop: '8px', letterSpacing: '.02em'}}>{data.handle}</div>
                <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px', justifyContent: 'center'}}>
                  {data.niches.map(n => (
                                      <span key={n} className="opill" style={{fontSize: '11px', color: 'var(--ink)', background: 'var(--sec)', padding: '6px 14px'}}>{n}</span>
                  ))}
                </div>
                <p style={{fontSize: '13px', lineHeight: '1.55', color: 'var(--ink)', margin: '18px auto 0', maxWidth: '280px'}}>{data.bio}</p>
                <div style={{display: 'flex', alignItems: 'center', marginTop: '24px'}}>
                  <div style={{flex: '1', textAlign: 'center'}}><div className="tnum" style={{fontFamily: 'var(--font-num)', fontWeight: '500', letterSpacing: '-0.02em', fontSize: '20px', color: 'var(--ink)'}}>{data.totalFollowers}</div><div className="t-meta" style={{color: 'var(--meta)', marginTop: '6px', letterSpacing: '.06em'}}>Followers</div></div>
                  <div style={{width: '1px', height: '32px', background: 'var(--hair)'}}></div>
                  <div style={{flex: '1', textAlign: 'center'}}><div className="tnum" style={{fontFamily: 'var(--font-num)', fontWeight: '500', letterSpacing: '-0.02em', fontSize: '20px', color: 'var(--ink)'}}>{data.engagementRate}</div><div className="t-meta" style={{color: 'var(--meta)', marginTop: '6px', letterSpacing: '.06em'}}>Engagement</div></div>
                  <div style={{width: '1px', height: '32px', background: 'var(--hair)'}}></div>
                  <div style={{flex: '1', textAlign: 'center'}}><div className="tnum" style={{fontFamily: 'var(--font-num)', fontWeight: '500', letterSpacing: '-0.02em', fontSize: '20px', color: 'var(--ink)'}}>{data.avgViews}</div><div className="t-meta" style={{color: 'var(--meta)', marginTop: '6px', letterSpacing: '.06em'}}>Avg views</div></div>
                </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '32px'}}>
                  <a href="#pitch" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50px', borderRadius: '999px', background: 'var(--neon)', color: '#12151C', fontWeight: '600', fontSize: '14px', letterSpacing: '.01em'}}>Create an offer</a>
                  <button onClick={copyShopfrontLink} style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '50px', borderRadius: '999px', border: '1.3px solid var(--line)', background: '#fff', color: 'var(--ink)', fontWeight: '600', fontSize: '14px', letterSpacing: '.01em'}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="10.6" x2="15.4" y2="6.4" /><line x1="8.6" y1="13.4" x2="15.4" y2="17.6" /></svg>{shareLabel}</button>
                </div>
              </div>
              </div>

              {/* STAT BAND */}
              <div className="sr mcard" style={{padding: '6px 24px'}}>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr'}}>
                  <div style={{padding: '17px 0'}}><div className="t-meta" style={{color: 'var(--meta)', letterSpacing: '.08em'}}>Monthly reach</div><div className="tnum" style={{fontFamily: 'var(--font-num)', fontWeight: '500', letterSpacing: '-0.02em', fontSize: '24px', marginTop: '8px', color: 'var(--ink)'}}>{data.monthlyReach}</div></div>
                  <div style={{padding: '17px 0 17px 20px', borderLeft: '1px solid var(--hair)'}}><div className="t-meta" style={{color: 'var(--meta)', letterSpacing: '.08em'}}>Deals per month</div><div className="tnum" style={{fontFamily: 'var(--font-num)', fontWeight: '500', letterSpacing: '-0.02em', fontSize: '24px', marginTop: '8px', color: 'var(--ink)'}}>{data.repeatBrands}</div></div>
                  <div style={{padding: '17px 0', borderTop: '1px solid var(--hair)'}}><div className="t-meta" style={{color: 'var(--meta)', letterSpacing: '.08em'}}>Replies in</div><div className="tnum" style={{fontFamily: 'var(--font-num)', fontWeight: '500', letterSpacing: '-0.02em', fontSize: '24px', marginTop: '8px', color: 'var(--ink)'}}>{data.replyTime}</div></div>
                  <div style={{padding: '17px 0 17px 20px', borderTop: '1px solid var(--hair)', borderLeft: '1px solid var(--hair)'}}><div className="t-meta" style={{color: 'var(--meta)', letterSpacing: '.08em'}}>Avg deal value</div><div className="tnum" style={{fontFamily: 'var(--font-num)', fontWeight: '500', letterSpacing: '-0.02em', fontSize: '24px', marginTop: '8px', color: 'var(--ink)'}}>{data.avgDealValue}</div></div>
                </div>
              </div>

              {/* RATE CARD */}
              <div className="sr" id="packages">
                <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.015em', fontSize: '26px', lineHeight: '1.2', margin: '0', color: 'var(--ink)'}}>Build a <span className="opit">deal</span><div className="secline" style={{marginTop: '14px'}}></div></h2>
                <p style={{fontSize: '13.5px', lineHeight: '1.65', color: 'var(--wg-500)', margin: '16px 0 0', maxWidth: '94%'}}>{`Add what you need at ${firstName}’s set rates — the total updates as you go.`}</p>
                <div style={{marginTop: '22px', background: '#fff', borderRadius: '22px', padding: '6px 20px', boxShadow: '0 10px 24px -18px rgba(40,45,25,.2)'}}>
                  {rateItems.map((item, itemIdx) => (<React.Fragment key={itemIdx}>
                    <div style={{padding: '22px 2px', borderTop: '1px solid var(--hair)', background: item.rowBg}}>
                      <div style={{display: 'flex', alignItems: 'flex-start', gap: '14px'}}>
                        <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '12px', background: 'var(--sec-mid)', flexShrink: '0'}}>
                          {item.isReel ? (<><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><line x1="17.5" y1="6.5" x2="17.5" y2="6.5" /></svg></>) : null}
                          {item.isStory ? (<><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></svg></>) : null}
                          {item.isYtInt ? (<><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 5 3-5 3z" fill="var(--ink)" /></svg></>) : null}
                          {item.isYtShort ? (<><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="4" /><path d="m10.5 9 4 3-4 3z" fill="var(--ink)" /></svg></>) : null}
                        </span>
                        <div style={{minWidth: '0', flex: '1'}}>
                          <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '14px', color: 'var(--ink)'}}>{item.name}</div>
                          <div style={{fontSize: '11.5px', color: 'var(--wg-500)', marginTop: '4px', lineHeight: '1.4'}}>{item.desc}</div>
                        </div>
                      </div>
                      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '16px', paddingLeft: '54px'}}>
                        {item.isCustom ? (<>
                          <input value={item.customQuote} onInput={item.onCustomQuote} placeholder="Add your rate" style={{flex: '1', minWidth: '0', height: '36px', padding: '0 14px', borderRadius: '999px', border: '1.3px solid var(--line)', background: '#fff', fontFamily: 'var(--font-ui)', fontSize: '13px', color: 'var(--ink)'}} />
                        </>) : null}
                        {item.isPriceOnRequest ? (<>
                          <div style={{fontFamily: 'var(--font-ui)', fontSize: '13px', fontWeight: '600', color: 'var(--wg-500)'}}>Price on request</div>
                        </>) : null}
                        {item.isFromRow ? (<>
                          <div style={{display: 'flex', alignItems: 'baseline', gap: '5px'}}><span style={{fontSize: '12px', fontWeight: '500', color: 'var(--wg-500)'}}>From</span><span className="tnum" style={{fontSize: item.priceFontSize, fontWeight: '800', letterSpacing: '-0.015em', color: 'var(--ink)'}}>{item.priceDisplay}</span></div>
                        </>) : null}
                        <div style={{display: 'inline-flex', alignItems: 'center', gap: '0', background: '#F5F7FA', borderRadius: '999px', padding: '4px', flexShrink: '0'}}>
                          <button onClick={item.dec} aria-label="Decrease quantity" style={{width: '28px', height: '28px', borderRadius: '50%', border: 'none', background: '#fff', color: 'var(--ink)', fontSize: '15px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px -3px rgba(40,45,25,.3)'}}>−</button>
                          <span className="tnum" style={{width: '26px', textAlign: 'center', fontWeight: '700', fontSize: '13px', color: 'var(--ink)'}}>{item.qty}</span>
                          <button onClick={item.inc} aria-label="Increase quantity" style={{width: '28px', height: '28px', borderRadius: '50%', border: 'none', background: 'var(--neon)', color: 'var(--ink)', fontSize: '15px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>+</button>
                        </div>
                      </div>
                      {item.showFromInput ? (<>
                        <div style={{marginTop: '12px', paddingLeft: '54px'}}>
                          <input value={item.fromAmount} onInput={item.onFromAmount} placeholder="Enter your rate (₹25,000+)" style={{width: '100%', height: '36px', padding: '0 14px', borderRadius: '999px', border: '1.3px solid var(--line)', background: '#fff', fontFamily: 'var(--font-ui)', fontSize: '13px', color: 'var(--ink)'}} />
                        </div>
                      </>) : null}
                    </div>
                  </React.Fragment>))}
                  <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', padding: '22px 2px', borderTop: '1px solid var(--hair)'}}>
                    <div>
                      <div className="t-meta" style={{color: 'var(--meta)', letterSpacing: '.08em'}}>Selected</div>
                      <div style={rateTotalStyle}>{rateTotalLabel}</div>
                    </div>
                    <a href="#" onClick={goToCreateOffer} style={{display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '700', color: 'var(--ink)', background: 'var(--neon)', borderRadius: '999px', padding: '12px 20px', opacity: rateCtaOpacity, pointerEvents: rateCtaPointer}}>Create an offer<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
                  </div>
                </div>
              </div>

              {/* AUDIENCE */}
              <div className="sr">
                <span className="t-meta" style={{color: '#878D99', letterSpacing: '.1em'}}>AUDIENCE</span>
                <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '500', letterSpacing: '-0.015em', fontSize: '22px', lineHeight: '1.25', margin: '16px 0 0', color: 'var(--ink)'}}>{`${firstName}’s`} <span className="opit">reach</span><div className="secline" style={{marginTop: '14px'}}></div></h2>

                <div className="mcard" style={{marginTop: '22px', padding: '26px 22px'}}>
                  <div style={{display: 'inline-flex', gap: '4px', padding: '4px', borderRadius: '999px', background: 'var(--sec-mid)'}}>
                    <button onClick={setIG} style={igTabStyle}>Instagram</button>
                    <button onClick={setYT} style={ytTabStyle}>YouTube</button>
                  </div>

                  <div style={{display: igShow ? 'block' : 'none'}}>
                    <div style={{display: 'flex', gap: '44px', marginTop: '24px', flexWrap: 'wrap'}}>
                      <div><div className="tnum" style={{fontFamily: 'var(--font-num)', fontWeight: '500', letterSpacing: '-0.02em', fontSize: '25px', lineHeight: '1', color: 'var(--ink)'}}>{data.totalFollowers}</div><div className="t-meta" style={{color: 'var(--meta)', marginTop: '8px', letterSpacing: '.08em'}}>Followers</div></div>
                      <div><div className="tnum" style={{fontFamily: 'var(--font-num)', fontWeight: '500', letterSpacing: '-0.02em', fontSize: '25px', lineHeight: '1', color: 'var(--ink)'}}>{data.engagementRate}</div><div className="t-meta" style={{color: 'var(--meta)', marginTop: '8px', letterSpacing: '.08em'}}>Engagement</div></div>
                      <div><div className="tnum" style={{fontFamily: 'var(--font-num)', fontWeight: '500', letterSpacing: '-0.02em', fontSize: '25px', lineHeight: '1', color: 'var(--ink)'}}>{data.avgViews}</div><div className="t-meta" style={{color: 'var(--meta)', marginTop: '8px', letterSpacing: '.08em'}}>Avg views</div></div>
                    </div>
                    <a href={igProfileUrl} target="_blank" rel="noopener" style={{display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '20px', fontSize: '12px', fontWeight: '600', color: 'var(--ink)', border: '1.3px solid var(--line)', borderRadius: '999px', padding: '9px 15px'}}>{`View ${ig ? "Instagram" : ""}`}<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg></a>
                    <div style={{marginTop: '26px', paddingTop: '22px', borderTop: '1px solid var(--hair)'}}>
                      <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between'}}><span className="t-meta" style={{color: 'var(--meta)', letterSpacing: '.08em'}}>Monthly reach</span><span style={{fontSize: '10.5px', fontWeight: '700', color: 'var(--ink)', background: 'var(--neon)', borderRadius: '999px', padding: '3px 9px'}}>▲ 104% 6-mo</span></div>
                      <svg viewBox="0 0 1000 220" style={{width: '100%', height: 'auto', display: 'block', marginTop: '18px'}}><polygon points="40,185 224,147 408,165 592,117 776,81 960,40 960,185 40,185" fill="rgba(24,28,36,.05)" /><line x1="40" y1="185" x2="960" y2="185" stroke="var(--hair)" strokeWidth="1.5" /><polyline points="40,185 224,147 408,165 592,117 776,81 960,40" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="40" cy="185" r="3.5" fill="var(--ink)" /><circle cx="224" cy="147" r="3.5" fill="var(--ink)" /><circle cx="408" cy="165" r="3.5" fill="var(--ink)" /><circle cx="592" cy="117" r="3.5" fill="var(--ink)" /><circle cx="776" cy="81" r="3.5" fill="var(--ink)" /><circle cx="960" cy="40" r="4" fill="#E8FF66" /></svg>
                    </div>
                  </div>
                  <div style={{display: ytShow ? 'block' : 'none'}}>
                    <div style={{display: 'flex', gap: '44px', marginTop: '24px', flexWrap: 'wrap'}}>
                      <div><div className="tnum" style={{fontFamily: 'var(--font-num)', fontWeight: '500', letterSpacing: '-0.02em', fontSize: '25px', lineHeight: '1', color: 'var(--ink)'}}>{yt ? compact(yt.followers) : ""}</div><div className="t-meta" style={{color: 'var(--meta)', marginTop: '8px', letterSpacing: '.08em'}}>Subscribers</div></div>
                      <div><div className="tnum" style={{fontFamily: 'var(--font-num)', fontWeight: '500', letterSpacing: '-0.02em', fontSize: '25px', lineHeight: '1', color: 'var(--ink)'}}>{yt ? yt.engagement + "%" : ""}</div><div className="t-meta" style={{color: 'var(--meta)', marginTop: '8px', letterSpacing: '.08em'}}>Engagement</div></div>
                      <div><div className="tnum" style={{fontFamily: 'var(--font-num)', fontWeight: '500', letterSpacing: '-0.02em', fontSize: '25px', lineHeight: '1', color: 'var(--ink)'}}>{yt ? compact(yt.avgViews) : ""}</div><div className="t-meta" style={{color: 'var(--meta)', marginTop: '8px', letterSpacing: '.08em'}}>Avg views</div></div>
                    </div>
                    <a href={ytProfileUrl} target="_blank" rel="noopener" style={{display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '20px', fontSize: '12px', fontWeight: '600', color: 'var(--ink)', border: '1.3px solid var(--line)', borderRadius: '999px', padding: '9px 15px'}}>View YouTube<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg></a>
                    <div style={{marginTop: '26px', paddingTop: '22px', borderTop: '1px solid var(--hair)'}}>
                      <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between'}}><span className="t-meta" style={{color: 'var(--meta)', letterSpacing: '.08em'}}>Monthly views</span><span style={{fontSize: '10.5px', fontWeight: '700', color: 'var(--ink)', background: 'var(--neon)', borderRadius: '999px', padding: '3px 9px'}}>▲ 121% 6-mo</span></div>
                      <svg viewBox="0 0 1000 220" style={{width: '100%', height: 'auto', display: 'block', marginTop: '18px'}}><polygon points="40,185 224,151 408,165 592,106 776,74 960,40 960,185 40,185" fill="rgba(24,28,36,.05)" /><line x1="40" y1="185" x2="960" y2="185" stroke="var(--hair)" strokeWidth="1.5" /><polyline points="40,185 224,151 408,165 592,106 776,74 960,40" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="40" cy="185" r="3.5" fill="var(--ink)" /><circle cx="224" cy="151" r="3.5" fill="var(--ink)" /><circle cx="408" cy="165" r="3.5" fill="var(--ink)" /><circle cx="592" cy="106" r="3.5" fill="var(--ink)" /><circle cx="776" cy="74" r="3.5" fill="var(--ink)" /><circle cx="960" cy="40" r="4" fill="#E8FF66" /></svg>
                    </div>
                  </div>
                </div>

                <div className="mcard" style={{marginTop: '16px', padding: '24px 22px'}}>
                  <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between'}}>
                    <span className="t-meta" style={{color: 'var(--meta)', letterSpacing: '.08em'}}>Age</span>
                    <span style={{fontSize: '12px', color: 'var(--wg-500)'}}>25–34 is the core</span>
                  </div>
                  <div style={{display: 'flex', alignItems: 'flex-end', gap: '16px', marginTop: '22px'}}>
                    <div style={{flex: '1', textAlign: 'center'}}><div style={{fontWeight: '700', fontSize: '13px', color: 'var(--ink)', marginBottom: '6px'}}>{age[0] ? age[0].pct + "%" : "—"}</div><div style={{height: '52px', borderRadius: '6px', background: 'var(--sec)', display: 'flex', alignItems: 'flex-end', overflow: 'hidden'}}><div style={{width: '100%', height: '32%', background: 'var(--sec-mid)'}}></div></div><div className="t-meta" style={{color: 'var(--meta)', marginTop: '6px'}}>{age[0]?.label ?? ""}</div></div>
                    <div style={{flex: '1', textAlign: 'center'}}><div style={{fontWeight: '700', fontSize: '13px', color: 'var(--ink)', marginBottom: '6px'}}>{age[1] ? age[1].pct + "%" : "—"}</div><div style={{height: '52px', borderRadius: '6px', background: 'var(--sec)', display: 'flex', alignItems: 'flex-end', overflow: 'hidden'}}><div style={{width: '100%', height: '41%', background: '#E8FF66'}}></div></div><div style={{fontSize: '11px', color: 'var(--ink)', fontWeight: '600', marginTop: '6px'}}>{age[1]?.label ?? ""}</div></div>
                    <div style={{flex: '1', textAlign: 'center'}}><div style={{fontWeight: '700', fontSize: '13px', color: 'var(--ink)', marginBottom: '6px'}}>{age[2] ? age[2].pct + "%" : "—"}</div><div style={{height: '52px', borderRadius: '6px', background: 'var(--sec)', display: 'flex', alignItems: 'flex-end', overflow: 'hidden'}}><div style={{width: '100%', height: '18%', background: 'var(--sec-mid)'}}></div></div><div className="t-meta" style={{color: 'var(--meta)', marginTop: '6px'}}>{age[2]?.label ?? ""}</div></div>
                    <div style={{flex: '1', textAlign: 'center'}}><div style={{fontWeight: '700', fontSize: '13px', color: 'var(--ink)', marginBottom: '6px'}}>{age[3] ? age[3].pct + "%" : "—"}</div><div style={{height: '52px', borderRadius: '6px', background: 'var(--sec)', display: 'flex', alignItems: 'flex-end', overflow: 'hidden'}}><div style={{width: '100%', height: '9%', background: 'var(--sec-mid)'}}></div></div><div className="t-meta" style={{color: 'var(--meta)', marginTop: '6px'}}>{age[3]?.label ?? ""}</div></div>
                  </div>
                </div>

                <div className="mcard" style={{marginTop: '16px', padding: '24px 22px', display: 'flex', alignItems: 'center', gap: '24px'}}>
                  <div style={{position: 'relative', width: '68px', height: '68px', flexShrink: '0', borderRadius: '50%', background: 'conic-gradient(#E8FF66 0 61%,#E8E2F0 61% 100%)'}}><div style={{position: 'absolute', inset: '9px', borderRadius: '50%', background: 'var(--card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}><div className="t-figure" style={{fontSize: '13px', fontWeight: '700', color: 'var(--ink)', lineHeight: '1'}}>{womenPct + "%"}</div><div className="t-meta" style={{color: '#878D99', fontSize: '7px', marginTop: '2px'}}>WOMEN</div></div></div>
                  <div style={{display: 'flex', flexDirection: 'column', gap: '12px', flex: '1'}}>
                    <span className="t-meta" style={{color: 'var(--meta)', letterSpacing: '.08em'}}>Gender</span>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}><span style={{fontSize: '13px', color: 'var(--ink)'}}>Women</span><span style={{fontWeight: '600', fontSize: '15px', color: 'var(--ink)'}}>{womenPct + "%"}</span></div>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}><span style={{fontSize: '13px', color: 'var(--wg-500)'}}>Men</span><span style={{fontWeight: '600', fontSize: '15px', color: 'var(--wg-500)'}}>{menPct + "%"}</span></div>
                  </div>
                </div>

                <div className="mcard" style={{marginTop: '16px', padding: '24px 22px'}}>
                  <span className="t-meta" style={{color: 'var(--meta)', letterSpacing: '.08em'}}>Top cities</span>
                  <div style={{display: 'flex', flexDirection: 'column', gap: '17px', marginTop: '18px'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}><span style={{width: '78px', flexShrink: '0', fontSize: '13px', color: 'var(--ink)'}}>{cities[0]?.city ?? ""}</span><div style={{flex: '1', height: '8px', borderRadius: '8px', background: 'var(--sec)', overflow: 'hidden'}}><div style={{height: '100%', width: '88%', borderRadius: '8px', background: '#E8FF66'}}></div></div><span style={{width: '32px', textAlign: 'right', fontWeight: '700', fontSize: '13px', color: 'var(--ink)'}}>{cities[0] ? cities[0].pct + "%" : ""}</span></div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}><span style={{width: '78px', flexShrink: '0', fontSize: '13px', color: 'var(--wg-500)'}}>{cities[1]?.city ?? ""}</span><div style={{flex: '1', height: '8px', borderRadius: '8px', background: 'var(--sec)', overflow: 'hidden'}}><div style={{height: '100%', width: '68%', borderRadius: '8px', background: 'var(--sec-mid)'}}></div></div><span style={{width: '32px', textAlign: 'right', fontWeight: '700', fontSize: '13px', color: 'var(--wg-500)'}}>{cities[1] ? cities[1].pct + "%" : ""}</span></div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}><span style={{width: '78px', flexShrink: '0', fontSize: '13px', color: 'var(--wg-500)'}}>{cities[2]?.city ?? ""}</span><div style={{flex: '1', height: '8px', borderRadius: '8px', background: 'var(--sec)', overflow: 'hidden'}}><div style={{height: '100%', width: '56%', borderRadius: '8px', background: 'var(--sec-mid)'}}></div></div><span style={{width: '32px', textAlign: 'right', fontWeight: '700', fontSize: '13px', color: 'var(--wg-500)'}}>{cities[2] ? cities[2].pct + "%" : ""}</span></div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}><span style={{width: '78px', flexShrink: '0', fontSize: '13px', color: 'var(--wg-500)'}}>{cities[3]?.city ?? ""}</span><div style={{flex: '1', height: '8px', borderRadius: '8px', background: 'var(--sec)', overflow: 'hidden'}}><div style={{height: '100%', width: '44%', borderRadius: '8px', background: 'var(--sec-mid)'}}></div></div><span style={{width: '32px', textAlign: 'right', fontWeight: '700', fontSize: '13px', color: 'var(--wg-500)'}}>{cities[3] ? cities[3].pct + "%" : ""}</span></div>
                  </div>
                </div>
              </div>

              {/* CONTENT SHOWCASE */}
              <div className="sr">
                <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '500', letterSpacing: '-0.015em', fontSize: '22px', lineHeight: '1.25', margin: '0', color: 'var(--ink)'}}>{`A look at ${firstName}’s`} <span className="opit">content</span><div className="secline" style={{marginTop: '14px'}}></div></h2>
                <div className="snap-track" style={{gap: '16px', margin: '22px -20px 0', padding: '2px 20px 6px'}}>
                  {contentItems.map((item, itemIdx) => (<React.Fragment key={itemIdx}>
                    <a href={item.url || undefined} target={item.url ? "_blank" : undefined} rel="noopener noreferrer" className="mcard" style={{scrollSnapAlign: 'start', flex: '0 0 62%', overflow: 'hidden'}}>
                      <div style={{position: 'relative', width: '100%', aspectRatio: '9/13'}}><Slot url={item.slot} alt={item.name} style={{width: '100%', height: '100%', display: 'block'}} /><span style={{position: 'absolute', left: '10px', top: '10px', fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.05em', background: 'rgba(255,255,255,.92)', color: 'var(--ink)', borderRadius: '999px', padding: '3px 9px'}}>Reel</span></div>
                      <div style={{padding: '16px 16px 18px'}}>
                        <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '13.5px', color: 'var(--ink)'}}>{item.name}</div>
                        <div className="t-meta" style={{color: 'var(--meta)', marginTop: '5px', letterSpacing: '.06em'}}>{item.brand}</div>
                        <div style={{display: 'flex', gap: '16px', marginTop: '12px', fontSize: '12px', color: 'var(--wg-500)'}}><span><b className="tnum" style={{color: 'var(--ink)'}}>{item.views}</b> views</span><span><b className="tnum" style={{color: 'var(--ink)'}}>{item.engagement}</b> eng.</span></div>
                      </div>
                    </a>
                  </React.Fragment>))}
                </div>
              </div>

              {/* PAST COLLABORATIONS */}
              <div className="sr">
                <div>
                  <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '500', letterSpacing: '-0.015em', fontSize: '22px', lineHeight: '1.25', margin: '0', color: 'var(--ink)'}}>{`Brands ${firstName}`} <span className="opit">delivered for</span><div className="secline" style={{marginTop: '14px'}}></div></h2>
                </div>
                <div className="t-meta" style={{color: 'var(--meta)', marginTop: '16px', letterSpacing: '.06em'}}>{`${data.brandCollabs.length} brand${data.brandCollabs.length === 1 ? "" : "s"} booked on Guapd`}</div>
                <div className="snap-track" style={{gap: '16px', margin: '22px -20px 0', padding: '2px 20px 6px'}}>
                  {brandItems.map((brand, brandIdx) => (<React.Fragment key={brandIdx}>
                    <div className="mcard" style={{scrollSnapAlign: 'start', flex: '0 0 68%', padding: '18px'}}>
                      <Slot url={brand.slot} alt={brand.name} style={{width: '100%', height: '110px', display: 'block', background: '#F1F4FA', borderRadius: '12px', color: '#79809C'}} />
                      <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginTop: '16px'}}><span style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '15px', color: 'var(--ink)'}}>{brand.name}</span><span className="t-meta" style={{color: 'var(--meta)'}}>{brand.content}</span></div>
                      <div style={{fontSize: '12px', color: 'var(--wg-500)', marginTop: '8px'}}><b className="tnum" style={{color: 'var(--ink)'}}>{brand.views}</b> views · <b className="tnum" style={{color: 'var(--ink)'}}>{brand.engagement}</b> eng.</div>
                    </div>
                  </React.Fragment>))}
                </div>
              </div>

              {/* PITCH / OFFER */}
              <div className="sr" id="pitch">
                <div style={{borderRadius: '24px', background: 'var(--ink)', color: '#fff', padding: '34px 26px'}}>
                  <span style={{fontFamily: 'var(--font-ui)', fontSize: '10px', fontWeight: '700', letterSpacing: '.1em', textTransform: 'uppercase', background: 'var(--neon)', color: 'var(--ink)', borderRadius: '999px', padding: '5px 13px'}}>{`Work with ${firstName}`}</span>
                  <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '500', letterSpacing: '-0.015em', fontSize: '24px', lineHeight: '1.25', margin: '20px 0 0', color: '#fff'}}>{`Make ${firstName} an`} <span className="opit" style={{color: 'var(--neon)'}}>offer</span></h2>
                  <p style={{fontSize: '13.5px', lineHeight: '1.7', color: '#B8BAB0', margin: '16px 0 0'}}>{`Pick deliverables at ${firstName}’s set rates`} and he gets a structured offer, not a DM. He reviews, then accepts, counters, or declines.</p>
                  <div style={{display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '28px'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '6px', background: 'var(--neon)', flexShrink: '0'}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span><span style={{fontSize: '13px', color: '#fff'}}>Transparent, itemised pricing</span></div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '6px', background: 'var(--neon)', flexShrink: '0'}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span><span style={{fontSize: '13px', color: '#fff'}}>Written terms before anyone commits</span></div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '6px', background: 'var(--neon)', flexShrink: '0'}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span><span style={{fontSize: '13px', color: '#fff'}}>{`Replies in ${data.replyTime}`}</span></div>
                  </div>
                  <a href="#" onClick={goToCreateOffer} style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '52px', borderRadius: '999px', background: 'var(--neon)', color: 'var(--ink)', fontWeight: '600', fontSize: '14px', letterSpacing: '.01em', marginTop: '28px'}}>Create an offer</a>
                </div>
              </div>

            </div>

            <div style={{padding: '28px 18px 8px', marginTop: '8px', textAlign: 'center'}}>
              <img src="215d6bd3-24c3-4e42-9f12-d9c686497764" alt="guapd" style={{height: '14px', width: 'auto', display: 'inline-block', opacity: '.4'}} />
              <div className="t-meta" style={{color: 'var(--meta)', marginTop: '10px'}}>© 2026 guapd Technologies. All rights reserved.</div>
            </div>
    </div>
  )
}
