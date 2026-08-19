'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { nav } from '@/lib/content'
import BookDemoModal from '@/components/BookDemoModal'
import GetAccessModal from '@/components/GetAccessModal'
import ContactModal from '@/components/ContactModal'
import '@/components/marketing-nav.css'
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

/** Line icons for the two audiences, drawn to match the site's 2px stroke. */
const ICONS = {
  creator: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 8-6 4 6 4V8Z" />
      <rect width="14" height="12" x="2" y="6" rx="2" />
    </svg>
  ),
  brand: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 21h18M5 21V7l7-4 7 4v14" />
      <path d="M10 21v-5h4v5" />
    </svg>
  ),
}

/**
 * A menu on the landing page's two account actions.
 *
 * The home page addresses nobody in particular, so "Log in" and "Get access"
 * cannot pick a side — each opens the two-way choice instead of guessing. On
 * /brands and /creators the audience is known and both stay plain links.
 *
 * Hover opens it, which is what makes it feel quick. Hover is only ever an
 * ENHANCEMENT here: the trigger is a real button that toggles on click and
 * reports aria-expanded, so keyboard and touch — where hover does not exist —
 * get the same menu. Closing is deliberately delayed a beat, because the cursor
 * has to cross a gap between the trigger and the card and an instant close
 * makes the menu impossible to reach.
 */
function NavMenu({
  label, caption, items, variant, className,
}: {
  label: string
  caption: string
  items: { label: string; href: string; icon: keyof typeof ICONS }[]
  variant: 'plain' | 'pill'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null } }
  const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => setOpen(false), 160) }

  useEffect(() => () => cancelClose(), [])

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
    <div
      ref={wrap}
      className={className}
      style={{ position: 'relative', flexShrink: 0 }}
      onMouseEnter={() => { cancelClose(); setOpen(true) }}
      onMouseLeave={scheduleClose}
    >
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
            position: 'absolute', top: 'calc(100% + 12px)', right: 0, minWidth: '212px',
            background: '#FFFFFF', borderRadius: '20px', padding: '16px 12px 12px',
            boxShadow: '0 24px 48px -20px rgba(24,28,36,.34), 0 2px 10px -3px rgba(24,28,36,.12)',
            display: 'flex', flexDirection: 'column', gap: '2px', zIndex: 10,
          }}
        >
          <span style={{
            fontSize: '11px', fontWeight: 600, letterSpacing: '.10em', textTransform: 'uppercase',
            color: '#8B90A0', padding: '0 12px 8px',
          }}>
            {caption}
          </span>

          {items.map((it, i) => (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => setOpen(false)}
              className="mnav-item"
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '11px 12px', borderRadius: '13px',
                fontSize: '16px', fontWeight: 600, color: '#181C24', textDecoration: 'none',
                whiteSpace: 'nowrap',
                borderTop: i ? '1px solid #EFF1F4' : 'none',
              }}
            >
              <span style={{ color: '#8B90A0', display: 'inline-flex' }}>{ICONS[it.icon]}</span>
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
  const [accessOpen, setAccessOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
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

  // The mobile panel. Below 780px the links, the rule and Log in are all hidden,
  // which left the header with a wordmark and a CTA and no way to reach any
  // other page — this is that way.
  const [menuOpen, setMenuOpen] = useState(false)
  const [expanded, setExpanded] = useState<'login' | 'access' | null>(null)

  // Close on route change is handled by unmount; this closes on resize back to
  // desktop, where the panel is hidden but would still be holding the scroll
  // lock and would re-appear on the next narrow resize.
  useEffect(() => {
    if (!menuOpen) return
    const onResize = () => { if (window.innerWidth > 780) setMenuOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('resize', onResize)
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [menuOpen])

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
          <Link href="/" aria-label="Guapd home" className="mnav-mark mnav-mark--dark" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <Wordmark height={20} />
          </Link>
          {/* The mobile bar is dark, so it needs the light artwork. Two elements
              toggled by breakpoint: an <img> src cannot be swapped in CSS. */}
          <Link href="/" aria-label="Guapd home" className="mnav-mark mnav-mark--light" style={{ display: 'none', alignItems: 'center', textDecoration: 'none' }}>
            <Wordmark height={20} tone="light" />
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

        {/* Hamburger. Only below 780px, where the links are hidden. */}
        <button
          type="button"
          className="mnav-burger"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => { setMenuOpen((v) => !v); setExpanded(null) }}
        >
          {menuOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          )}
        </button>

        {/* Log in + the audience CTA */}
        <div style={{ ...group, paddingLeft: split ? '24px' : '16px', paddingRight: '8px', gap: '16px' }}>
          {audience === 'home' ? (
            <div className="mnav-login">
              <NavMenu
                label={nav.login.label}
                caption="Log in as a"
                variant="plain"
                items={[
                  { label: 'Creator', href: '/login/creator', icon: 'creator' },
                  { label: 'Brand', href: '/login/brand', icon: 'brand' },
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
              caption="Sign up as a"
              className="mnav-cta"
              variant="pill"
              items={[
                { label: 'Creator', href: '/signup/creator', icon: 'creator' },
                { label: 'Brand', href: '/signup/brand', icon: 'brand' },
              ]}
            />
          ) : (
          <Link
            href={cta.href}
            className="mnav-cta"
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

          {/* The landing page's CTA is a dropdown, and a dropdown is hidden on a
              phone bar because it would open over the drawer. That left the
              landing header with nothing on the right, while /brands and
              /creators both carry a CTA there. This is the phone-only
              stand-in: the same Get access choice, as a modal instead of a
              menu hanging off the bar. */}
          {audience === 'home' && (
            <button
              type="button"
              className="mnav-cta-home"
              onClick={() => setAccessOpen(true)}
            >
              Get access
            </button>
          )}
        </div>
      </nav>

      {/* The mobile panel. Sits under the capsule, in the same sticky wrapper, so
          it travels with the header rather than being pinned to the document. */}
      {menuOpen && (
        <>
          {/* Dimmed backdrop. Clicking it closes, which is how a drawer is
              expected to behave and the only obvious way out for a thumb. */}
          <div className="mnav-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        <div className="mnav-panel" role="dialog" aria-modal="true" aria-label="Menu">
          {/* Home first, then the two audience pages. "How it works" is dropped:
              it is an anchor into whichever page you happen to be on, which
              means nothing from a menu that also offers to move you between
              pages. */}
          <Link href="/" className="mnav-panel-row" onClick={() => setMenuOpen(false)}>Home</Link>
          {links.filter((l) => !l.anchorOnly).map((l) => (
            <Link key={l.href} href={l.href} className="mnav-panel-row" onClick={() => setMenuOpen(false)}>
              {l.label}
            </Link>
          ))}

          {audience === 'home' ? (
            <>
              <button
                type="button"
                className="mnav-panel-row mnav-panel-toggle"
                aria-expanded={expanded === 'login'}
                onClick={() => setExpanded(expanded === 'login' ? null : 'login')}
              >
                {nav.login.label}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                     style={{ transform: expanded === 'login' ? 'rotate(180deg)' : 'none', transition: `transform .2s ${EASE}` }}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {expanded === 'login' && (
                <div className="mnav-panel-sub">
                  <Link href="/login/creator" className="mnav-panel-subrow" onClick={() => setMenuOpen(false)}>Creator</Link>
                  <Link href="/login/brand" className="mnav-panel-subrow" onClick={() => setMenuOpen(false)}>Brand</Link>
                </div>
              )}

              <button
                type="button"
                className="mnav-panel-cta mnav-panel-toggle"
                aria-expanded={expanded === 'access'}
                onClick={() => setExpanded(expanded === 'access' ? null : 'access')}
              >
                Get access
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                     style={{ transform: expanded === 'access' ? 'rotate(180deg)' : 'none', transition: `transform .2s ${EASE}` }}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {expanded === 'access' && (
                <div className="mnav-panel-sub">
                  <Link href="/signup/creator" className="mnav-panel-subrow" onClick={() => setMenuOpen(false)}>I&rsquo;m a creator</Link>
                  <Link href="/signup/brand" className="mnav-panel-subrow" onClick={() => setMenuOpen(false)}>I&rsquo;m a brand</Link>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Log in is the drawer's button. The audience CTA is already on
                  the bar outside it, so repeating it here would give the same
                  action twice on one screen. */}
              <Link
                href={audience === 'creator' ? '/login/creator' : nav.login.href}
                className="mnav-panel-cta"
                onClick={() => setMenuOpen(false)}
              >
                {nav.login.label}
              </Link>
            </>
          )}

              {/* Book demo, brand side only. A creator has nothing to be shown —
                  the demo is of the brand workflow — so offering it on the
                  creator drawer would send them to a form that is not for them. */}
              {audience === 'brand' && (
                <button
                  type="button"
                  className="mnav-panel-row mnav-panel-row--quiet"
                  onClick={() => { setMenuOpen(false); setDemoOpen(true) }}
                >
                  Book demo
                </button>
              )}

              {/* Contact on every drawer. The footer has one, but a phone user
                  looking for a way to reach us opens the menu, not the bottom of
                  a long page. Same modal, so a message still lands in events
                  before it is emailed. */}
              <button
                type="button"
                className="mnav-panel-row mnav-panel-row--quiet"
                onClick={() => { setMenuOpen(false); setContactOpen(true) }}
              >
                Contact us
              </button>
        </div>
        </>
      )}

      {/* No longer home-only: the brand drawer opens the demo modal too. */}
      {(audience === 'home' || audience === 'brand') && (
        <BookDemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
      )}
      {audience === 'home' && <GetAccessModal open={accessOpen} onClose={() => setAccessOpen(false)} />}
      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  )
}
