'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { nav } from '@/lib/content'
import BookDemoModal from '@/components/BookDemoModal'
import Wordmark from '@/components/Wordmark'

/**
 * The header from the design exports, shared by both marketing pages.
 *
 * Two states. At the top of the page it is ONE wide capsule, exactly as the
 * export draws it. Once you scroll it splits in two — wordmark and links on the
 * left, account actions on the right — and the page artwork shows between them.
 *
 * The split moves the pill treatment rather than swapping markup: the same
 * groups are always rendered, and the white background, shadow and padding
 * transfer from the wrapper to the two halves. Rendering two navs and
 * cross-fading would double the DOM and hand screen readers two copies of the
 * same links.
 *
 * Both halves share a fixed height. Left holds a 24px wordmark and right a 44px
 * button, so content-derived heights came out 40px and 60px — different sizes
 * AND different top edges, which reads as a broken header rather than a pair.
 *
 * "How it works" shows only in the joined state and drops away when the header
 * splits, so the left capsule stays compact. Its href in lib/content.ts points
 * at #how-it-works, which exists on neither marketing page — both use id="how"
 * — so it is remapped here rather than edited there, since the site-wide <Nav>
 * uses the same content on pages that may anchor differently.
 *
 * Styling is inline rather than in brands-page.css or creators-page.css,
 * because this renders on both pages and a rule in either stylesheet would
 * apply on only one of them.
 */

const CAPSULE_HEIGHT = 60
const PILL = '#FFFFFF'
/**
 * Two shadows: a soft ambient one for depth and a tighter contact shadow so the
 * capsule reads as lifted off the artwork it floats over. The export's single
 * hint of a shadow disappeared entirely against the pale hero.
 */
const SHADOW = '0 18px 40px -20px rgba(24,28,36,.28), 0 2px 8px -2px rgba(24,28,36,.10)'
const EASE = 'cubic-bezier(.22,1,.36,1)'

/** The CTA pill. Shared so the home page's <button> cannot drift from the
 *  <Link> the other two audiences render. */
const CTA_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '44px',
  padding: '0 20px',
  borderRadius: '999px',
  background: '#E8FF66',
  color: '#181C24',
  fontSize: '14.5px',
  fontWeight: 700,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}

/** How long the join/split takes. Slow enough to read as one movement. */
const MORPH = '.55s'

/**
 * Fallback split point, used only until the first section is measured. The real
 * threshold is the height of the first section: the header should hold its full
 * shape while you are still reading the hero, and split once you have left it.
 */
const SPLIT_FALLBACK = 520

/**
 * A menu on the landing page's two account actions.
 *
 * The home page addresses nobody in particular, so "Log in" and "Get access"
 * cannot pick a side — each opens the two-way choice instead of guessing. On
 * /brands and /creators the audience is known and both stay plain links.
 *
 * Closes on Escape, on outside click and on choosing an item, and reports its
 * state through aria-expanded so it is not a mouse-only control.
 */
function NavMenu({
  label, items, variant,
}: {
  label: string
  items: { label: string; href: string }[]
  variant: 'plain' | 'pill'
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const trigger: React.CSSProperties = variant === 'pill'
    ? { ...CTA_STYLE, border: 'none', cursor: 'pointer' }
    : { fontSize: '15px', fontWeight: 600, color: '#181C24', background: 'none', border: 'none',
        cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }

  return (
    <div ref={wrap} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)} style={trigger}>
        {label}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
             style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 10px)', right: 0, minWidth: '196px',
            background: '#FFFFFF', borderRadius: '16px', padding: '6px',
            boxShadow: '0 18px 40px -18px rgba(24,28,36,.30), 0 2px 8px -2px rgba(24,28,36,.10)',
            display: 'flex', flexDirection: 'column', zIndex: 10,
          }}
        >
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => setOpen(false)}
              style={{
                padding: '10px 14px', borderRadius: '11px', fontSize: '14.5px', fontWeight: 600,
                color: '#181C24', textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              {it.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MarketingNav({ audience }: { audience: 'brand' | 'creator' | 'home' }) {
  // The landing page addresses nobody in particular, so its CTA is the demo
  // rather than either signup — which is what its own export draws.
  const [demoOpen, setDemoOpen] = useState(false)
  const cta =
    audience === 'creator' ? nav.creatorCta :
    audience === 'home' ? { label: 'Book demo', href: '#book-demo' } :
    nav.brandCta
  // No nav item is "current" on the landing page; it is not one of the two.
  const currentHref = audience === 'creator' ? '/creators' : audience === 'home' ? '' : '/brands'
  const links = nav.links.map((l) =>
    l.href.startsWith('#') ? { ...l, href: '#how', anchorOnly: true } : { ...l, anchorOnly: false },
  )

  const [split, setSplit] = useState(false)

  useEffect(() => {
    // Split once the first section is behind you. Measured rather than
    // hardcoded, because the hero is a different height on each page and at
    // every viewport width.
    const threshold = () => {
      const first = document.querySelector('main section')
      const h = first ? first.getBoundingClientRect().height : 0
      return Math.max(h * 0.75, SPLIT_FALLBACK)
    }

    let limit = threshold()
    const onScroll = () => setSplit(window.scrollY > limit)
    const onResize = () => { limit = threshold(); onScroll() }

    onScroll() // reloading partway down should start in the right state
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const group: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    height: `${CAPSULE_HEIGHT}px`,
    borderRadius: '999px',
    background: split ? PILL : 'transparent',
    boxShadow: split ? SHADOW : 'none',
    flexShrink: 0,
    transition: `background ${MORPH} ${EASE}, box-shadow ${MORPH} ${EASE}, padding ${MORPH} ${EASE}, flex ${MORPH} ${EASE}`,
  }

  const rule: React.CSSProperties = {
    width: '1px',
    height: '22px',
    background: 'rgba(24,28,36,.12)',
    flexShrink: 0,
    opacity: split ? 1 : 0,
    transition: `opacity .3s ${EASE}`,
  }

  return (
    <div className="mnav-wrap" style={{ position: 'sticky', top: 0, zIndex: 100, padding: '26px clamp(14px,4vw,28px) 0', background: 'transparent' }}>
      <style>{`
        @media (max-width: 780px) {
          .mnav-links, .mnav-rule, .mnav-login { display: none !important; }
        }
      `}</style>

      <nav
        aria-label="Main"
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          height: `${CAPSULE_HEIGHT}px`,
          borderRadius: '999px',
          background: split ? 'transparent' : PILL,
          boxShadow: split ? 'none' : SHADOW,
          fontFamily: 'var(--font-schibsted), system-ui, sans-serif',
          transition: `background ${MORPH} ${EASE}, box-shadow ${MORPH} ${EASE}`,
        }}
      >
        {/* Wordmark + links. Grows to fill when joined so the links sit centred
            as they do in the export; hugs them when split. */}
        <div
          style={{
            ...group,
            flex: split ? '0 0 auto' : '1 1 auto',
            paddingLeft: split ? '22px' : '20px',
            paddingRight: split ? '24px' : '0px',
            gap: '20px',
          }}
        >
          <Link href="/" aria-label="Guapd home" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <Wordmark height={20} />
          </Link>

          <span className="mnav-rule" aria-hidden="true" style={rule} />

          <div
            className="mnav-links"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '22px',
              fontSize: '15px',
              fontWeight: 500,
              color: '#4A4F58',
              whiteSpace: 'nowrap',
              margin: split ? '0' : '0 auto',
              transition: `margin ${MORPH} ${EASE}`,
            }}
          >
            {links.map((link) => {
              // Nothing is marked on the landing page. The dot means "you are
              // on this page", and the home page is not one of the three links
              // — marking "How it works" implied it was a separate page you had
              // navigated to. The wordmark is the way home, as it is on every
              // other site, so no fourth link is needed.
              const current = link.href === currentHref
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={current ? 'page' : undefined}
                  style={{
                    // Present only while the header is one capsule.
                    display: link.anchorOnly && split ? 'none' : 'inline-flex',
                    color: current ? '#181C24' : '#4A4F58',
                    fontWeight: current ? 700 : 500,
                    textDecoration: 'none',
                    alignItems: 'center',
                    gap: '7px',
                  }}
                >
                  {current && (
                    <span aria-hidden="true" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#D2F04A', flexShrink: 0 }} />
                  )}
                  {link.label}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Log in + the audience CTA */}
        <div style={{ ...group, paddingLeft: split ? '24px' : '16px', paddingRight: '8px', gap: '16px' }}>
          {audience === 'home' ? (
            <div className="mnav-login">
              <NavMenu
                label={nav.login.label}
                variant="plain"
                items={[
                  { label: 'Log in as a creator', href: '/login/creator' },
                  { label: 'Log in as a brand', href: '/login/brand' },
                ]}
              />
            </div>
          ) : (
          <Link
            className="mnav-login"
            // nav.login.href is the brand login, because the site-wide <Nav>
            // that also reads it sits on brand-facing pages. On the creators
            // page it has to send creators to their own login instead — it was
            // dropping them on the brand sign-in.
            href={audience === 'creator' ? '/login/creator' : nav.login.href}
            style={{ fontSize: '15px', fontWeight: 600, color: '#181C24', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            {nav.login.label}
          </Link>
          )}

          <span className="mnav-rule" aria-hidden="true" style={rule} />

          {audience === 'home' ? (
            <NavMenu
              label="Get access"
              variant="pill"
              items={[
                { label: "I'm a creator", href: '/signup/creator' },
                { label: "I'm a brand", href: '/signup/brand' },
              ]}
            />
          ) : (
          <Link
            href={cta.href}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '44px',
              padding: '0 20px',
              borderRadius: '999px',
              background: '#E8FF66',
              color: '#181C24',
              fontSize: '14.5px',
              fontWeight: 700,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {cta.label}
          </Link>
          )}
        </div>
      </nav>

      {audience === 'home' && <BookDemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />}
    </div>
  )
}
