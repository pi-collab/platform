'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { nav } from '@/lib/content'
import Logo from '@/components/Logo'

interface NavProps {
  /** Which CTA to show in the top-right. Defaults to brandCta. */
  audience?: 'brand' | 'creator' | 'none'
}

export default function Nav({ audience = 'brand' }: NavProps) {
  const [open, setOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [ctaOpen, setCtaOpen] = useState(false)
  const loginRef = useRef<HTMLDivElement>(null)
  const ctaRef = useRef<HTMLDivElement>(null)

  const cta = audience === 'creator' ? nav.creatorCta : nav.brandCta

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (loginRef.current && !loginRef.current.contains(e.target as Node)) {
        setLoginOpen(false)
      }
      if (ctaRef.current && !ctaRef.current.contains(e.target as Node)) {
        setCtaOpen(false)
      }
    }
    if (loginOpen || ctaOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [loginOpen, ctaOpen])

  return (
    <>
      <nav className="nav">
        <div className="nav__inner">
          <Link href="/" className="nav__logo">
            <Logo size={34} />
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
            <div ref={loginRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setLoginOpen(!loginOpen)}
                className="nav__login"
                style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit', padding: 0 }}
              >
                {nav.login.label} ▾
              </button>
              {loginOpen && (
                <div style={dropdownStyle}>
                  <Link
                    href="/login/creator"
                    style={dropdownItemStyle}
                    onClick={() => setLoginOpen(false)}
                  >
                    Creator login
                  </Link>
                  <Link
                    href="/login/brand"
                    style={dropdownItemStyle}
                    onClick={() => setLoginOpen(false)}
                  >
                    Brand login
                  </Link>
                  <Link
                    href="/ops"
                    style={{ ...dropdownItemStyle, borderTop: '1px solid #e5e5e5', fontSize: '0.8125rem', color: '#888' }}
                    onClick={() => setLoginOpen(false)}
                  >
                    Ops
                  </Link>
                </div>
              )}
            </div>
            {audience === 'none' ? (
              <div ref={ctaRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setCtaOpen(!ctaOpen)}
                  className="btn btn--primary btn--sm"
                  style={{ cursor: 'pointer' }}
                >
                  Get access
                </button>
                {ctaOpen && (
                  <div style={dropdownStyle}>
                    <Link
                      href="/signup/creator"
                      style={dropdownItemStyle}
                      onClick={() => setCtaOpen(false)}
                    >
                      I&apos;m a creator
                    </Link>
                    <Link
                      href="/signup/brand"
                      style={dropdownItemStyle}
                      onClick={() => setCtaOpen(false)}
                    >
                      I&apos;m a brand
                    </Link>
                  </div>
                )}
              </div>
            ) : (
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
          <Link href="/login/creator" className="btn btn--ghost" onClick={() => setOpen(false)}>
            Creator login
          </Link>
          <Link href="/login/brand" className="btn btn--ghost" onClick={() => setOpen(false)}>
            Brand login
          </Link>
          <Link href="/ops" className="btn btn--ghost" style={{ fontSize: '0.8125rem', color: '#888' }} onClick={() => setOpen(false)}>
            Ops
          </Link>
          {audience === 'none' ? (
            <>
              <Link href="/signup/creator" className="btn btn--primary" onClick={() => setOpen(false)}>
                Join as creator
              </Link>
              <Link href="/signup/brand" className="btn btn--ghost" onClick={() => setOpen(false)}>
                Get access as a brand
              </Link>
            </>
          ) : (
            <Link href={cta.href} className="btn btn--primary" onClick={() => setOpen(false)}>
              {cta.label}
            </Link>
          )}
        </div>
      </div>
    </>
  )
}

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 0.5rem)',
  right: 0,
  background: '#fff',
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  minWidth: 160,
  zIndex: 100,
  overflow: 'hidden',
}

const dropdownItemStyle: React.CSSProperties = {
  display: 'block',
  padding: '0.625rem 1rem',
  fontSize: '0.875rem',
  fontWeight: 500,
  color: '#111',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}
