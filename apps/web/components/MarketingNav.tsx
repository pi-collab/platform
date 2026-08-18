'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { nav } from '@/lib/content'

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
 * "How it works" is not in the header: it pointed at an anchor that exists on
 * neither page.
 *
 * Styling is inline rather than in brands-page.css or creators-page.css,
 * because this renders on both pages and a rule in either stylesheet would
 * apply on only one of them.
 */

const CAPSULE_HEIGHT = 60
const PILL = '#FFFFFF'
const SHADOW = '0 20px 44px -28px rgba(40,45,25,.16)'
const EASE = 'cubic-bezier(.22,1,.36,1)'

/** How far you scroll before the header splits. */
const SPLIT_AT = 24

export default function MarketingNav({ audience }: { audience: 'brand' | 'creator' }) {
  const cta = audience === 'creator' ? nav.creatorCta : nav.brandCta
  const currentHref = audience === 'creator' ? '/creators' : '/brands'
  // Anchor-only entries ("How it works") are dropped — those targets do not
  // exist on these pages.
  const links = nav.links.filter((l) => l.href.startsWith('/'))

  const [split, setSplit] = useState(false)

  useEffect(() => {
    const onScroll = () => setSplit(window.scrollY > SPLIT_AT)
    onScroll() // reloading partway down should start in the right state
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const group: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    height: `${CAPSULE_HEIGHT}px`,
    borderRadius: '999px',
    background: split ? PILL : 'transparent',
    boxShadow: split ? SHADOW : 'none',
    flexShrink: 0,
    transition: `background .28s ${EASE}, box-shadow .28s ${EASE}, padding .28s ${EASE}`,
  }

  const rule: React.CSSProperties = {
    width: '1px',
    height: '22px',
    background: 'rgba(24,28,36,.12)',
    flexShrink: 0,
    opacity: split ? 1 : 0,
    transition: `opacity .2s ${EASE}`,
  }

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 100, padding: '26px clamp(14px,4vw,28px) 0', background: 'transparent' }}>
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
          transition: `background .28s ${EASE}, box-shadow .28s ${EASE}`,
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/guapd-wordmark.svg" alt="Guapd" style={{ height: '24px', width: 'auto', display: 'block' }} />
          </Link>

          <span className="mnav-rule" aria-hidden="true" style={rule} />

          <div
            className="mnav-links"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '22px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#4A4F58',
              whiteSpace: 'nowrap',
              margin: split ? '0' : '0 auto',
              transition: `margin .28s ${EASE}`,
            }}
          >
            {links.map((link) => {
              const current = link.href === currentHref
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={current ? 'page' : undefined}
                  style={{
                    color: current ? '#181C24' : '#4A4F58',
                    fontWeight: current ? 700 : 500,
                    textDecoration: 'none',
                    display: 'inline-flex',
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
          <Link
            className="mnav-login"
            href={nav.login.href}
            style={{ fontSize: '14px', fontWeight: 600, color: '#181C24', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            {nav.login.label}
          </Link>

          <span className="mnav-rule" aria-hidden="true" style={rule} />

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
              fontSize: '13.5px',
              fontWeight: 700,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {cta.label}
          </Link>
        </div>
      </nav>
    </div>
  )
}
