'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'

interface Deal {
  id: string
  deal_ref: string | null
  title: string | null
  deliverables: string | null
  price_paise: number | null
  status: string
  is_posted: boolean | null
  created_at: string
  brand: string | null
}

// ── Filter tabs — exact list from design ──
const STATUS_TABS: [string, string][] = [
  ['all', 'All'],
  ['agreed', 'Agreed'],
  ['delivered', 'Delivered'],
  ['revision', 'Revision'],
  ['approved', 'Approved'],
  ['complete', 'Complete'],
  ['declined', 'Declined'],
  ['posted', 'Posted'],
  ['awaiting', 'Awaiting post'],
]

// ── Sort ──
type SortKey = 'created' | 'price' | 'status'
type SortDir = 'asc' | 'desc'
const SORT_OPTIONS: [SortKey, SortDir, string][] = [
  ['created', 'desc', 'Newest first'],
  ['created', 'asc', 'Oldest first'],
  ['price', 'desc', 'Price: high to low'],
  ['price', 'asc', 'Price: low to high'],
  ['status', 'asc', 'By status'],
]
const STATUS_ORDER: Record<string, number> = {
  negotiating: 0, agreed: 1, delivered: 2, revision: 3, approved: 4, paid: 5, complete: 6, declined: 7, cancelled: 8,
}

// ── Status pill colors — exact from design ──
const STATUS_STYLE: Record<string, { label: string; c: string; bg: string; bd: string }> = {
  negotiating: { label: 'Negotiating', c: '#A9761D', bg: '#FFFEF3', bd: 'rgba(216,154,46,.3)' },
  agreed:      { label: 'Agreed',      c: '#2F6FBF', bg: 'rgba(46,111,191,.1)',  bd: 'rgba(46,111,191,.26)' },
  delivered:   { label: 'Delivered',   c: '#3B7C9E', bg: 'rgba(59,124,158,.1)',  bd: 'rgba(59,124,158,.26)' },
  revision:    { label: 'Revision',    c: '#D89A2E', bg: '#FFFEF3',              bd: 'rgba(216,154,46,.3)' },
  approved:    { label: 'Approved',    c: '#7A5CC4', bg: 'rgba(122,92,196,.12)', bd: 'rgba(122,92,196,.28)' },
  complete:    { label: 'Complete',    c: '#1F8A5B', bg: 'rgba(31,157,107,.1)',  bd: 'rgba(31,157,107,.24)' },
  paid:        { label: 'Paid',        c: '#1F8A5B', bg: 'rgba(31,157,107,.1)',  bd: 'rgba(31,157,107,.24)' },
  declined:    { label: 'Declined',    c: '#D2545A', bg: 'rgba(210,84,90,.09)', bd: 'rgba(210,84,90,.24)' },
  cancelled:   { label: 'Cancelled',   c: '#8B90A0', bg: 'rgba(120,130,150,.10)', bd: 'rgba(120,130,150,.22)' },
}

const AWAITING_STATUS = { label: 'Awaiting post', c: '#D89A2E', bg: '#FFFEF3', bd: 'rgba(216,154,46,.3)' }

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) { const s = (rupees / 100000).toFixed(2).replace(/\.?0+$/, ''); return `\u20B9${s}L` }
  if (rupees >= 1000) return `\u20B9${(rupees / 1000).toFixed(0)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

function totalValue(deals: Deal[]): number {
  return deals.reduce((sum, d) => sum + (d.price_paise ?? 0), 0)
}

function sortDeals(list: Deal[], key: SortKey, dir: SortDir): Deal[] {
  const sorted = list.slice().sort((a, b) => {
    if (key === 'price') return (a.price_paise ?? 0) - (b.price_paise ?? 0)
    if (key === 'status') return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
  if (dir === 'desc') sorted.reverse()
  return sorted
}

// ── Design logic: which deals are "urgent" (need attention) ──
function isUrgent(d: Deal): boolean {
  if (isAwaiting(d)) return true
  return d.status === 'agreed' || d.status === 'revision' || d.status === 'delivered'
}

function isAwaiting(d: Deal): boolean {
  // Approved/complete/paid but not posted
  return (d.status === 'approved' || d.status === 'complete' || d.status === 'paid') && d.is_posted === false
}

function isPosted(d: Deal): boolean {
  return d.is_posted === true
}

// ── Design logic: action label for urgent rows ──
function actionLabel(d: Deal): string {
  if (isAwaiting(d)) return 'Upload post'
  if (d.status === 'agreed') return 'View deal'
  if (d.status === 'revision') return 'Resubmit'
  if (d.status === 'complete' && d.is_posted) return 'Send invoice'
  if (d.status === 'delivered') return 'Track'
  return 'View'
}

// ── Design logic: row status (overrides status with "Awaiting post" when applicable) ──
function rowStatus(d: Deal): { label: string; c: string; bg: string; bd: string } {
  if (isAwaiting(d)) return AWAITING_STATUS
  return STATUS_STYLE[d.status] ?? STATUS_STYLE.negotiating
}

// ── Design logic: filter match (exact from design) ──
function matchFilter(d: Deal, filter: string): boolean {
  if (filter === 'all') return d.status !== 'declined'
  if (filter === 'posted') return isPosted(d)
  if (filter === 'awaiting') return isAwaiting(d)
  return d.status === filter
}

// ── Avatar — 10 distinct gradient pairs so different brands always look different ──
const GRADIENTS = [
  'linear-gradient(135deg,#ECE6FF,#E2F0FF)',  // lavender → sky
  'linear-gradient(135deg,#E7F6EE,#DFEBFF)',  // mint → blue
  'linear-gradient(135deg,#F0E9FF,#FBE9F3)',  // orchid → blush
  'linear-gradient(135deg,#FFF6DC,#FFE9D6)',  // butter → peach
  'linear-gradient(135deg,#FFEEE2,#FFE1EC)',  // peach → pink
  'linear-gradient(135deg,#E4F6EC,#DDEBFF)',  // teal → sky
  'linear-gradient(135deg,#FFEBEB,#F4F0FF)',  // coral → lavender
  'linear-gradient(135deg,#FFF7FA,#FAEEFF)',  // blush → orchid
  'linear-gradient(135deg,#EEF6FD,#ECFBF5)',  // sky → mint
  'linear-gradient(135deg,#FFFEF3,#FFF3EC)',  // butter → peach warm
]

function nameHash(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  return Math.abs(hash)
}

function DealAvatar({ name }: { name: string }) {
  const words = name.trim().split(/\s+/)
  const initials = (words.length >= 2
    ? (words[0][0] + words[1][0])
    : name.slice(0, 2)
  ).toUpperCase()
  const gradient = GRADIENTS[nameHash(name) % GRADIENTS.length]
  return (
    <span style={{
      width: 34, height: 34, borderRadius: 11, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, color: 'var(--ink)',
      background: gradient, border: '1px solid var(--frost-edge)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9)',
    }}>
      {initials}
    </span>
  )
}

// ── Platform icons (inline SVG, 14px) ──
function InstagramIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="ig" x1="0" y1="24" x2="24" y2="0">
          <stop offset="0%" stopColor="#FEDA75" />
          <stop offset="25%" stopColor="#FA7E1E" />
          <stop offset="50%" stopColor="#D62976" />
          <stop offset="75%" stopColor="#962FBF" />
          <stop offset="100%" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" stroke="url(#ig)" strokeWidth="2" />
      <circle cx="12" cy="12" r="5" stroke="url(#ig)" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="url(#ig)" />
    </svg>
  )
}
function YouTubeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" stroke="#FF0000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m10 15 5-3-5-3z" fill="#FF0000" />
    </svg>
  )
}

// Detect platform from deliverables text and return clean label + icon
function parseDeliverable(text: string | null): { icon: React.ReactNode; label: string } | null {
  if (!text) return null
  const lower = text.toLowerCase()
  // Strip handle names like @xyz, platform names
  let clean = text
    .replace(/@\w+/g, '')
    .replace(/\b(instagram|youtube|yt)\b/gi, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!clean) clean = text

  if (lower.includes('youtube') || lower.includes('yt ')) {
    return { icon: <YouTubeIcon />, label: clean }
  }
  // Default to Instagram for Reels, Stories, posts
  if (lower.includes('reel') || lower.includes('stor') || lower.includes('post') || lower.includes('static')) {
    return { icon: <InstagramIcon />, label: clean }
  }
  return { icon: null, label: clean }
}

// ── Guapd mascot ──
function Mascot({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 336 336" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M168 12C278 12 324 112 324 188C324 276 252 324 168 324C84 324 12 276 12 188C12 112 58 12 168 12Z" fill="#E8FF66" />
      <ellipse cx="114" cy="126" rx="54" ry="36" fill="#fff" opacity="0.55" />
      <ellipse cx="168" cy="188" rx="24" ry="10" fill="#fff" opacity="0.18" />
    </svg>
  )
}

// ── Shared control button style ──
const ctrlBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  height: 46, padding: '0 14px', borderRadius: 14,
  border: '1px solid var(--frost-edge)', background: 'rgba(255,255,255,.72)',
  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--ink)',
  cursor: 'pointer', whiteSpace: 'nowrap',
  boxShadow: '0 6px 16px -12px rgba(40,52,70,.42), inset 0 1px 0 rgba(255,255,255,.9)',
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════

export default function CreatorDealsTable({ deals }: { deals: Deal[] }) {
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  // Close sort dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!sortOpen) return
      if (sortRef.current?.contains(e.target as Node)) return
      setSortOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [sortOpen])

  // ── Tab counts ──
  const tabCounts = useMemo(() => {
    const m: Record<string, number> = { all: deals.filter((d) => d.status !== 'declined').length }
    for (const d of deals) m[d.status] = (m[d.status] ?? 0) + 1
    m['posted'] = deals.filter(isPosted).length
    m['awaiting'] = deals.filter(isAwaiting).length
    return m
  }, [deals])

  // ── Filter + search + sort ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = deals.filter((d) => {
      if (!matchFilter(d, filter)) return false
      if (q) {
        const hay = ((d.deal_ref || '') + ' ' + (d.title || '') + ' ' + (d.brand || '')).toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    return sortDeals(result, sortKey, sortDir)
  }, [deals, filter, search, sortKey, sortDir])

  const filteredTotal = totalValue(filtered)
  const currentSortLabel = SORT_OPTIONS.find(([k, d]) => k === sortKey && d === sortDir)?.[2] ?? 'Newest first'

  // ── Grouping: "Needs your attention" + "Wrapped & other" (only on "All" with no search) ──
  const shouldGroup = filter === 'all' && !search.trim()
  const groups = useMemo(() => {
    if (shouldGroup) {
      const needs = filtered.filter(isUrgent)
      const rest = filtered.filter((d) => !isUrgent(d))
      const g: { label: string; count: number; urgent: boolean; showLabel: boolean; deals: Deal[] }[] = []
      if (needs.length) g.push({ label: 'Needs your attention', count: needs.length, urgent: true, showLabel: true, deals: needs })
      if (rest.length) g.push({ label: 'Wrapped & other', count: rest.length, urgent: false, showLabel: true, deals: rest })
      return g
    }
    return filtered.length ? [{ label: '', count: filtered.length, urgent: false, showLabel: false, deals: filtered }] : []
  }, [filtered, shouldGroup])

  // ── True empty state ──
  if (deals.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'clamp(38px,5vw,64px) 24px' }}>
        <div className="mascot-bob" style={{ filter: 'drop-shadow(0 14px 22px rgba(150,175,60,.28))' }}>
          <Mascot size={64} />
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, letterSpacing: '-0.01em', marginTop: 16 }}>
          No deals yet
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-faint)', marginTop: 9, maxWidth: 340, lineHeight: 1.55 }}>
          When a brand sends you an offer, it will appear here.
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @keyframes bob { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-9px) rotate(2deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .mascot-bob { animation: bob 5s ease-in-out infinite; }
        .drow { transition: transform .14s ease, box-shadow .16s ease; }
        .drow:hover { transform: translateY(-1px); box-shadow: 0 18px 34px -18px rgba(40,52,70,.5), inset 0 1px 0 rgba(255,255,255,.95); }
        .ftab { transition: background .16s ease, color .16s ease, border-color .16s ease; cursor: pointer; }
        .ctrlbtn { transition: background .16s ease, box-shadow .16s ease, border-color .16s ease; cursor: pointer; }
        .ctrlbtn:hover { background: #fff; box-shadow: 0 10px 22px -12px rgba(40,52,70,.46), inset 0 1px 0 rgba(255,255,255,.95); transform: translateY(-1px); }
        .ddmenu { animation: fadeUp .16s cubic-bezier(.22,1,.36,1); }
        .ddi { transition: background .13s ease; cursor: pointer; }
        .ddi:hover { background: #F3F6FB; }
        .pill-btn { transition: background .16s ease, box-shadow .16s ease, transform .12s ease, color .16s ease; }
        .pill-btn:hover { background: #fff; box-shadow: 0 8px 18px -10px rgba(40,52,70,.4); transform: translateY(-1px); }
        .searchwrap { transition: border-color .16s ease, box-shadow .16s ease; }
        .searchwrap:focus-within { border-color: var(--neon-deep); box-shadow: 0 0 0 4px rgba(218,254,12,.16); }
        .searchwrap input { outline: none; border: none; background: transparent; font-family: var(--font-ui); font-size: 14px; color: var(--ink); width: 100%; caret-color: var(--ink); }
        .searchwrap input::placeholder { color: var(--ink-faint); }
        @media (prefers-reduced-motion: reduce) { .mascot-bob { animation: none; } .ddmenu { animation: none; } }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, fontSize: 'clamp(30px, 3.8vw, 42px)', margin: 0, color: 'var(--ink)' }}>
            My Deals
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink-soft)', marginTop: 12 }}>
            <span>{deals.length} deals</span>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--ink-faint)' }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
                {filteredTotal > 0 ? formatRupees(filteredTotal) : '\u20B90'}
              </span>
              {' '}shown
            </span>
          </div>
        </div>
        <div className="mascot-bob" style={{ flexShrink: 0, filter: 'drop-shadow(0 12px 22px rgba(150,175,60,.28))' }}>
          <Mascot size={56} />
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--border-hairline)', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Search (placeholder — visual only, filtering works) */}
          <div className="searchwrap" style={{
            flex: 1, minWidth: 240,
            display: 'flex', alignItems: 'center', gap: 10,
            height: 46, padding: '0 15px', borderRadius: 14,
            border: '1px solid var(--frost-edge)', background: '#fff',
            boxShadow: '0 6px 16px -12px rgba(40,52,70,.42), inset 0 1px 2px rgba(40,52,80,.05)',
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Search deals by title or brand"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search.length > 0 && (
              <span onClick={() => setSearch('')} style={{ cursor: 'pointer', display: 'inline-flex', color: 'var(--ink-faint)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </span>
            )}
          </div>

          {/* Sort dropdown */}
          <div ref={sortRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button className="ctrlbtn" onClick={() => setSortOpen((v) => !v)} style={ctrlBtnStyle}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4" />
              </svg>
              <span style={{ color: 'var(--ink-faint)', fontWeight: 500 }}>Sort</span>
              {currentSortLabel}
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                style={{ transition: 'transform .24s ease', transform: sortOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {sortOpen && (
              <div className="ddmenu" style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 30,
                minWidth: 210, borderRadius: 14,
                border: '1px solid var(--frost-edge)', background: '#fff',
                boxShadow: '0 26px 52px -24px rgba(40,52,70,.5), inset 0 1px 0 rgba(255,255,255,.95)',
                padding: 6,
              }}>
                {SORT_OPTIONS.map(([k, d, label]) => {
                  const active = k === sortKey && d === sortDir
                  return (
                    <div
                      key={`${k}-${d}`}
                      className="ddi"
                      onClick={() => { setSortKey(k); setSortDir(d); setSortOpen(false) }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
                        padding: '9px 11px', borderRadius: 10,
                        fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: active ? 700 : 500, color: 'var(--ink)',
                        background: active ? 'rgba(232,255,102,.28)' : 'transparent',
                      }}
                    >
                      <span>{label}</span>
                      {active && (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Status tabs ── */}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'nowrap', overflowX: 'auto', marginTop: 14, paddingBottom: 3 }}>
          {STATUS_TABS.map(([id, label]) => {
            const count = tabCounts[id] ?? 0
            if (id !== 'all' && count === 0) return null
            const active = filter === id
            return (
              <div
                key={id}
                className="ftab"
                onClick={() => setFilter(id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '8px 14px', borderRadius: 'var(--radius-pill)',
                  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                  color: active ? 'var(--ink)' : 'var(--ink-soft)',
                  background: active ? '#fff' : 'rgba(255,255,255,.5)',
                  border: active ? '1px solid var(--frost-edge)' : '1px solid transparent',
                  boxShadow: active ? '0 4px 12px -8px rgba(40,52,70,.5)' : 'none',
                }}
              >
                {label}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
                  fontSize: 10.5, fontWeight: 700,
                  color: active ? 'var(--ink)' : 'var(--ink-faint)',
                  background: active ? 'var(--neon)' : 'rgba(40,52,70,.07)',
                }}>
                  {count}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Deal list (grouped) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.showLabel && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '0 2px 11px' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                  {g.label}
                </span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700, color: 'var(--ink-faint)', background: 'rgba(40,52,70,.07)', borderRadius: 9, padding: '1px 8px' }}>
                  {g.count}
                </span>
                {g.urgent && (
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--neon)', boxShadow: '0 0 0 3px rgba(232,255,102,.3)' }} />
                )}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {g.deals.map((d) => (
                <DealRow key={d.id} deal={d} />
              ))}
            </div>
          </div>
        ))}

        {/* ── Empty filter state ── */}
        {filtered.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'clamp(38px,5vw,64px) 24px' }}>
            <div className="mascot-bob" style={{ filter: 'drop-shadow(0 14px 22px rgba(150,175,60,.28))' }}>
              <Mascot size={64} />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, letterSpacing: '-0.01em', marginTop: 16 }}>
              No deals in this status yet
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-faint)', marginTop: 9, maxWidth: 340, lineHeight: 1.55 }}>
              Nothing matches this filter combination right now. Try another status, posting state, or clear your search.
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, padding: 2 }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)' }}>
          Showing {filtered.length} of {deals.length} deals
        </span>
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// DEAL ROW
// ════════════════════════════════════════════════════════════════

function DealRow({ deal: d }: { deal: Deal }) {
  const urgent = isUrgent(d)
  const st = rowStatus(d)

  return (
    <Link
      href={`/creator/deals/${d.id}`}
      className="drow dealcard"
      style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '15px 16px',
        textDecoration: 'none', color: 'inherit',
        background: '#fff', border: '1px solid var(--frost-edge)', borderRadius: 16,
        boxShadow: '0 12px 28px -20px rgba(40,52,70,.42), inset 0 1px 0 rgba(255,255,255,.95)',
      }}
    >
      <DealAvatar name={d.brand || 'Brand'} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {d.title || 'Untitled deal'}
          </span>
          {d.deal_ref && (
            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)', flexShrink: 0 }}>
              {d.deal_ref}
            </span>
          )}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 'var(--radius-pill)',
            fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap',
            color: st.c, background: st.bg, border: `1px solid ${st.bd}`, flexShrink: 0,
          }}>
            {st.label}
          </span>
        </div>
        <MetaLine brand={d.brand} createdAt={d.created_at} deliverables={d.deliverables} />
      </div>

      {d.price_paise != null && d.price_paise > 0 && (
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em', flexShrink: 0, textAlign: 'right', minWidth: 64 }}>
          {formatRupees(d.price_paise)}
        </div>
      )}

      {/* Urgent rows: action pill. Non-urgent: chevron. */}
      {urgent ? (
        <span className="pill-btn" style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          flexShrink: 0, padding: '9px 15px', borderRadius: 'var(--radius-pill)',
          background: 'rgba(255,255,255,.72)', border: '1px solid var(--frost-edge)',
          fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12.5, color: 'var(--ink)',
          whiteSpace: 'nowrap', minWidth: 120,
          boxShadow: '0 6px 16px -12px rgba(40,52,70,.42)',
        }}>
          {actionLabel(d)}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </span>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      )}
    </Link>
  )
}

function MetaLine({ brand, createdAt, deliverables }: { brand: string | null; createdAt: string; deliverables: string | null }) {
  const date = new Date(createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const parsed = parseDeliverable(deliverables)

  return (
    <div
      title={`${brand || 'Brand'} \u00B7 ${date} \u00B7 ${deliverables || '\u2014'}`}
      style={{
        fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 5,
        display: 'flex', alignItems: 'center', gap: 4,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {brand || 'Brand'} &middot; {date}
      </span>
      {parsed && (
        <>
          <span style={{ color: 'var(--ink-faint)', margin: '0 2px' }}>&middot;</span>
          {parsed.icon}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{parsed.label}</span>
        </>
      )}
      {!parsed && deliverables && (
        <>
          <span style={{ color: 'var(--ink-faint)', margin: '0 2px' }}>&middot;</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{deliverables}</span>
        </>
      )}
    </div>
  )
}
