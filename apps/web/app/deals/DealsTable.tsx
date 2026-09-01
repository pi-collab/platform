'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { calculateFee } from '@/lib/fee'
import { deriveDisplayStatus, dueLabel } from '@/lib/deal-status'

// ── Types ──
interface Deal {
  id: string
  deal_ref: string | null
  title: string | null
  deliverables: string | null
  price_paise: number | null
  fee_percent: number | null
  fee_mode: string | null
  price_per_extra_revision_paise: number | null
  revisions_used: number | null
  revision_limit: number | null
  status: string
  is_posted: boolean | null
  created_at: string
  creator: { id: string; full_name: string; profile_photo_url: string | null } | null
  invoiceStatus: string | null
  invoiceDueDate: string | null
}

// ── Helpers ──
function brandTotal(d: Deal): number | null {
  if (d.price_paise == null || d.price_paise <= 0) return null
  const fee = calculateFee(d.price_paise, d.fee_percent ?? 0, (d.fee_mode as 'on_top' | 'deducted') ?? 'on_top')
  const extra = Math.max(0, (d.revisions_used ?? 0) - (d.revision_limit ?? 0))
  const overage = extra * (d.price_per_extra_revision_paise ?? 0)
  return fee.brand_pays_paise + overage
}

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100_000) { const v = (rupees / 100_000); return `\u20B9${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}L` }
  if (rupees >= 1_000) return `\u20B9${Math.round(rupees / 1_000)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

// ── Stage configuration ──
interface StageConfig {
  index: number
  label: string
  dot: string
  action: string
  hot: boolean
}

function getStageConfig(deal: Deal): StageConfig {
  const derived = deriveDisplayStatus(deal.status, deal.invoiceStatus, deal.invoiceDueDate)

  // Invoice states
  if (derived.label === 'invoice to accept' || derived.label === 'payment due' || derived.label === 'overdue') {
    return { index: 3, label: derived.label.charAt(0).toUpperCase() + derived.label.slice(1), dot: '#C89A3C', action: 'View invoice', hot: true }
  }

  switch (deal.status) {
    case 'negotiating':
      return { index: 0, label: 'Offer on the table', dot: 'var(--ink-soft)', action: 'Review offer', hot: true }
    case 'agreed':
      return { index: 1, label: 'Agreed \u00B7 in production', dot: 'var(--ink-soft)', action: 'View deal', hot: false }
    case 'delivered':
      return { index: 2, label: 'Work submitted', dot: 'var(--ink-soft)', action: 'Review work', hot: true }
    case 'revision':
      return { index: 2, label: 'Revision requested', dot: '#C89A3C', action: 'View revision', hot: false }
    case 'approved':
      return { index: 3, label: 'Approved \u00B7 awaiting post', dot: '#C89A3C', action: 'Release payment', hot: true }
    case 'paid':
    case 'complete':
      return { index: 4, label: 'Posted \u00B7 paid', dot: '#A8C233', action: 'View deal', hot: false }
    case 'declined':
      return { index: -1, label: 'Declined', dot: '#C4494F', action: 'View deal', hot: false }
    case 'cancelled':
      return { index: -1, label: 'Cancelled', dot: '#8B90A0', action: 'View deal', hot: false }
    default:
      return { index: 0, label: deal.status, dot: 'var(--ink-soft)', action: 'View deal', hot: false }
  }
}

// ── Left-rail color for deal card ──
function railColor(stage: StageConfig): string {
  if (stage.hot) return 'var(--neon)'
  if (stage.index >= 0 && stage.index < 4) return '#C89A3C'
  if (stage.index === 4) return 'var(--ink-faint)'
  return 'var(--ink-faint)'
}

// ── Status tabs ──
const STATUS_TABS: [string, string][] = [
  ['all', 'All'],
  ['needs_you', 'Needs you'],
  ['negotiating', 'Negotiating'],
  ['agreed', 'In production'],
  ['delivered', 'In review'],
  ['paid', 'Posted'],
  ['declined', 'Declined'],
]

// ── Sort options ──
type SortKey = 'needs_you' | 'newest' | 'oldest' | 'highest' | 'stage'
const SORT_OPTIONS: [SortKey, string][] = [
  ['needs_you', 'Needs you first'],
  ['newest', 'Newest'],
  ['oldest', 'Oldest'],
  ['highest', 'Highest value'],
  ['stage', 'By stage'],
]

const STAGE_ORDER: Record<string, number> = {
  negotiating: 0, agreed: 1, delivered: 2, revision: 3, approved: 4, paid: 5, complete: 6, declined: 7, cancelled: 8,
}
const HOT_STAGES = new Set(['negotiating', 'delivered', 'approved'])

function sortDeals(list: Deal[], key: SortKey): Deal[] {
  const sorted = list.slice()
  switch (key) {
    case 'needs_you':
      sorted.sort((a, b) => {
        const aHot = HOT_STAGES.has(a.status) ? 0 : 1
        const bHot = HOT_STAGES.has(b.status) ? 0 : 1
        if (aHot !== bHot) return aHot - bHot
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
      break
    case 'newest':
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      break
    case 'oldest':
      sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      break
    case 'highest':
      sorted.sort((a, b) => (brandTotal(b) ?? 0) - (brandTotal(a) ?? 0))
      break
    case 'stage':
      sorted.sort((a, b) => (STAGE_ORDER[a.status] ?? 99) - (STAGE_ORDER[b.status] ?? 99))
      break
  }
  return sorted
}

// ── Avatar gradients ──
const GRADIENTS = [
  'linear-gradient(135deg,#F4F8FC,#F7F4FB)',
  'linear-gradient(135deg,#ECE6FF,#E2F0FF)',
  'linear-gradient(135deg,#E7F6EE,#DFEBFF)',
  'linear-gradient(135deg,#F0E9FF,#FBE9F3)',
  'linear-gradient(135deg,#FFF6DC,#FFE9D6)',
  'linear-gradient(135deg,#FFEEE2,#FFE1EC)',
  'linear-gradient(135deg,#E4F6EC,#DDEBFF)',
  'linear-gradient(135deg,#FFEBEB,#F4F0FF)',
  'linear-gradient(135deg,#EEF6FD,#ECFBF5)',
  'linear-gradient(135deg,#FFFEF3,#FFF3EC)',
]

function nameHash(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  return Math.abs(hash)
}

// ── Deliverable count helper ──
function countDeliverables(text: string | null): number {
  if (!text) return 0
  // Split by common separators: comma, +, newline, semicolon
  return text.split(/[,+;\n]/).filter((s) => s.trim().length > 0).length
}

// ── Props ──
interface Props {
  deals: Deal[]
  currentStatus: string | null
  currentQuery: string
  currentPage: number
  totalPages: number
  totalCount: number
  /** Computed server-side over ALL the brand's deals, not the current page. */
  tabCounts: Record<string, number>
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════

export default function DealsTable({ deals, currentStatus, currentQuery, currentPage, totalPages, totalCount, tabCounts }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = useState(currentQuery)
  const [sortKey, setSortKey] = useState<SortKey>('needs_you')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Navigate with updated search params
  function navigate(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '' || v === 'all') {
        params.delete(k)
      } else {
        params.set(k, v)
      }
    }
    if (!('page' in updates)) params.delete('page')
    router.push(`/deals?${params.toString()}`)
  }

  function handleSearchChange(value: string) {
    setSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      navigate({ q: value || null })
    }, 300)
  }

  // Counts come from the SERVER, over every deal the brand has. Deriving them
  // here meant counting `deals`, which is the current page AFTER the status
  // filter — so "All" counted one page, and with any filter active every other
  // tab counted zero because those rows were not in the response. That is why
  // "In review 0" turned into two the moment it was clicked.

  // Client-side sort
  const sorted = useMemo(() => sortDeals(deals, sortKey), [deals, sortKey])

  // Match count for search
  const matchCount = searchInput.trim() ? sorted.length : null
  const isFiltered = !!currentStatus || !!searchInput.trim()
  const currentSortLabel = SORT_OPTIONS.find(([k]) => k === sortKey)?.[1] ?? 'Needs you first'

  return (
    <>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .drow { transition: transform .14s ease, box-shadow .16s ease, outline-color .2s ease; outline: 2px solid transparent; outline-offset: -1px; border-radius: 16px; }
        .drow:hover { transform: translateY(-2px); outline-color: var(--neon); box-shadow: 0 0 0 2px var(--neon), 0 18px 34px -18px rgba(40,52,70,.5); }
        .drow:focus-visible { outline-color: var(--neon); }
        .drow:focus:not(:focus-visible) { outline-color: transparent; }
        .ftab { transition: background .16s ease, color .16s ease; cursor: pointer; }
        .ctrlbtn { transition: background .16s ease, box-shadow .16s ease; cursor: pointer; }
        .ctrlbtn:hover { background: #fff; box-shadow: 0 10px 22px -12px rgba(40,52,70,.46); transform: translateY(-1px); }
        .ddmenu { animation: fadeUp .16s cubic-bezier(.22,1,.36,1); }
        .ddi { transition: background .13s ease; cursor: pointer; }
        .ddi:hover { background: #F3F6FB; }
        .pill-btn { transition: background .16s ease, box-shadow .16s ease, transform .12s ease; }
        .pill-btn:hover { box-shadow: 0 8px 18px -10px rgba(40,52,70,.4); transform: translateY(-1px); }
        .searchwrap { transition: border-color .16s ease, box-shadow .16s ease; }
        .searchwrap:focus-within { border-color: var(--neon-deep); box-shadow: 0 0 0 4px rgba(218,254,12,.16); }
        .searchwrap input { outline: none; border: none; background: transparent; font-family: var(--font-ui); font-size: 14px; color: var(--ink); width: 100%; caret-color: var(--ink); }
        .searchwrap input::placeholder { color: var(--ink-faint); }
        @media (prefers-reduced-motion: reduce) { .ddmenu { animation: none; } }
        @media (max-width: 640px) {
          .deal-card-body { flex-direction: column !important; }
          .deal-card-money { padding-left: 0 !important; border-top: 1px solid var(--border-hairline); padding-top: 10px !important; margin-top: 8px; text-align: left !important; }
        }
      `}</style>

      {/* ══════ FILTER CONSOLE CARD ══════ */}
      <section style={consoleCard}>

        {/* ── Top row: search + sort ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Search bar */}
          <div className="searchwrap" style={{
            flex: 1, minWidth: 240,
            display: 'flex', alignItems: 'center', gap: 10,
            height: 44, padding: '0 14px', borderRadius: 'var(--radius-pill)',
            background: '#F4F6F2', border: '1px solid transparent',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Search deals..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {matchCount !== null && (
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {matchCount} match{matchCount !== 1 ? 'es' : ''}
              </span>
            )}
            {searchInput && (
              <span onClick={() => handleSearchChange('')} style={{ cursor: 'pointer', display: 'inline-flex', color: 'var(--ink-faint)', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </span>
            )}
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 500, color: 'var(--ink-faint)', whiteSpace: 'nowrap', flexShrink: 0, background: 'rgba(40,52,70,.06)', borderRadius: 5, padding: '2px 6px' }}>
              {'\u2318'}K
            </span>
          </div>

          {/* Sort dropdown */}
          <div ref={sortRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button className="ctrlbtn" onClick={() => setSortOpen((v) => !v)} style={sortBtnStyle}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4" />
              </svg>
              {currentSortLabel}
              <svg
                width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                style={{ transition: 'transform .24s ease', transform: sortOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {sortOpen && (
              <div className="ddmenu" style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 30,
                minWidth: 200, borderRadius: 14,
                border: '1px solid var(--frost-edge)', background: '#fff',
                boxShadow: '0 26px 52px -24px rgba(40,52,70,.5), inset 0 1px 0 rgba(255,255,255,.95)',
                padding: 6,
              }}>
                {SORT_OPTIONS.map(([k, label]) => {
                  const active = k === sortKey
                  return (
                    <div
                      key={k}
                      className="ddi"
                      onClick={() => { setSortKey(k); setSortOpen(false) }}
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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-hairline)', paddingBottom: 2 }}>
          {STATUS_TABS.map(([id, label]) => {
            const count = tabCounts[id] ?? 0
            const active = id === 'all' ? !currentStatus : currentStatus === id
            return (
              <button
                key={id}
                className="ftab"
                onClick={() => navigate({ status: id === 'all' ? null : id })}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 'var(--radius-pill)',
                  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                  color: active ? 'var(--ink)' : 'var(--ink-soft)',
                  background: active ? 'var(--neon)' : 'transparent',
                  border: 'none',
                }}
              >
                {label}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
                  fontSize: 10.5, fontWeight: 700,
                  color: active ? 'var(--ink)' : 'var(--ink-faint)',
                  background: active ? 'rgba(0,0,0,.1)' : 'rgba(40,52,70,.06)',
                }}>
                  {count}
                </span>
              </button>
            )
          })}

          {/* Reset button */}
          {isFiltered && (
            <button
              onClick={() => { handleSearchChange(''); navigate({ status: null, q: null }) }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '7px 12px', borderRadius: 'var(--radius-pill)',
                fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
                color: 'var(--ink-faint)', background: 'transparent', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
              Reset
            </button>
          )}
        </div>
      </section>

      {/* ══════ DEAL CARDS ══════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 22 }}>
        {sorted.map((d) => (
          <DealCard key={d.id} deal={d} />
        ))}

        {/* Empty filter state */}
        {sorted.length === 0 && (
          <div style={{ ...emptyFilterCard }}>
            <Mascot size={56} />
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em', margin: '16px 0 0', color: 'var(--ink)' }}>
              No deals match this filter
            </p>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-faint)', margin: '8px 0 0', maxWidth: 320, lineHeight: 1.5 }}>
              Try another status or clear your search.
            </p>
          </div>
        )}
      </div>

      {/* ══════ PAGINATION ══════ */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 24 }}>
          <button
            disabled={currentPage <= 1}
            onClick={() => navigate({ page: String(currentPage - 1) })}
            style={{ ...paginationBtn, opacity: currentPage <= 1 ? 0.4 : 1 }}
          >
            &larr; Prev
          </button>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)' }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => navigate({ page: String(currentPage + 1) })}
            style={{ ...paginationBtn, opacity: currentPage >= totalPages ? 0.4 : 1 }}
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* ══════ FOOTER ══════ */}
      <div style={{ textAlign: 'center', marginTop: 16, padding: '0 2px' }}>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)', margin: 0 }}>
          Showing {sorted.length} of {totalCount} deal{totalCount !== 1 ? 's' : ''}
        </p>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--ink-faint)', margin: '6px 0 0', opacity: 0.7 }}>
          Prices shown include platform fee where applicable.
        </p>
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// DEAL CARD
// ════════════════════════════════════════════════════════════════

function DealCard({ deal: d }: { deal: Deal }) {
  const stage = getStageConfig(d)
  const total = brandTotal(d)
  const due = dueLabel(d.status, d.invoiceStatus, d.invoiceDueDate)
  const creatorName = d.creator?.full_name ?? 'Unknown'
  const initials = creatorName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  const gradient = GRADIENTS[nameHash(creatorName) % GRADIENTS.length]
  const delCount = countDeliverables(d.deliverables)
  const createdDate = new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <Link
      href={`/deals/${d.id}`}
      className="drow"
      style={{
        display: 'flex', alignItems: 'stretch', textDecoration: 'none', color: 'inherit',
        background: '#fff', borderRadius: 16, overflow: 'hidden',
        border: '1px solid var(--frost-edge)',
        boxShadow: '0 12px 28px -20px rgba(40,52,70,.42), inset 0 1px 0 rgba(255,255,255,.95)',
      }}
    >
      {/* ── Left rail ── */}
      <div style={{ width: 3, background: railColor(stage), flexShrink: 0 }} />

      {/* ── Avatar area ── */}
      <div style={{
        width: 110, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: gradient,
      }}>
        {d.creator?.profile_photo_url ? (
          <img
            src={d.creator.profile_photo_url}
            alt={creatorName}
            style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,.8)' }}
          />
        ) : (
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,.7)', border: '2px solid rgba(255,255,255,.9)',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--ink)',
          }}>
            {initials || '?'}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="deal-card-body" style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '26px 30px', gap: 24, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Creator name — t-subhead */}
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {creatorName}
          </div>

          {/* Title + deliverable count — t-content */}
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: '#5C5E52', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {d.title || 'Untitled deal'}
            {delCount > 0 && (
              <>
                <span style={{ margin: '0 5px', color: 'var(--ink-faint)' }}>&middot;</span>
                {delCount} deliverable{delCount !== 1 ? 's' : ''}
              </>
            )}
          </div>

          {/* Stage progress track */}
          <div style={{ display: 'flex', gap: 4, marginTop: 12, maxWidth: 420 }}>
            {[0, 1, 2, 3, 4].map((i) => {
              const filled = stage.index >= 0 && i <= stage.index
              const isCurrent = i === stage.index
              return (
                <div
                  key={i}
                  style={{
                    flex: 1, height: 4, borderRadius: 2,
                    background: filled
                      ? isCurrent
                        ? 'var(--neon)'
                        : 'var(--neon-deep)'
                      : 'var(--border-hairline)',
                    transition: 'background .2s ease',
                  }}
                />
              )
            })}
          </div>

          {/* Stage label + dot + date — t-meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: stage.dot, flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 9.5, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#5C5E52' }}>
              {stage.label}
            </span>
            {due && (
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: stage.label.toLowerCase().includes('overdue') ? '#991b1b' : '#854d0e', marginLeft: 2 }}>
                {due}
              </span>
            )}
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--ink-faint)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 9.5, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#9EA096' }}>
              {createdDate}
            </span>
          </div>
        </div>

        {/* ── Money section ── */}
        <div className="deal-card-money" style={{ flexShrink: 0, textAlign: 'right', paddingLeft: 24, minWidth: 100 }}>
          {total != null ? (
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.035em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums lining-nums' }}>
              {'\u20B9'}{(total / 100).toLocaleString('en-IN')}
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)' }}>
              -
            </div>
          )}
        </div>

        {/* ── Action button ── */}
        <span
          className="pill-btn"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            flexShrink: 0, padding: '13px 24px', borderRadius: 'var(--radius-pill)',
            fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap',
            ...(stage.hot
              ? { background: 'var(--ink)', color: '#fff', border: '1px solid var(--ink)', boxShadow: '0 6px 16px -8px rgba(0,0,0,.4)' }
              : { background: 'transparent', color: 'var(--ink)', border: '1px solid #D4D4CB', boxShadow: 'none' }
            ),
          }}
        >
          {stage.action}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </span>
      </div>
    </Link>
  )
}

// ── Mascot SVG ──
function Mascot({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 336 336" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M168 12C278 12 324 112 324 188C324 276 252 324 168 324C84 324 12 276 12 188C12 112 58 12 168 12Z" fill="#E8FF66" />
      <ellipse cx="114" cy="126" rx="54" ry="36" fill="#fff" opacity="0.55" />
      <ellipse cx="168" cy="188" rx="24" ry="10" fill="#fff" opacity="0.18" />
    </svg>
  )
}

// ── Styles ──
const consoleCard: React.CSSProperties = {
  borderRadius: 20,
  background: 'var(--card)',
  boxShadow: '0 12px 28px -20px rgba(40,52,70,.42), inset 0 1px 0 rgba(255,255,255,.95)',
  padding: 18,
  marginTop: 30,
}

const sortBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  height: 44, padding: '0 14px', borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--frost-edge)', background: '#F4F6F2',
  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--ink)',
  cursor: 'pointer', whiteSpace: 'nowrap',
}

const emptyFilterCard: React.CSSProperties = {
  borderRadius: 20,
  background: 'var(--card)',
  boxShadow: '0 12px 28px -20px rgba(40,52,70,.42), inset 0 1px 0 rgba(255,255,255,.95)',
  padding: '48px 24px',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}

const paginationBtn: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'var(--font-ui)',
  background: 'var(--card)',
  border: '1px solid var(--frost-edge)',
  borderRadius: 'var(--radius-pill)',
  cursor: 'pointer',
  color: 'var(--ink)',
  boxShadow: '0 4px 12px -8px rgba(40,52,70,.3)',
}
