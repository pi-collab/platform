'use client'

import Link from 'next/link'
import { nav } from '@/lib/content'

/**
 * The header from the design exports, shared by both marketing pages.
 *
 * Was BrandsNav, scoped to one page. The creators page needs the same header —
 * only the CTA differs — so it takes an `audience` instead of being duplicated.
 *
 * The export's own nav is a static mockup: its links point at in-page anchors
 * (#brands, #creators, #login) and its button says "Book demo". The structure
 * and styling here are the design's; the destinations and labels come from
 * lib/content.ts, so the header actually navigates and stays in step if that
 * content changes.
 *
 * Split into TWO capsules — wordmark and links on the left, account actions on
 * the right — rather than one wide pill. The single pill left a large empty
 * middle at desktop widths; splitting it turns that emptiness into deliberate
 * space and lets the page's own artwork show between them.
 *
 * Styling is fully inline rather than leaning on .bp-btn or the page token
 * scopes. Those tokens are defined separately in brands-page.css and
 * creators-page.css, so a component depending on them would render correctly on
 * one page and unstyled on the other — and would break again on any third page.
 * Self-contained is the only version that travels.
 */
/** The pill shared by both halves — same treatment as the single-capsule version. */
const capsule: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 10px',
  borderRadius: '999px',
  background: '#FFFFFF',
  boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)',
  flexShrink: 0,
}

export default function MarketingNav({ audience }: { audience: 'brand' | 'creator' }) {
  const cta = audience === 'creator' ? nav.creatorCta : nav.brandCta
  const currentHref = audience === 'creator' ? '/creators' : '/brands'

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 100, padding: '26px clamp(14px,4vw,28px) 0', background: 'transparent' }}>
      {/* Scoped stylesheet rather than a class in brands-page.css or
          creators-page.css: this component renders on both pages, and a rule
          living in one of them would only apply on one. */}
      <style>{`
        @media (max-width: 780px) {
          .mnav-links, .mnav-rule { display: none !important; }
          .mnav-login { display: none !important; }
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
          fontFamily: 'var(--font-schibsted), system-ui, sans-serif',
        }}
      >
        {/* Left capsule: wordmark, then the section links */}
        <div style={{ ...capsule, paddingLeft: '20px', paddingRight: '22px', gap: '20px' }}>
          <Link href="/" aria-label="Guapd home" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/guapd-wordmark.svg" alt="Guapd" style={{ height: '24px', width: 'auto', display: 'block' }} />
          </Link>

          <span className="mnav-rule" aria-hidden="true" style={{ width: '1px', height: '22px', background: 'rgba(24,28,36,.12)', flexShrink: 0 }} />

          <div className="mnav-links" style={{ display: 'flex', alignItems: 'center', gap: '22px', fontSize: '14px', fontWeight: 500, color: '#4A4F58', whiteSpace: 'nowrap' }}>
            {nav.links.map((link) => {
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

        {/* Right capsule: log in, then the audience CTA */}
        <div style={{ ...capsule, paddingLeft: '22px', paddingRight: '8px', gap: '16px' }}>
          <Link className="mnav-login" href={nav.login.href} style={{ fontSize: '14px', fontWeight: 600, color: '#181C24', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {nav.login.label}
          </Link>

          <span className="mnav-rule" aria-hidden="true" style={{ width: '1px', height: '22px', background: 'rgba(24,28,36,.12)', flexShrink: 0 }} />

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
