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

// ── Stage definitions — from design ──
const STAGES = ['negotiating', 'agreed', 'delivered', 'awaiting', 'posted'] as const

const STAGE: Record<string, { i: number; label: string; dot: string; bg: string; fg: string; action: string; hot: boolean }> = {
  negotiating: { i: 0, label: 'Offer to review',       dot: '#4A7FB0', bg: '#EEF6FD', fg: '#3B6A94', action: 'Review offer', hot: true },
  agreed:      { i: 1, label: 'Agreed \u00B7 in production', dot: '#7E6BC4', bg: '#F4F0FF', fg: '#5F519B', action: 'View deal',    hot: false },
  delivered:   { i: 2, label: 'Submitted \u00B7 in review',  dot: '#4C9E82', bg: '#ECFBF5', fg: '#38765F', action: 'Track review', hot: false },
  revision:    { i: 2, label: 'Revision requested',     dot: '#C89A3C', bg: '#FFF6E4', fg: '#8C6417', action: 'Resubmit',     hot: true },
  awaiting:    { i: 3, label: 'Approved \u00B7 post it',     dot: '#8FAF1F', bg: '#F4FBDC', fg: '#5C6F14', action: 'Upload post',  hot: true },
  posted:      { i: 4, label: 'Posted \u00B7 paid',          dot: '#9AA08C', bg: '#F2F3EE', fg: '#6B7060', action: 'View deal',    hot: false },
  declined:    { i: -1, label: 'Declined',              dot: '#C4494F', bg: '#FDF0F0', fg: '#9C4147', action: 'View deal',    hot: false },
  complete:    { i: 4, label: 'Posted \u00B7 paid',          dot: '#9AA08C', bg: '#F2F3EE', fg: '#6B7060', action: 'View deal',    hot: false },
  paid:        { i: 4, label: 'Posted \u00B7 paid',          dot: '#9AA08C', bg: '#F2F3EE', fg: '#6B7060', action: 'View deal',    hot: false },
  cancelled:   { i: -1, label: 'Cancelled',             dot: '#8B90A0', bg: '#F2F3EE', fg: '#6B7060', action: 'View deal',    hot: false },
}

// ── Filter tabs — from design ──
const TAB_DEFS: [string, string][] = [
  ['all', 'All'],
  ['action', 'Needs you'],
  ['negotiating', 'Negotiating'],
  ['agreed', 'In production'],
  ['review', 'In review'],
  ['posted', 'Posted'],
  ['declined', 'Declined'],
]

// ── Sort ──
const SORT_OPTIONS: [string, string][] = [
  ['priority', 'Needs you first'],
  ['created', 'Newest'],
  ['oldest', 'Oldest'],
  ['price', 'Highest value'],
  ['stage', 'By stage'],
]

const PAGE_SIZE = 12

function formatINR(paise: number): string {
  const rupees = paise / 100
  const s = String(Math.round(rupees))
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  return '\u20B9' + (rest ? rest.replace(/\B(?=(\d\d)+(?!\d))/g, ',') + ',' + last3 : last3)
}

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) { const s = (rupees / 100000).toFixed(2).replace(/\.?0+$/, ''); return `\u20B9${s}L` }
  if (rupees >= 1000) return `\u20B9${(rupees / 1000).toFixed(0)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

function createdDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function resolveStatus(d: Deal): string {
  if (d.status === 'declined' || d.status === 'cancelled') return d.status
  if ((d.status === 'approved' || d.status === 'complete' || d.status === 'paid') && d.is_posted === false) return 'awaiting'
  if ((d.status === 'complete' || d.status === 'paid') && d.is_posted === true) return 'posted'
  if (d.status === 'approved' && d.is_posted === true) return 'posted'
  return d.status
}

function needsAction(st: string): boolean {
  return STAGE[st]?.hot ?? false
}

function isLive(st: string): boolean {
  return st !== 'posted' && st !== 'declined' && st !== 'cancelled'
}

function matchFilter(st: string, filter: string): boolean {
  if (filter === 'all') return true
  if (filter === 'action') return needsAction(st)
  if (filter === 'review') return st === 'delivered' || st === 'revision' || st === 'awaiting'
  return st === filter
}

function trackSteps(st: string): { bg: string }[] {
  const cur = STAGE[st]?.i ?? -1
  if (cur < 0) return [{ bg: 'linear-gradient(90deg,#E4ECF3,#E8E2F0)' }]
  return Array.from(STAGES).map((_, i) => {
    const bg = i < cur ? '#DFF29A' : i === cur ? 'var(--lime-400)' : 'linear-gradient(90deg,#E4ECF3,#E8E2F0)'
    return { bg }
  })
}

function nameHash(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  return Math.abs(hash)
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// ── Mascot ──
function Mascot({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 336 336" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M168 12C278 12 324 112 324 188C324 276 252 324 168 324C84 324 12 276 12 188C12 112 58 12 168 12Z" fill="#E8FF66" />
      <ellipse cx="114" cy="126" rx="54" ry="36" fill="#fff" opacity="0.55" />
      <ellipse cx="168" cy="188" rx="24" ry="10" fill="#fff" opacity="0.18" />
    </svg>
  )
}

// ── Empty state messages ──
const EMPTY: Record<string, [string, string]> = {
  all: ['No deals yet', 'Deals you land with brands show up here. Discover campaigns to send your first pitch.'],
  action: ['Nothing needs you', 'Every deal is moving on its own. We will flag anything that needs you.'],
  negotiating: ['No open offers', 'When a brand sends an offer or replies to your counter, it lands here.'],
  agreed: ['Nothing in production', 'Deals move here once you and the brand lock the terms.'],
  review: ['Nothing in review', 'Submitted work, revisions and approved deals collect here.'],
  posted: ['Nothing posted yet', 'Deals whose content is live and paid will show here.'],
  declined: ['No declined deals', 'Deals that were declined will be listed here.'],
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════

export default function CreatorDealsTable({ deals }: { deals: Deal[] }) {
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('priority')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!sortOpen) return
    const handler = (e: MouseEvent) => {
      if (sortRef.current?.contains(e.target as Node)) return
      setSortOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [sortOpen])

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Resolve all deals to their display status
  const resolvedDeals = useMemo(() => deals.map(d => ({ ...d, st: resolveStatus(d) })), [deals])

  // ── Tab counts ──
  const tabCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const [id] of TAB_DEFS) {
      m[id] = resolvedDeals.filter(d => matchFilter(d.st, id)).length
    }
    return m
  }, [resolvedDeals])

  // ── KPIs ──
  const kpiAction = useMemo(() => resolvedDeals.filter(d => needsAction(d.st)).length, [resolvedDeals])
  const kpiLive = useMemo(() => resolvedDeals.filter(d => isLive(d.st)).length, [resolvedDeals])
  const kpiValue = useMemo(() => resolvedDeals.filter(d => isLive(d.st)).reduce((a, d) => a + (d.price_paise ?? 0), 0), [resolvedDeals])

  // ── Filter + search + sort ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = resolvedDeals.filter(d => {
      if (!matchFilter(d.st, filter)) return false
      if (q) {
        const hay = ((d.title || '') + ' ' + (d.brand || '')).toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    // Sort
    const PRIORITY: Record<string, number> = { negotiating: 0, revision: 1, awaiting: 2, delivered: 3, agreed: 4, posted: 5, declined: 6 }
    list = list.slice().sort((a, b) => {
      if (sortKey === 'price') return (b.price_paise ?? 0) - (a.price_paise ?? 0)
      if (sortKey === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (sortKey === 'stage') return (STAGE[a.st]?.i ?? 99) - (STAGE[b.st]?.i ?? 99)
      if (sortKey === 'created') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      // priority (default)
      if ((PRIORITY[a.st] ?? 99) !== (PRIORITY[b.st] ?? 99)) return (PRIORITY[a.st] ?? 99) - (PRIORITY[b.st] ?? 99)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    return list
  }, [resolvedDeals, filter, search, sortKey])

  const visibleRows = filtered.slice(0, shown)
  const hasMore = filtered.length > shown
  const remaining = Math.min(filtered.length - shown, PAGE_SIZE)
  const isFiltered = search.length > 0 || filter !== 'all' || sortKey !== 'priority'

  const clearAll = () => { setSearch(''); setFilter('all'); setSortKey('priority'); setShown(PAGE_SIZE) }

  // ── True empty state ──
  if (deals.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'clamp(40px,5vw,64px) 24px', borderRadius: 20, background: '#FFFFFF' }}>
        <div className="mascot-bob" style={{ filter: 'drop-shadow(0 14px 22px rgba(150,175,60,.28))' }}>
          <Mascot size={64} />
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(20px,2vw,24px)', lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--ink)', marginTop: 18 }}>
          No deals yet
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink-soft)', marginTop: 9, maxWidth: 370, lineHeight: 1.6 }}>
          Deals you land with brands show up here. Discover campaigns to send your first pitch.
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
        .soft { box-shadow: 0 1px 2px rgba(22,23,15,.03), 0 8px 16px rgba(22,23,15,.04), 0 32px 64px rgba(22,23,15,.05); }
        .reveal { animation: fadeUp .6s cubic-bezier(.22,1,.36,1) backwards; }
        .dcard { transition: transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s ease; }
        .dcard:hover { transform: translateY(-2px); box-shadow: 0 2px 4px rgba(22,23,15,.06), 0 14px 30px rgba(22,23,15,.08), 0 48px 80px rgba(22,23,15,.09) !important; }
        .ftab { transition: background .16s ease, color .16s ease; cursor: pointer; }
        .btn-w { transition: background .18s ease, transform .12s ease; cursor: pointer; }
        .btn-w:hover { background: #F4F6F2 !important; transform: translateY(-1px); }
        @media (prefers-reduced-motion: reduce) { .mascot-bob { animation: none; } .reveal { animation: none; } }
      `}</style>

      {/* ===== Hero card ===== */}
      <div className="reveal soft" style={{ background: '#FFFFFF', borderRadius: 20, padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(26px,3vw,34px)', lineHeight: 1.05, letterSpacing: '-0.025em', color: 'var(--ink)', margin: 0 }}>
              My <span style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontWeight: 400, letterSpacing: 0, fontSize: '1.12em' }}>deals</span>
            </h1>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
              Everything you have running with brands, newest first.
            </p>
          </div>
          <Link href="/creator/storefront" style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 8,
            height: 46, padding: '0 22px', borderRadius: 999,
            background: '#FFFFFF', border: '1px solid var(--border-hairline, #EAEAE3)',
            fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--ink-soft)',
            textDecoration: 'none',
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9h18l-1.5-4.5A2 2 0 0 0 17.6 3H6.4a2 2 0 0 0-1.9 1.5L3 9z" /><path d="M4 9v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" /><path d="M9 21v-6h6v6" />
            </svg>
            Go to your shopfront
          </Link>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 28, marginTop: 26, paddingTop: 24, borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
          <div>
            <div style={metaLabel}>Needs your action</div>
            <div style={{ ...dataValue, marginTop: 10 }}>{kpiAction}</div>
          </div>
          <div style={{ paddingLeft: 28, borderLeft: '1px solid var(--border-hairline, #EAEAE3)' }}>
            <div style={metaLabel}>Live right now</div>
            <div style={{ ...dataValue, marginTop: 10 }}>{kpiLive}</div>
          </div>
          <div style={{ paddingLeft: 28, borderLeft: '1px solid var(--border-hairline, #EAEAE3)' }}>
            <div style={metaLabel}>Total earnings</div>
            <div style={{ position: 'relative', display: 'inline-block', marginTop: 10 }}>
              <span aria-hidden="true" style={{ position: 'absolute', left: -3, right: -3, bottom: 3, height: 9, background: 'var(--lime-400)', borderRadius: 3, zIndex: 0 }} />
              <span style={{ ...dataValue, position: 'relative', zIndex: 1, fontVariantNumeric: 'lining-nums' }}>{kpiValue > 0 ? formatINR(kpiValue) : '\u20B90'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Filter console ===== */}
      <div className="reveal soft" style={{ background: '#FFFFFF', borderRadius: 20, padding: 18, marginTop: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 260px', minWidth: 200,
            height: 46, padding: '0 8px 0 16px', borderRadius: 999,
            background: '#F4F6F2', border: 'none',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              placeholder="Search deals or brands"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShown(PAGE_SIZE) }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearch('')
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              style={{
                flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'none',
                fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 500, color: 'var(--ink)',
              }}
            />
            {search.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: filtered.length === 0 ? 'var(--ink-faint)' : 'var(--ink)', whiteSpace: 'nowrap' }}>
                  {filtered.length === 0 ? 'No matches' : filtered.length === 1 ? '1 match' : `${filtered.length} matches`}
                </span>
                <span onClick={() => setSearch('')} title="Clear (Esc)" style={{
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 34, height: 34, borderRadius: '50%', background: '#F4F6F2', color: 'var(--ink-soft)', flexShrink: 0,
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </span>
              </div>
            )}
            {search.length === 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', flexShrink: 0, marginRight: 6,
                fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)',
                border: '1px solid var(--border-hairline, #EAEAE3)', borderRadius: 7, padding: '3px 7px', whiteSpace: 'nowrap',
              }}>
                {'\u2318'}K
              </span>
            )}
          </div>

          {/* Sort select */}
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 17, pointerEvents: 'none' }}>
              <path d="M3 6h18M6 12h12M10 18h4" />
            </svg>
            <select
              value={sortKey}
              onChange={(e) => { setSortKey(e.target.value); setShown(PAGE_SIZE) }}
              title="Sort deals"
              style={{
                height: 46, padding: '0 44px 0 40px', borderRadius: 999,
                border: '1px solid var(--border-hairline, #EAEAE3)', background: '#FFFFFF',
                fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--ink)',
                cursor: 'pointer', whiteSpace: 'nowrap',
                WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='%238E9086' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 16px center',
                backgroundSize: '13px 13px',
              }}
            >
              {SORT_OPTIONS.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Status tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            {TAB_DEFS.map(([id, label]) => {
              const count = tabCounts[id] ?? 0
              const active = filter === id
              return (
                <div
                  key={id}
                  className="ftab"
                  onClick={() => { setFilter(id); setShown(PAGE_SIZE) }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '9px 15px', borderRadius: 999,
                    fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                    background: active ? 'var(--lime-400)' : '#FAFAF7',
                    color: active ? 'var(--lime-950)' : 'var(--ink-soft)',
                  }}
                >
                  {label}
                  <span style={{ fontSize: 13, fontWeight: 800, opacity: active ? 0.66 : 1, color: active ? 'var(--lime-950)' : 'var(--ink-faint)' }}>
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
          {isFiltered && (
            <button onClick={clearAll} style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '9px 14px', borderRadius: 999,
              background: 'none', border: '1px solid var(--border-hairline, #EAEAE3)',
              fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-soft)', cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ===== Deal cards ===== */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 22 }}>
        {visibleRows.map((d) => {
          const st = STAGE[d.st] ?? STAGE.negotiating
          const hot = st.hot
          const brandName = d.brand || 'Brand'
          const brandInitials = getInitials(brandName)
          const track = trackSteps(d.st)

          return (
            <Link
              key={d.id}
              href={`/creator/deals/${d.id}`}
              className="dcard"
              style={{
                display: 'flex', alignItems: 'stretch', borderRadius: 20,
                background: '#FFFFFF', overflow: 'hidden', textDecoration: 'none', color: 'inherit',
                boxShadow: hot
                  ? '0 1px 2px rgba(22,23,15,.04), 0 10px 22px rgba(22,23,15,.06), 0 40px 72px rgba(22,23,15,.07)'
                  : '0 1px 2px rgba(22,23,15,.03), 0 6px 12px rgba(22,23,15,.03)',
              }}
            >
              {/* Left rail */}
              <div style={{ flexShrink: 0, width: 4, background: hot ? st.dot : '#EDF1F5' }} />

              {/* Avatar column */}
              <div style={{
                flexShrink: 0, width: 96, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 8, padding: '24px 0',
                background: 'linear-gradient(125deg,#F4F8FC,#F7F4FB)',
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 44, height: 44, borderRadius: '50%', background: '#FFFFFF',
                  color: 'var(--sec-ink)', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14.5,
                }}>
                  {brandInitials}
                </span>
              </div>

              {/* Body */}
              <div style={{
                flex: 1, minWidth: 0, display: 'flex', alignItems: 'center',
                gap: 'clamp(18px,2.6vw,32px)', padding: '24px clamp(20px,2.6vw,28px)',
              }}>
                {/* Main info */}
                <div style={{ flex: 1, minWidth: 220 }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17, lineHeight: 1.25, color: 'var(--ink)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {brandName}
                  </h3>
                  <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 14, color: 'var(--ink-soft)', marginTop: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.45 }}>
                    {d.title || 'Untitled deal'}
                  </div>

                  {/* Progress track */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
                    {track.map((s, i) => (
                      <span key={i} style={{ height: 4, flex: 1, borderRadius: 999, background: s.bg }} />
                    ))}
                  </div>

                  {/* Stage pill + date */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '5px 11px', borderRadius: 999,
                      fontFamily: 'var(--font-ui)', fontSize: 11.5, fontWeight: 600, letterSpacing: '.01em', whiteSpace: 'nowrap',
                      background: st.bg, color: st.fg,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: st.dot }} />
                      {st.label}
                    </span>
                    <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 9.5, lineHeight: 1.4, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-faint)' }}>
                      {createdDate(d.created_at)}
                    </span>
                  </div>
                </div>

                {/* Price */}
                <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 150, paddingLeft: 'clamp(16px,2vw,26px)', borderLeft: '1px solid var(--border-hairline, #EAEAE3)' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, letterSpacing: '-0.03em', color: 'var(--ink)' }}>
                    {d.price_paise != null && d.price_paise > 0 ? formatRupees(d.price_paise) : '\u2014'}
                  </div>
                </div>

                {/* Action button */}
                <span style={{
                  flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  width: 152, height: 42, padding: '0 16px', borderRadius: 999,
                  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap',
                  ...(hot
                    ? { background: 'var(--ink)', border: '1px solid var(--ink)', color: '#FFFFFF' }
                    : { background: st.bg, border: '1px solid transparent', color: st.fg }),
                }}>
                  {st.action}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </span>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Load more */}
      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
          <button className="btn-w" onClick={() => setShown(s => s + PAGE_SIZE)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            height: 44, padding: '0 22px', borderRadius: 999,
            background: '#FFFFFF', border: '1px solid var(--border-hairline, #EAEAE3)',
            fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer',
          }}>
            Show {remaining} more
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        </div>
      )}

      {/* Empty filter state */}
      {filtered.length === 0 && (
        <div className="soft" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'clamp(40px,5vw,64px) 24px', borderRadius: 20, background: '#FFFFFF', marginTop: 22 }}>
          <div className="mascot-bob" style={{ filter: 'drop-shadow(0 14px 22px rgba(150,175,60,.28))' }}>
            <Mascot size={64} />
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(20px,2vw,24px)', lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--ink)', marginTop: 18 }}>
            {(EMPTY[filter] ?? EMPTY.all)[0]}
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink-soft)', marginTop: 9, maxWidth: 370, lineHeight: 1.6 }}>
            {(EMPTY[filter] ?? EMPTY.all)[1]}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 22, padding: '0 4px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 9.5, lineHeight: 1.4, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-faint)' }}>
          Showing {visibleRows.length} of {deals.length} deals
        </span>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)' }}>
          You receive your rate in full. The 15% platform fee is paid by the brand.
        </span>
      </div>
    </>
  )
}

// ── Shared style fragments ──

const metaLabel: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 9.5, lineHeight: 1.4,
  letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)',
}

const dataValue: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 38, lineHeight: 0.9,
  letterSpacing: '-0.045em', color: 'var(--ink)',
}
