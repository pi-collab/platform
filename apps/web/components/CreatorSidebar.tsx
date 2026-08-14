'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeNotifications } from '@/lib/realtime/useRealtimeNotifications'

const NAV_PILLS: { label: string; href: string; icon: 'dashboard' | 'deals' | 'payments' | 'storefront' }[] = [
  { label: 'Dashboard', href: '/creator/dashboard', icon: 'dashboard' },
  { label: 'Deals', href: '/creator/deals', icon: 'deals' },
  { label: 'Payments', href: '/creator/payments', icon: 'payments' },
  { label: 'Storefront', href: '/creator/storefront', icon: 'storefront' },
]

const ALL_MOBILE_LINKS = [
  { label: 'Dashboard', href: '/creator/dashboard' },
  { label: 'Inbox', href: '/creator/inbox' },
  { label: 'Deals', href: '/creator/deals' },
  { label: 'Payments', href: '/creator/payments' },
  { label: 'Notifications', href: '/creator/notifications' },
  { label: 'Storefront', href: '/creator/storefront' },
  { label: 'Settings', href: '/creator/settings' },
]

interface NotifItem {
  id: string
  deal_id: string | null
  type: string
  body: string
  read_at: string | null
  created_at: string
}

interface NotifBrandMap {
  [dealId: string]: { name: string; photo: string | null }
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
  'linear-gradient(135deg,#F7F4FB,#F7F4FB)',
  'linear-gradient(135deg,#F7F4FB,#FFE0EC)',
  'linear-gradient(135deg,#F5EDE0,#FFF8E6)',
]

function nameToGradIndex(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  return Math.abs(hash) % NOTIF_GRADS.length
}

function Mascot({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 336 336" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M168 12C278 12 324 112 324 188C324 276 252 324 168 324C84 324 12 276 12 188C12 112 58 12 168 12Z" fill="#E8FF66" />
      <ellipse cx="114" cy="126" rx="54" ry="36" fill="#fff" opacity="0.55" />
      <ellipse cx="168" cy="188" rx="24" ry="10" fill="#fff" opacity="0.18" />
    </svg>
  )
}

function NavIcon({ icon, active }: { icon: 'dashboard' | 'deals' | 'payments' | 'storefront'; active: boolean }) {
  const stroke = active ? 'var(--ink)' : 'currentColor'
  if (icon === 'dashboard') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" />
      </svg>
    )
  }
  if (icon === 'deals') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="14" x="2" y="7" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    )
  }
  if (icon === 'storefront') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h20" /><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" /><path d="m7 21 5-5 5 5" />
      </svg>
    )
  }
  // payments
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  )
}

function InboxIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  )
}

export default function CreatorSidebar({ creatorName, creatorPhoto, userEmail, unreadCount: initialUnread = 0, recentNotifications = [], notifBrandMap = {} }: { creatorName: string; creatorPhoto?: string | null; userEmail?: string | null; unreadCount?: number; recentNotifications?: NotifItem[]; notifBrandMap?: NotifBrandMap }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const avatarRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const unreadCount = useRealtimeNotifications(initialUnread)

  const initials = creatorName ? creatorName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'CR'

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login/creator'
  }

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
      <header className="creator-topnav-desktop">
        <nav style={navBar}>
          {/* Left: mascot + wordmark */}
          <Link href="/creator/dashboard" style={logoLink}>
            <Mascot size={26} />
            <span className="g-wordmark" style={logoText}>guapd</span>
          </Link>

          {/* Center: nav pills with icons */}
          <div style={navPillsWrap}>
            {NAV_PILLS.map((link) => {
              const active = isActive(link.href)
              return (
                <Link key={link.href} href={link.href} style={active ? navPillActive : navPillInactive}>
                  <NavIcon icon={link.icon} active={active} />
                  {link.label}
                </Link>
              )
            })}
          </div>

          {/* Right: messages + bell + avatar */}
          <div style={rightGroup}>
            {/* Messages */}
            <Link href="/creator/inbox" style={iconBtn} title="Messages">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            </Link>

            {/* Bell / Notifications */}
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button onClick={() => setNotifOpen(!notifOpen)} style={bellBtn} title="Notifications">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                {unreadCount > 0 && <span style={bellBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </button>
              {notifOpen && (
                <div style={notifDropdown}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--ink)', letterSpacing: '-0.01em' }}>Notifications</span>
                    {unreadCount > 0 && (
                      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--ink)', background: 'var(--neon, var(--lime-400))', borderRadius: 6, padding: '3px 8px' }}>
                        {unreadCount} NEW
                      </span>
                    )}
                  </div>

                  {/* Notification list */}
                  <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                    {recentNotifications.length === 0 ? (
                      <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--ink-faint, var(--wg-500))', fontSize: 13, fontFamily: 'var(--font-ui)' }}>
                        No notifications yet
                      </div>
                    ) : (
                      recentNotifications.map((n) => {
                        const isUnread = !n.read_at
                        const brandInfo = n.deal_id ? notifBrandMap[n.deal_id] : undefined
                        const avatarName = brandInfo?.name || 'Guapd'
                        const avatarInitials = getInitials(avatarName)
                        const grad = NOTIF_GRADS[nameToGradIndex(avatarName)]
                        const href = n.deal_id ? `/creator/deals/${n.deal_id}` : '/creator/notifications'
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
                            <div style={{
                              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: grad, fontSize: 12, fontWeight: 700, color: 'var(--ink)',
                              fontFamily: 'var(--font-display)',
                              border: '1px solid rgba(255,255,255,.85)',
                            }}>
                              {avatarInitials}
                            </div>
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
                              <div style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--neon-deep, var(--lime-600))', flexShrink: 0, marginTop: 6 }} />
                            )}
                          </Link>
                        )
                      })
                    )}
                  </div>

                  {/* Footer */}
                  <Link
                    href="/creator/notifications"
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
              <button onClick={() => setAvatarOpen(!avatarOpen)} style={avatarBtnStyle} aria-label="Account menu">
                <span style={avatarSquare}>{initials}</span>
                <div style={{ lineHeight: 1.15 }}>
                  <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{creatorName}</div>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 9.5, fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-faint)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--neon-deep)' }} />
                    Creator
                  </div>
                </div>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: 2, transform: 'rotate(180deg)' }}><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {avatarOpen && (
                <div className="pmenu" style={dropdown}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 14px' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--ink)', background: 'linear-gradient(135deg,var(--sec-2),var(--sec-2))', border: '1px solid var(--frost-edge)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9)' }}>{initials}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14.5 }}>{creatorName}</div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)', marginTop: 2 }}>
                        <span style={{ padding: '1px 7px', borderRadius: 999, background: 'var(--sec-2)', border: '1px solid var(--sec-mid-2)', color: 'var(--sec-ink)', letterSpacing: '.03em', textTransform: 'uppercase' as const, fontSize: 9.5 }}>Creator</span>
                      </div>
                      {userEmail && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} data-ph-mask>{userEmail}</div>}
                    </div>
                  </div>
                  <div style={{ height: 1, background: 'var(--border-hairline)', margin: '2px 6px 6px' }} />

                  {/* Profile & shopfront */}
                  <Link href="/creator/settings?tab=profile" onClick={() => setAvatarOpen(false)} className="pmi" style={pmiStyle}>
                    <span style={pmiIconWrap}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg></span>
                    <span style={{ flex: 1, minWidth: 0 }}><span style={pmiLabel}>Profile & shopfront</span><span style={pmiSub}>Your public creator page</span></span>
                  </Link>
                  {/* Settings */}
                  <Link href="/creator/settings?tab=account" onClick={() => setAvatarOpen(false)} className="pmi" style={pmiStyle}>
                    <span style={pmiIconWrap}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg></span>
                    <span style={{ flex: 1, minWidth: 0 }}><span style={pmiLabel}>Settings</span><span style={pmiSub}>Account, notifications, security</span></span>
                  </Link>
                  {/* Payments */}
                  <Link href="/creator/settings?tab=payments" onClick={() => setAvatarOpen(false)} className="pmi" style={pmiStyle}>
                    <span style={pmiIconWrap}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg></span>
                    <span style={{ flex: 1, minWidth: 0 }}><span style={pmiLabel}>Payments</span><span style={pmiSub}>Payout method & earnings</span></span>
                  </Link>
                  {/* Help & support */}
                  <Link href="/creator/settings" onClick={() => setAvatarOpen(false)} className="pmi" style={pmiStyle}>
                    <span style={pmiIconWrap}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg></span>
                    <span style={{ flex: 1, minWidth: 0 }}><span style={pmiLabel}>Help & support</span></span>
                  </Link>

                  <div style={{ height: 1, background: 'var(--border-hairline)', margin: '6px 6px' }} />

                  {/* Sign out */}
                  <button onClick={handleSignOut} className="pmi pmi-danger" style={{ ...pmiStyle, border: 'none', background: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <span style={{ ...pmiIconWrap, background: 'rgba(210,84,90,.09)', color: '#d2545a' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg></span>
                    <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13.5, color: '#d2545a', textAlign: 'left' }}>Sign out</span>
                  </button>
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
        <Link href="/creator/dashboard" style={{ ...logoTextMobile, textDecoration: 'none' }}>guapd</Link>
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
              <div style={{ width: 36, height: 36, borderRadius: 9, background: '#F7F4FB', color: 'var(--sec-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{initials}</div>
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
            <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(26,27,22,0.08)' }}>
              <button onClick={handleSignOut} style={{ padding: '0.5rem 1.25rem', background: 'transparent', color: '#5C5048', border: '1px solid #DDD3BE', borderRadius: 9999, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}>Sign out</button>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes menuIn { from { opacity: 0; transform: translateY(-8px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .pmenu { animation: menuIn .2s cubic-bezier(.22,1,.36,1); transform-origin: top right; }
        .pmi { transition: background .14s ease; }
        .pmi:hover { background: #F7F7F4; }
        .pmi-danger:hover { background: rgba(210,84,90,.08) !important; }
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
            display: block; padding: 14px clamp(14px, 4vw, 28px) 0;
            position: sticky; top: 0; z-index: 30;
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
  maxWidth: 1280,
  margin: '0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'clamp(14px, 2.4vw, 26px)',
  padding: '9px 12px 9px 20px',
  borderRadius: 999,
  border: '1px solid var(--frost-edge)',
  background: 'var(--card)',
  boxShadow: '0 12px 36px -22px rgba(40,45,25,.45)',
}

const logoLink: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--ink)', flexShrink: 0,
}

const logoText: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em',
}

const logoTextMobile: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em',
}

const navPillsWrap: React.CSSProperties = {
  position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
  display: 'flex', alignItems: 'center', gap: 'clamp(16px, 2.4vw, 30px)',
  fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap',
  color: 'var(--ink-soft)',
}

const navPillActive: React.CSSProperties = {
  color: 'var(--ink)', fontWeight: 600,
  background: 'var(--neon)', border: '1px solid transparent',
  padding: '7px 14px', borderRadius: 999,
  boxShadow: '0 6px 16px -8px rgba(180,210,60,.95)',
  textDecoration: 'none',
  display: 'inline-flex', alignItems: 'center', gap: 7,
}

const navPillInactive: React.CSSProperties = {
  color: 'var(--ink-soft)', textDecoration: 'none',
  display: 'inline-flex', alignItems: 'center', gap: 7,
}

const rightGroup: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 40, height: 40, borderRadius: '50%',
  background: 'var(--card)', border: '1px solid var(--frost-edge)',
  color: 'var(--ink)', flexShrink: 0, textDecoration: 'none',
}

const bellBtn: React.CSSProperties = {
  position: 'relative', width: 40, height: 40, flexShrink: 0,
  borderRadius: '50%', border: '1px solid var(--frost-edge)', background: 'var(--card)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit',
}

const notifDropdown: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 340,
  background: '#fff', borderRadius: 16,
  boxShadow: '0 26px 52px -24px rgba(40,52,70,.5), 0 0 0 1px rgba(26,27,22,.06)',
  overflow: 'hidden', zIndex: 50,
  animation: 'fadeUp .16s cubic-bezier(.22,1,.36,1)',
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
  padding: '5px 10px 5px 6px', borderRadius: 999,
  border: '1px solid var(--frost-edge)', background: 'var(--card)',
  cursor: 'pointer', fontFamily: 'inherit',
}

const avatarSquare: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 9, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12.5,
  color: 'var(--ink)',
  background: 'linear-gradient(135deg,var(--sec-2),var(--sec-2))',
  border: '1px solid var(--frost-edge)',
}

const dropdown: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 308,
  zIndex: 20, borderRadius: 20,
  border: '1px solid var(--frost-edge)', background: 'var(--card)',
  boxShadow: '0 30px 60px -26px rgba(40,45,25,.5),inset 0 1px 0 rgba(255,255,255,.95)',
  padding: 8,
}

const pmiStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, textDecoration: 'none',
}

const pmiIconWrap: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, borderRadius: 10, background: '#F7F7F4', color: 'var(--ink-soft)', flexShrink: 0,
}

const pmiLabel: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13.5, color: 'var(--ink)',
}

const pmiSub: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 1,
}

const hamburgerBtn: React.CSSProperties = {
  background: 'none', border: 'none', padding: 6, cursor: 'pointer',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
}

const hamLine: React.CSSProperties = {
  display: 'block', width: 18, height: 2, background: 'var(--ink)', borderRadius: 1,
}
