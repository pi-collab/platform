'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import SignOutButton from '@/components/SignOutButton'
import { useRealtimeNotifications } from '@/lib/realtime/useRealtimeNotifications'

const NAV_PILLS = [
  { label: 'Dashboard', href: '/creator/dashboard' },
  { label: 'Inbox', href: '/creator/inbox' },
  { label: 'Deals', href: '/creator/deals' },
  { label: 'Payments', href: '/creator/payments' },
]

const ALL_MOBILE_LINKS = [
  { label: 'Dashboard', href: '/creator/dashboard' },
  { label: 'Inbox', href: '/creator/inbox' },
  { label: 'Deals', href: '/creator/deals' },
  { label: 'Payments', href: '/creator/payments' },
  { label: 'Notifications', href: '/creator/notifications' },
  { label: 'Storefront', href: '/creator/storefront' },
]

export default function CreatorSidebar({ creatorName, creatorPhoto, unreadCount: initialUnread = 0 }: { creatorName: string; creatorPhoto?: string | null; unreadCount?: number }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const avatarRef = useRef<HTMLDivElement>(null)
  const unreadCount = useRealtimeNotifications(initialUnread)

  const initials = creatorName ? creatorName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'CR'

  useEffect(() => {
    if (!avatarOpen) return
    function handleClick(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setAvatarOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [avatarOpen])

  useEffect(() => { setDrawerOpen(false); setAvatarOpen(false) }, [pathname])

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      {/* ── Desktop top nav ──────────────────────────── */}
      <header className="creator-topnav-desktop">
        <nav style={navBar}>
          {/* Left: logo */}
          <Link href="/creator/dashboard" style={logoLink}>
            <span style={logoIcon}>g</span>
            <span style={logoText}>guapd</span>
          </Link>

          {/* Center: nav pills */}
          <div style={navPillsWrap}>
            {NAV_PILLS.map((link) => {
              const active = isActive(link.href)
              return (
                <Link key={link.href} href={link.href} style={active ? navPillActive : navPillInactive}>
                  {link.label}
                </Link>
              )
            })}
          </div>

          {/* Right: bell + avatar */}
          <div style={rightGroup}>
            {/* Bell */}
            <Link href="/creator/notifications" style={bellBtn} title="Notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
              {unreadCount > 0 && <span style={bellBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </Link>

            {/* Avatar dropdown */}
            <div ref={avatarRef} style={{ position: 'relative' }}>
              <button onClick={() => setAvatarOpen(!avatarOpen)} style={avatarBtnStyle} aria-label="Account menu">
                <span style={avatarCircle}>{initials}</span>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13 }}>{creatorName}</div>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--wg-500)', letterSpacing: '0.04em' }}>Creator</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {avatarOpen && (
                <div style={dropdown}>
                  <div style={dropdownHead}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{creatorName}</p>
                    <span style={{ fontSize: 11, color: 'var(--wg-500)' }}>Creator</span>
                  </div>
                  <Link href="/creator/storefront" style={dropdownLink}>Storefront</Link>
                  <div style={{ padding: '4px 14px 10px' }}><SignOutButton redirectTo="/login/creator" /></div>
                </div>
              )}
            </div>
          </div>
        </nav>
      </header>

      {/* ── Mobile top bar ────────────────────────────── */}
      <header className="creator-topbar-mobile">
        <button onClick={() => setDrawerOpen(!drawerOpen)} style={hamburgerBtn} aria-label="Menu">
          <span style={hamLine} /><span style={{ ...hamLine, marginTop: 4 }} /><span style={{ ...hamLine, marginTop: 4 }} />
        </button>
        <Link href="/creator/dashboard" style={{ ...logoTextStyle, fontSize: 16, textDecoration: 'none' }}>guapd</Link>
        <Link href="/creator/notifications" style={{ position: 'relative', padding: 4, color: 'var(--ink)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          {unreadCount > 0 && <span style={bellBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
        </Link>
      </header>

      {/* ── Mobile drawer ─────────────────────────────── */}
      {drawerOpen && (
        <>
          <div className="creator-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <div className="creator-drawer">
            <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(26,27,22,0.08)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--sec-2)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{initials}</div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{creatorName}</p>
                <span style={{ fontSize: 11, color: 'var(--wg-500)' }}>Creator</span>
              </div>
            </div>
            <nav style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
              {ALL_MOBILE_LINKS.map((link) => {
                const active = isActive(link.href)
                return (
                  <Link key={link.href} href={link.href} onClick={() => setDrawerOpen(false)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    fontSize: 14, fontWeight: active ? 700 : 500,
                    color: active ? 'var(--ink)' : 'var(--wg-600)', textDecoration: 'none', borderRadius: 10,
                    background: active ? 'var(--lime-400)' : 'transparent',
                  }}>
                    {link.label}
                    {link.href === '/creator/notifications' && unreadCount > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--red)', borderRadius: 999, padding: '1px 6px', marginLeft: 'auto' }}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>
            <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(26,27,22,0.08)' }}><SignOutButton redirectTo="/login/creator" /></div>
          </div>
        </>
      )}

      <style>{`
        .creator-topnav-desktop { display: none; }
        .creator-topbar-mobile {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 16px; height: 56px;
          background: #F7F7F4;
          border-bottom: 1px solid rgba(26,27,22,0.06);
          position: sticky; top: 0; z-index: 40;
        }
        .creator-drawer-backdrop { position: fixed; inset: 0; background: rgba(26,27,22,0.4); z-index: 99; }
        .creator-drawer {
          position: fixed; top: 0; left: 0; bottom: 0; width: 280px;
          background: #F7F7F4; z-index: 100; overflow-y: auto;
          display: flex; flex-direction: column;
        }
        @media (min-width: 768px) {
          .creator-topnav-desktop {
            display: block; padding: 16px clamp(14px, 4vw, 28px) 0;
            position: sticky; top: 0; z-index: 30;
            background: #F7F7F4;
          }
          .creator-topbar-mobile { display: none; }
        }
      `}</style>
    </>
  )
}

/* ── Style constants ── */

const navBar: React.CSSProperties = {
  position: 'relative',
  maxWidth: 1080,
  margin: '0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'clamp(12px, 2vw, 22px)',
  padding: '12px 12px 12px 20px',
  borderRadius: 999,
  background: 'var(--card)',
  boxShadow: 'rgba(90,88,50,0.05) 0px 1px 2px, rgba(90,88,50,0.28) 0px 10px 24px -12px, rgba(90,88,50,0.2) 0px 30px 60px -30px',
}

const logoLink: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--ink)', flexShrink: 0,
}

const logoIcon: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 8, background: 'var(--lime-400)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--lime-950)',
}

const logoText: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em',
}

const logoTextStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display, var(--font-sora), system-ui, sans-serif)',
  fontSize: 18, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em',
}

const navPillsWrap: React.CSSProperties = {
  position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
  display: 'flex', alignItems: 'center', gap: 'clamp(36px, 4vw, 60px)',
  fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap',
}

const navPillActive: React.CSSProperties = {
  color: 'var(--lime-950)', fontWeight: 700,
  background: 'var(--lime-400)', border: '1px solid transparent',
  padding: '9px 22px', borderRadius: 999,
  boxShadow: 'rgba(180,215,50,0.85) 0px 8px 16px -8px',
  textDecoration: 'none',
}

const navPillInactive: React.CSSProperties = {
  color: 'var(--wg-600)', textDecoration: 'none',
}

const rightGroup: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
}

const bellBtn: React.CSSProperties = {
  position: 'relative', width: 40, height: 40, flexShrink: 0,
  borderRadius: '50%', border: '1px solid var(--line)', background: 'var(--card)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  textDecoration: 'none',
}

const bellBadge: React.CSSProperties = {
  position: 'absolute', top: -2, right: -2,
  minWidth: 18, height: 18, padding: '0 4px',
  borderRadius: 9, background: 'var(--red)', color: 'var(--card)',
  fontFamily: 'var(--font-ui)', fontSize: 10.5, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: '2px solid var(--paper)',
}

const avatarBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, whiteSpace: 'nowrap',
  padding: '5px 12px 5px 6px', borderRadius: 999,
  border: '1px solid var(--line)', background: 'rgba(255,255,255,0.6)',
  cursor: 'pointer',
}

const avatarCircle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 9, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12.5,
  color: 'var(--ink)', background: 'var(--sec-2)',
}

const dropdown: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 200,
  background: 'var(--card)', borderRadius: 14,
  boxShadow: 'rgba(26,27,22,0.08) 0px 0px 0px 1px, rgba(40,45,25,0.2) 0px 20px 48px -30px',
  overflow: 'hidden', zIndex: 50,
}

const dropdownHead: React.CSSProperties = {
  padding: '12px 14px', borderBottom: '1px solid rgba(26,27,22,0.06)',
}

const dropdownLink: React.CSSProperties = {
  display: 'block', padding: '8px 14px', fontSize: 14, color: 'var(--wg-600)', textDecoration: 'none',
}

const hamburgerBtn: React.CSSProperties = {
  background: 'none', border: 'none', padding: 6, cursor: 'pointer',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
}

const hamLine: React.CSSProperties = {
  display: 'block', width: 18, height: 2, background: 'var(--ink)', borderRadius: 1,
}
