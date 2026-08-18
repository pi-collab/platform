'use client'

import Link from 'next/link'
import { nav } from '@/lib/content'

/**
 * The nav from the "For Brands" design export, using our own links and CTAs.
 *
 * The export's version pointed at in-page anchors (#brands, #login, "Book
 * demo") because it was a static mockup. The structure and styling here are the
 * design's; the destinations and labels are ours, from lib/content.ts, so the
 * header keeps working as navigation and stays in step if those change.
 *
 * The wrapper carries className="brands-page" because the design tokens
 * (--card, --ink-soft, --neon-deep, --radius-pill, --font-ui) and the .bp-btn
 * style are scoped to that class so they cannot leak into the rest of the site
 * — so the nav has to sit inside the scope to see them.
 *
 * Rendered only on /brands. The rest of the site still uses <Nav>, so the two
 * headers differ for now — worth reconciling once the other pages are ported.
 */
export default function BrandsNav() {
  return (
    <div
      className="brands-page"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        padding: '26px clamp(14px,4vw,28px) 0',
        // The class is here only for the tokens. It also carries the export's
        // body rule (background:#FFFFFF), which painted an opaque white band
        // across the top and hid the hero image that is supposed to show behind
        // and above the pill — that is what made the header look detached.
        background: 'transparent',
      }}
    >
      <nav
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '24px',
          padding: '8px 10px 8px 20px',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--card)',
          boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)',
        }}
      >
        <Link
          href="/"
          aria-label="Guapd home"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: 'var(--ink)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/guapd-wordmark.svg" alt="Guapd" style={{ height: '26px', width: 'auto', display: 'block' }} />
        </Link>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            fontFamily: 'var(--font-ui)',
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--ink-soft)',
            whiteSpace: 'nowrap',
          }}
        >
          {nav.links.map((link) => {
            // The dot marks the page you are on. This nav only renders on
            // /brands, so that is the one it marks.
            const current = link.href === '/brands'
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current ? 'page' : undefined}
                style={{
                  color: current ? 'var(--ink)' : 'var(--ink-soft)',
                  fontWeight: current ? 700 : 500,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                }}
              >
                {current && (
                  <span
                    aria-hidden="true"
                    style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--neon-deep)', flexShrink: 0 }}
                  />
                )}
                {link.label}
              </Link>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, whiteSpace: 'nowrap' }}>
          <Link
            href={nav.login.href}
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--ink)',
              textDecoration: 'none',
              padding: '0 4px',
            }}
          >
            {nav.login.label}
          </Link>
          <Link href={nav.brandCta.href} className="bp-btn">
            {nav.brandCta.label}
          </Link>
        </div>
      </nav>
    </div>
  )
}
