'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import SignOutButton from '@/components/SignOutButton'

const NAV_LINKS = [
  {
    label: 'Dashboard', href: '/dashboard',
    icon: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>,
  },
  {
    label: 'Deals', href: '/deals',
    icon: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
  },
  {
    label: 'Inbox', href: '/inbox',
    icon: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  },
  {
    label: 'Notifications', href: '/notifications',
    icon: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
  },
  {
    label: 'Browse Creators', href: '/browse',
    icon: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  },
]

export default function BrandSidebar({ brandName, unreadCount = 0 }: { brandName: string | null; unreadCount?: number }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const initials = brandName ? brandName.slice(0, 2).toUpperCase() : 'BR'

  const nav = (
    <>
      {/* Brand profile */}
      <div style={{ padding: '1.25rem 1rem 1rem', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        <div style={avatarStyle}>{initials}</div>
        <div>
          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111', margin: 0 }}>{brandName || 'Brand'}</p>
          <span style={badgeStyle}>Brand</span>
        </div>
      </div>

      {/* Links */}
      <nav style={{ padding: '0.5rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.125rem', flex: 1 }}>
        {NAV_LINKS.map((link) => {
          const active = pathname === link.href || pathname.startsWith(link.href + '/')
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                padding: '0.5rem 0.75rem',
                fontSize: '0.875rem',
                fontWeight: active ? 600 : 400,
                color: active ? '#111' : '#666',
                textDecoration: 'none',
                borderRadius: 8,
                background: active ? '#f5f5f0' : 'transparent',
              }}
            >
              {link.icon(active ? '#111' : '#888')}
              {link.label}
              {link.href === '/notifications' && unreadCount > 0 && (
                <span style={notifBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #e5e5e5' }}>
        <SignOutButton />
      </div>
    </>
  )

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────── */}
      <aside className="brand-sidebar-desktop">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {nav}
        </div>
      </aside>

      {/* ── Mobile top bar ────────────────────────────── */}
      <header className="brand-topbar-mobile">
        <button onClick={() => setOpen(!open)} style={hamburgerBtn} aria-label="Menu">
          <span style={{ display: 'block', width: 18, height: 2, background: '#111', borderRadius: 1 }} />
          <span style={{ display: 'block', width: 18, height: 2, background: '#111', borderRadius: 1, marginTop: 4 }} />
          <span style={{ display: 'block', width: 18, height: 2, background: '#111', borderRadius: 1, marginTop: 4 }} />
        </button>
        <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111' }}>Guapd</span>
        <Link href="/notifications" style={{ position: 'relative', padding: '0.25rem' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          {unreadCount > 0 && <span style={mobileBellBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
        </Link>
      </header>

      {/* ── Mobile drawer ─────────────────────────────── */}
      {open && (
        <>
          <div className="brand-drawer-backdrop" onClick={() => setOpen(false)} />
          <div className="brand-drawer">
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {nav}
            </div>
          </div>
        </>
      )}

      <style>{`
        .brand-sidebar-desktop { display: none; }
        .brand-topbar-mobile {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.625rem 1rem; border-bottom: 1px solid #e5e5e5;
          background: #fff; position: sticky; top: 0; z-index: 40;
        }
        .brand-drawer-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 99; }
        .brand-drawer {
          position: fixed; top: 0; left: 0; bottom: 0; width: 260px;
          background: #fff; border-right: 1px solid #e5e5e5; z-index: 100; overflow-y: auto;
        }
        @media (min-width: 768px) {
          .brand-sidebar-desktop {
            display: block; position: fixed; top: 0; left: 0; bottom: 0; width: 220px;
            background: #fff; border-right: 1px solid #e5e5e5; overflow-y: auto; z-index: 40;
          }
          .brand-topbar-mobile { display: none; }
        }
      `}</style>
    </>
  )
}

const avatarStyle: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 8,
  background: '#111', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
}

const badgeStyle: React.CSSProperties = {
  fontSize: '0.5625rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', padding: '0.1rem 0.375rem', borderRadius: 9999,
  background: '#f0f0f0', color: '#555',
}

const hamburgerBtn: React.CSSProperties = {
  background: 'none', border: 'none', padding: '0.375rem',
  cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center',
}

const notifBadge: React.CSSProperties = {
  fontSize: '0.625rem', fontWeight: 700, color: '#fff', background: '#dc2626',
  borderRadius: 9999, padding: '0.05rem 0.35rem', marginLeft: 'auto', lineHeight: 1.4,
}

const mobileBellBadge: React.CSSProperties = {
  position: 'absolute', top: -2, right: -4,
  fontSize: '0.5625rem', fontWeight: 700, color: '#fff', background: '#dc2626',
  borderRadius: 9999, padding: '0.05rem 0.3rem', lineHeight: 1.3, minWidth: 14, textAlign: 'center',
}
