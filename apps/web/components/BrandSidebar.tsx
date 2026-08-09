'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import SignOutButton from '@/components/SignOutButton'
import { useRealtimeNotifications } from '@/lib/realtime/useRealtimeNotifications'

const NAV_LINKS = [
  { label: 'Dashboard', href: '/dashboard', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></svg> },
  { label: 'Deals', href: '/deals', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg> },
  { label: 'Campaigns', href: '/campaigns', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg> },
]

const ALL_MOBILE_LINKS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Deals', href: '/deals' },
  { label: 'Campaigns', href: '/campaigns' },
  { label: 'Browse Creators', href: '/browse' },
  { label: 'Inbox', href: '/inbox' },
  { label: 'Notifications', href: '/notifications' },
  { label: 'Settings', href: '/settings' },
]

interface NotifItem {
  id: string
  deal_id: string | null
  type: string
  body: string
  read_at: string | null
  created_at: string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'NOW'
  if (mins < 60) return `${mins}M AGO`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}H AGO`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'YESTERDAY'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

const NOTIF_GRADS = [
  'linear-gradient(135deg,#E9E2FF,#DEF0FF)',
  'linear-gradient(135deg,#FFEEE2,#FFE1EC)',
  'linear-gradient(135deg,#D6F0F5,#E8FAFC)',
  'linear-gradient(135deg,#E8F5E0,#F0FFD6)',
  'linear-gradient(135deg,#FFE0EC,#F5E0E8)',
  'linear-gradient(135deg,#F5EDE0,#FFF8E6)',
]

function nameToGradIndex(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  return Math.abs(hash) % NOTIF_GRADS.length
}

interface NotifCreatorMap {
  [dealId: string]: { name: string; photo: string | null }
}

export default function BrandSidebar({ brandName, unreadCount: initialUnread = 0, unreadInbox = 0, recentNotifications = [], notifCreatorMap = {} }: { brandName: string | null; unreadCount?: number; unreadInbox?: number; recentNotifications?: NotifItem[]; notifCreatorMap?: NotifCreatorMap }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const avatarRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const unreadCount = useRealtimeNotifications(initialUnread)

  const initials = brandName ? brandName.slice(0, 2).toUpperCase() : 'BR'

  useEffect(() => {
    if (!avatarOpen) return
    function handleClick(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setAvatarOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [avatarOpen])

  useEffect(() => {
    if (!notifOpen) return
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [notifOpen])

  useEffect(() => { setDrawerOpen(false); setAvatarOpen(false); setNotifOpen(false) }, [pathname])

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      {/* ── Desktop top nav ──────────────────────────── */}
      <header className="brand-topnav-desktop">
        <nav style={navBar}>
          {/* Left: logo */}
          <Link href="/dashboard" style={logoLink}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><defs><radialGradient id="lg" cx="40%" cy="35%" r="55%"><stop offset="0%" stopColor="#F4FFB0" /><stop offset="100%" stopColor="#D4EE2C" /></radialGradient></defs><circle cx="12" cy="12" r="10" fill="url(#lg)" /></svg>
            <span style={logoText}>guapd</span>
          </Link>

          {/* Center: nav links + browse pill */}
          <div style={navLinksWrap}>
            {NAV_LINKS.map((link) => {
              const active = isActive(link.href)
              return (
                <Link key={link.href} href={link.href} style={active ? {
                  ...navLinkStyle, color: 'var(--ink)', fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  background: 'var(--neon)', padding: '7px 14px', borderRadius: 'var(--radius-pill)',
                  boxShadow: '0 6px 16px -8px rgba(180,210,60,.95)',
                } : {
                  ...navLinkStyle, color: 'var(--ink-soft)',
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                }}>
                  {link.icon}{link.label}
                </Link>
              )
            })}
            {(() => {
              const browseActive = isActive('/browse')
              return (
                <Link href="/browse" style={browseActive ? {
                  color: 'var(--ink)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 7,
                  whiteSpace: 'nowrap', flexShrink: 0,
                  background: 'var(--neon)', padding: '7px 14px', borderRadius: 'var(--radius-pill)',
                  boxShadow: '0 6px 16px -8px rgba(180,210,60,.95)',
                  textDecoration: 'none', fontFamily: 'var(--font-ui)', fontSize: 14,
                } : {
                  ...navLinkStyle, color: 'var(--ink-soft)',
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={browseActive ? 'var(--ink)' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                  Browse creators
                </Link>
              )
            })()}
          </div>

          {/* Right: inbox + bell + avatar */}
          <div style={rightGroup}>
            {/* Inbox / Messages */}
            <Link href="/inbox" style={iconBtnStyle} title="Inbox">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              {unreadInbox > 0 && <span style={neonBadge}>{unreadInbox > 99 ? '99+' : unreadInbox}</span>}
            </Link>

            {/* Bell / Notifications */}
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button onClick={() => setNotifOpen(!notifOpen)} style={iconBtnStyle} title="Notifications">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                {unreadCount > 0 && <span style={neonBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </button>
              {notifOpen && (
                <div style={notifDropdown}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--ink)', letterSpacing: '-0.01em' }}>Notifications</span>
                    {unreadCount > 0 && (
                      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--ink)', background: 'var(--neon)', borderRadius: 6, padding: '3px 8px' }}>
                        {unreadCount} NEW
                      </span>
                    )}
                  </div>

                  {/* Notification list */}
                  <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                    {recentNotifications.length === 0 ? (
                      <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--ink-faint)', fontSize: 13, fontFamily: 'var(--font-ui)' }}>
                        No notifications yet
                      </div>
                    ) : (
                      recentNotifications.map((n) => {
                        const isUnread = !n.read_at
                        const creatorInfo = n.deal_id ? notifCreatorMap[n.deal_id] : undefined
                        const avatarName = creatorInfo?.name || 'Guapd'
                        const initials = getInitials(avatarName)
                        const grad = NOTIF_GRADS[nameToGradIndex(avatarName)]
                        const href = n.deal_id ? `/deals/${n.deal_id}` : '/notifications'
                        return (
                          <Link
                            key={n.id}
                            href={href}
                            onClick={() => setNotifOpen(false)}
                            style={{
                              display: 'flex', alignItems: 'flex-start', gap: 12,
                              padding: '12px 18px', textDecoration: 'none',
                              background: isUnread ? 'rgba(232,255,102,.08)' : 'transparent',
                              borderTop: '1px solid #F2F2ED',
                              transition: 'background .12s ease',
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(232,255,102,.14)' }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isUnread ? 'rgba(232,255,102,.08)' : 'transparent' }}
                          >
                            {/* Avatar */}
                            {creatorInfo?.photo ? (
                              <img src={creatorInfo.photo} alt={avatarName} style={{
                                width: 36, height: 36, borderRadius: 10, flexShrink: 0, objectFit: 'cover',
                                border: '1px solid rgba(255,255,255,.85)',
                              }} />
                            ) : (
                              <div style={{
                                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: grad, fontSize: 12, fontWeight: 700, color: 'var(--ink)',
                                fontFamily: 'var(--font-display)',
                                border: '1px solid rgba(255,255,255,.85)',
                              }}>
                                {initials}
                              </div>
                            )}
                            {/* Body + time */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{
                                margin: 0, fontSize: 13, lineHeight: 1.45, color: 'var(--ink)',
                                fontFamily: 'var(--font-ui)', fontWeight: isUnread ? 600 : 400,
                                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                              }}>
                                {n.body}
                              </p>
                              <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', color: '#9EA096', marginTop: 3, display: 'block' }}>
                                {timeAgo(n.created_at)}
                              </span>
                            </div>
                            {/* Unread dot */}
                            {isUnread && (
                              <div style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--neon-deep)', flexShrink: 0, marginTop: 6 }} />
                            )}
                          </Link>
                        )
                      })
                    )}
                  </div>

                  {/* Footer */}
                  <Link
                    href="/notifications"
                    onClick={() => setNotifOpen(false)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '13px 18px', borderTop: '1px solid #EAEAE3',
                      fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', textDecoration: 'none',
                      fontFamily: 'var(--font-ui)',
                    }}
                  >
                    See all notifications
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                  </Link>
                </div>
              )}
            </div>

            {/* Avatar dropdown */}
            <div ref={avatarRef} style={{ position: 'relative' }}>
              <button onClick={() => setAvatarOpen(!avatarOpen)} style={avatarBtn} aria-label="Account menu">
                <span style={avatarSquare}>{initials}</span>
                <div className="profile-meta" style={{ lineHeight: 1.15 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{brandName || 'Brand'}</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ink-faint)', fontSize: 11, fontWeight: 500 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--neon-deep)' }} />
                    Brand
                  </div>
                </div>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: 2 }}><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {avatarOpen && (
                <div style={dropdown}>
                  <div style={dropdownHead}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1b16', margin: 0 }}>{brandName || 'Brand'}</p>
                    <span style={{ fontSize: 11, color: '#6a6c5f' }}>Brand</span>
                  </div>
                  <Link href="/settings" style={dropdownLink}>Settings</Link>
                  <div style={{ padding: '4px 14px 10px' }}><SignOutButton /></div>
                </div>
              )}
            </div>
          </div>
        </nav>
      </header>

      {/* ── Mobile top bar ────────────────────────────── */}
      <header className="brand-topbar-mobile">
        <button onClick={() => setDrawerOpen(!drawerOpen)} style={hamburgerBtn} aria-label="Menu">
          <span style={hamLine} /><span style={{ ...hamLine, marginTop: 4 }} /><span style={{ ...hamLine, marginTop: 4 }} />
        </button>
        <Link href="/dashboard" style={{ ...logoText, fontSize: 16, textDecoration: 'none' }}>guapd</Link>
        <Link href="/notifications" style={{ position: 'relative', padding: 4, color: '#1a1b16' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          {unreadCount > 0 && <span style={bellBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
        </Link>
      </header>

      {/* ── Mobile drawer ─────────────────────────────── */}
      {drawerOpen && (
        <>
          <div className="brand-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <div className="brand-drawer">
            <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(26,27,22,0.08)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 999, background: '#1a1b16', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{initials}</div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1b16', margin: 0 }}>{brandName || 'Brand'}</p>
                <span style={{ fontSize: 11, color: '#6a6c5f' }}>Brand</span>
              </div>
            </div>
            <nav style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
              {ALL_MOBILE_LINKS.map((link) => {
                const active = isActive(link.href)
                return (
                  <Link key={link.href} href={link.href} onClick={() => setDrawerOpen(false)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    fontSize: 14, fontWeight: active ? 700 : 500,
                    color: active ? '#1a1b16' : '#5a5c50', textDecoration: 'none', borderRadius: 10,
                    background: active ? '#E8FF66' : 'transparent',
                  }}>
                    {link.label}
                    {link.href === '/notifications' && unreadCount > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#d2545a', borderRadius: 999, padding: '1px 6px', marginLeft: 'auto' }}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>
            <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(26,27,22,0.08)' }}><SignOutButton /></div>
          </div>
        </>
      )}

      <style>{`
        @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-33.33%); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .brand-topnav-desktop { display: none; }
        .brand-topbar-mobile {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 16px; height: 56px;
          background: #F7F7F4;
          border-bottom: 1px solid rgba(26,27,22,0.06);
          position: sticky; top: 0; z-index: 40;
        }
        .brand-drawer-backdrop { position: fixed; inset: 0; background: rgba(26,27,22,0.4); z-index: 99; }
        .brand-drawer {
          position: fixed; top: 0; left: 0; bottom: 0; width: 280px;
          background: #F7F7F4; z-index: 100; overflow-y: auto;
          display: flex; flex-direction: column;
        }
        @media (min-width: 768px) {
          .brand-topnav-desktop {
            display: block; padding: 14px clamp(14px, 4vw, 28px) 0;
            position: sticky; top: 0; z-index: 30;
            background: #F7F7F4;
          }
          .brand-topbar-mobile { display: none; }
        }
      `}</style>
    </>
  )
}

/* ── Style constants ── */

const navBar: React.CSSProperties = {
  position: 'relative',
  maxWidth: 1280,
  margin: '0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'clamp(14px, 2.4vw, 26px)',
  padding: '9px 12px 9px 20px',
  borderRadius: 'var(--radius-pill)',
  border: '1px solid #EAEAE3',
  background: '#FFFFFF',
  boxShadow: '0 8px 28px -18px rgba(40,45,25,.3)',
}

const logoLink: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--ink)', flexShrink: 0,
}

const logoText: React.CSSProperties = {
  fontFamily: 'var(--font-display), system-ui, sans-serif',
  fontSize: 19, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em',
}

const navLinksWrap: React.CSSProperties = {
  display: 'flex', alignItems: 'center', flex: '0 0 auto',
  justifyContent: 'center',
  gap: 'clamp(10px, 1.6vw, 22px)',
  fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 500,
  color: 'var(--ink-soft)', whiteSpace: 'nowrap',
}

const navLinkStyle: React.CSSProperties = {
  textDecoration: 'none', fontSize: 14, fontWeight: 500,
}

const rightGroup: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
}

const iconBtnStyle: React.CSSProperties = {
  position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 38, height: 38, borderRadius: 12, border: '1px solid #EAEAE3', background: 'transparent',
  cursor: 'pointer', fontFamily: 'inherit',
}

const notifDropdown: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 340,
  background: '#fff', borderRadius: 16,
  boxShadow: '0 26px 52px -24px rgba(40,52,70,.5), 0 0 0 1px rgba(26,27,22,.06)',
  overflow: 'hidden', zIndex: 50,
  animation: 'fadeUp .16s cubic-bezier(.22,1,.36,1)',
}

const neonBadge: React.CSSProperties = {
  position: 'absolute', top: -2, right: -2,
  fontSize: 9, fontWeight: 700, color: 'var(--ink)', background: 'var(--neon)',
  borderRadius: 999, padding: '1px 5px', lineHeight: 1.3, minWidth: 14, textAlign: 'center',
}

const bellBadge: React.CSSProperties = {
  position: 'absolute', top: -2, right: -2,
  fontSize: 9, fontWeight: 700, color: 'var(--ink)', background: 'var(--neon)',
  borderRadius: 999, padding: '1px 5px', lineHeight: 1.3, minWidth: 14, textAlign: 'center',
}

const avatarBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '5px 12px 5px 5px',
  borderRadius: 'var(--radius-pill)',
  background: '#fff', border: '1px solid #EAEAE3',
  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
}

const avatarSquare: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 9, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12.5,
  color: 'var(--ink)',
  background: '#EEEDEA',
  border: '1px solid #E0DFD9',
}

const dropdown: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 200,
  background: '#fff', borderRadius: 14,
  boxShadow: 'rgba(26,27,22,0.08) 0px 0px 0px 1px, rgba(40,45,25,0.2) 0px 20px 48px -30px',
  overflow: 'hidden', zIndex: 50,
}

const dropdownHead: React.CSSProperties = {
  padding: '12px 14px', borderBottom: '1px solid rgba(26,27,22,0.06)',
}

const dropdownLink: React.CSSProperties = {
  display: 'block', padding: '8px 14px', fontSize: 14, color: '#5a5c50', textDecoration: 'none',
}

const hamburgerBtn: React.CSSProperties = {
  background: 'none', border: 'none', padding: 6, cursor: 'pointer',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
}

const hamLine: React.CSSProperties = {
  display: 'block', width: 18, height: 2, background: '#1a1b16', borderRadius: 1,
}
