'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BRAND_NAME, nav } from '@/lib/content'

interface NavProps {
  /** Which CTA to show in the top-right. Defaults to brandCta. */
  audience?: 'brand' | 'creator' | 'none'
}

export default function Nav({ audience = 'brand' }: NavProps) {
  const [open, setOpen] = useState(false)

  const cta = audience === 'creator' ? nav.creatorCta : nav.brandCta

  return (
    <>
      <nav className="nav">
        <div className="nav__inner">
          <Link href="/" className="nav__logo">
            {BRAND_NAME}
          </Link>

          {/* Desktop links */}
          <div className="nav__links">
            {nav.links.map((link) => (
              <Link key={link.href} href={link.href} className="nav__link">
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop actions */}
          <div className="nav__actions">
            <Link href={nav.login.href} className="nav__login">
              {nav.login.label}
            </Link>
            {audience !== 'none' && (
              <Link href={cta.href} className="btn btn--primary btn--sm">
                {cta.label}
              </Link>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className={`nav__hamburger${open ? ' open' : ''}`}
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            <span className="nav__hamburger-bar" />
            <span className="nav__hamburger-bar" />
            <span className="nav__hamburger-bar" />
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <div
        className={`nav__drawer${open ? ' open' : ''}`}
        aria-hidden={!open}
      >
        {nav.links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="nav__drawer-link"
            onClick={() => setOpen(false)}
          >
            {link.label}
          </Link>
        ))}

        <div className="nav__drawer-divider" />

        <div className="nav__drawer-cta">
          <Link href={nav.login.href} className="btn btn--ghost" onClick={() => setOpen(false)}>
            {nav.login.label}
          </Link>
          {audience !== 'none' && (
            <Link href={cta.href} className="btn btn--primary" onClick={() => setOpen(false)}>
              {cta.label}
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
