'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import SignOutButton from '@/components/SignOutButton'

/**
 * The ops top bar for the brand-styled ops screens (Experiences).
 *
 * A transcription of the brand portal's desktop nav (components/BrandSidebar,
 * "Brand top nav"): white pill bar with a hairline border and soft shadow, the
 * lime logo dot, neon active link. Not BrandNav itself: that reads the signed-in
 * user's brand membership and links to brand routes. Kept presentational: the
 * gate is the layout's and each page's job, never this component's.
 */
const LINKS = [
  { href: '/ops/experiences', label: 'Experiences' },
]

export default function OpsTopBar({ email }: { email: string | null }) {
  const pathname = usePathname() ?? ''
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <header className="ops-topnav">
      <nav style={navBar}>
        <Link href="/ops/experiences" style={logoLink}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden><defs><radialGradient id="opslg" cx="40%" cy="35%" r="55%"><stop offset="0%" stopColor="#F4FFB0" /><stop offset="100%" stopColor="#D4EE2C" /></radialGradient></defs><circle cx="12" cy="12" r="10" fill="url(#opslg)" /></svg>
          <span style={logoText}>guapd</span>
          <span style={opsTag}>Ops</span>
        </Link>

        <div style={linksWrap}>
          {LINKS.map((l) => isActive(l.href) ? (
            <Link key={l.href} href={l.href} style={{ ...linkStyle, color: 'var(--ink)', fontWeight: 600, background: 'var(--neon)', padding: '7px 14px', borderRadius: 'var(--radius-pill)', boxShadow: '0 6px 16px -8px rgba(180,210,60,.95)' }}>{l.label}</Link>
          ) : (
            <Link key={l.href} href={l.href} style={{ ...linkStyle, color: 'var(--ink-soft)' }}>{l.label}</Link>
          ))}
          <Link href="/ops" style={{ ...linkStyle, color: 'var(--ink-soft)' }}>Ops console</Link>
        </div>

        <div style={rightGroup}>
          {email && <span className="ops-topnav__email" style={emailStyle}>{email}</span>}
          <SignOutButton redirectTo="/login/brand" className="ops-topnav__signout" />
        </div>
      </nav>
      <style>{`
        .ops-topnav { padding: 14px clamp(16px, 4vw, 28px) 0; position: sticky; top: 0; z-index: 30; background: #F7F7F4; }
        .ops-topnav__signout {
          height: 38px; padding: 0 16px; border-radius: 999px; border: 1px solid #EAEAE3; background: transparent;
          font-family: var(--font-ui); font-size: 13px; font-weight: 600; color: var(--ink); cursor: pointer;
        }
        .ops-topnav__signout:hover { background: #F7F7F4; }
        @media (max-width: 640px) { .ops-topnav__email { display: none; } }
      `}</style>
    </header>
  )
}

const navBar: React.CSSProperties = {
  maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 'clamp(12px, 2.4vw, 26px)', flexWrap: 'wrap', padding: '9px 12px 9px 20px',
  borderRadius: 'var(--radius-pill)', border: '1px solid #EAEAE3', background: '#FFFFFF',
  boxShadow: '0 8px 28px -18px rgba(40,45,25,.3)',
}
const logoLink: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--ink)', flexShrink: 0 }
const logoText: React.CSSProperties = { fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 19, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }
const opsTag: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--ink)', background: 'var(--neon)', borderRadius: 6, padding: '3px 7px',
}
const linksWrap: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 'clamp(10px, 1.6vw, 22px)', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }
const linkStyle: React.CSSProperties = { textDecoration: 'none', fontSize: 14, fontWeight: 500, display: 'inline-flex', alignItems: 'center' }
const rightGroup: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }
const emailStyle: React.CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--wg-500)' }
