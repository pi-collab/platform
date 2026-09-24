'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { calculateFee } from '@/lib/fee'
import { deriveDisplayStatus } from '@/lib/deal-status'
import TrackTag from '@/components/track/TrackTag'

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
  /** deals | growth. Snapshotted at send, never re-derived. */
  track?: string | null
  creator: { id: string; full_name: string; profile_photo_url: string | null } | null
  invoiceStatus: string | null
  invoiceDueDate: string | null
}

// ── Helpers ──
function brandTotal(d: Deal): number | null {
  if (d.price_paise == null || d.price_paise <= 0) return null
  const fee = calculateFee(d.price_paise, d.fee_percent ?? 0, (d.fee_mode as 'on_top' | 'deducted') ?? 'deducted')
  const extra = Math.max(0, (d.revisions_used ?? 0) - (d.revision_limit ?? 0))
  const overage = extra * (d.price_per_extra_revision_paise ?? 0)
  return fee.brand_pays_paise + overage
}

// ── Stage configuration ──
//
// Colours and labels transcribed from "Brand Deals". Each stage carries a dot
// colour and a tint; the pill is built from both — mixWithWhite lightens the
// tint to 45% against white and the dot colour at 30% alpha draws the border,
// so one pair of values defines the whole chip.
interface StageConfig {
  label: string
  /** Dot colour; also the source of the pill's border. */
  dot: string
  /** Pill tint before it is mixed with white. */
  bg: string
  hot: boolean
}

/* The design writes the pill's fill as a CSS colour mix of the tint and white.
   Computed here instead: an inline style whose value the browser does not
   understand is dropped silently, which would leave the pill transparent
   rather than tinted, and the mix is two hex values and a ratio. */
function mixWithWhite(hex: string, tintPct: number): string {
  const n = parseInt(hex.slice(1), 16)
  const t = tintPct / 100
  const ch = (shift: number) => Math.round(((n >> shift) & 0xff) * t + 255 * (1 - t))
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`
}

/* The design has no invoice stages, because its sample data has no invoices.
   Ours do exist and a brand acts on them, so they keep their own labels and
   take the amber tone the design gives "revision" — the same "something is
   waiting on you but nothing is wrong" weight. */
const INVOICE_TONE = { dot: '#C89A3C', bg: '#FCF6E4' }

function getStageConfig(deal: Deal): StageConfig {
  const derived = deriveDisplayStatus(deal.status, deal.invoiceStatus, deal.invoiceDueDate)

  if (derived.label === 'invoice to accept' || derived.label === 'payment due' || derived.label === 'overdue') {
    return {
      label: derived.label.charAt(0).toUpperCase() + derived.label.slice(1),
      ...INVOICE_TONE,
      hot: true,
    }
  }

  switch (deal.status) {
    case 'negotiating':
      return { label: 'Offer on the table', dot: '#4A7FB0', bg: '#E7F1FC', hot: true }
    case 'agreed':
      return { label: 'In production', dot: '#7E6BC4', bg: '#F0EAFD', hot: false }
    case 'delivered':
      return { label: 'Work submitted', dot: '#4C9E82', bg: '#E9F7F0', hot: true }
    case 'revision':
      return { label: 'Revision requested', dot: '#C89A3C', bg: '#FCF6E4', hot: false }
    case 'approved':
      return { label: 'Awaiting post', dot: '#8FAF1F', bg: '#F4FBDC', hot: true }
    case 'paid':
    case 'complete':
      return { label: 'Posted \u00B7 paid', dot: '#9AA08C', bg: '#F2F3EE', hot: false }
    case 'declined':
      return { label: 'Declined', dot: '#C4494F', bg: '#FDF0F0', hot: false }
    case 'cancelled':
      return { label: 'Cancelled', dot: '#9AA08C', bg: '#F2F3EE', hot: false }
    default:
      return { label: deal.status, dot: '#9AA08C', bg: '#F2F3EE', hot: false }
  }
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

/* What the placeholder cycles through, from the design. */
const SEARCH_WORDS = ['deals', 'by creator', 'a deal reference', 'deliverables']

/* Transcribed from the design, keyed by the tab a brand is standing on. */
const EMPTY_COPY: Record<string, [string, string]> = {
  all: ['No deals yet', 'Deals you start with creators land here. Browse creators to send your first brief.'],
  needs_you: ['Nothing needs you', 'Every deal is moving on its own. We will flag anything that needs a decision.'],
  negotiating: ['No open offers', 'When you send an offer or a creator counters, it shows up here.'],
  agreed: ['Nothing in production', 'Deals move here once you and the creator lock the terms.'],
  delivered: ['Nothing to review', 'Submitted work, revisions and approved deals collect here.'],
  paid: ['Nothing posted yet', 'Deals whose content is live and paid will show here.'],
  declined: ['No declined deals', 'Deals that were declined will be listed here.'],
}

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

function sortDeals(list: Deal[], key: SortKey): Deal[] {
  const sorted = list.slice()
  switch (key) {
    case 'needs_you':
      /* The same `hot` the stage pill is built from, so "needs you first" and
         the chips cannot disagree. The status set kept alongside it did
         disagree: it had no idea an unpaid invoice needs the brand. */
      sorted.sort((a, b) => {
        const aHot = getStageConfig(a).hot ? 0 : 1
        const bHot = getStageConfig(b).hot ? 0 : 1
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
  /** The server's page size, so the range label matches the slice it sent. */
  pageSize: number
  /** Set when the page is narrowed to one creator, so the chip can say whose
   *  deals these are and offer a way out of it. */
  creatorFilter: { id: string; name: string } | null
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════

export default function DealsTable({ deals, currentStatus, currentQuery, currentPage, totalPages, totalCount, tabCounts, creatorFilter, pageSize }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = useState(currentQuery)
  const [sortKey, setSortKey] = useState<SortKey>('needs_you')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  /* The design types its placeholder through a list of things you can search
     for. Driven through the ref rather than state: as state it would re-render
     the whole list of rows roughly sixteen times a second for the life of the
     page, to animate a word nobody is looking at while they read their deals.

     It stops the moment the field is focused or has anything in it, and never
     starts for someone who asked for less motion. */
  useEffect(() => {
    const el = searchRef.current
    if (!el) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    let word = 0, char = 0, deleting = false, timer: ReturnType<typeof setTimeout>
    const tick = () => {
      if (document.activeElement === el || el.value) {
        el.placeholder = 'Search deals'
        timer = setTimeout(tick, 600)
        return
      }
      const target = SEARCH_WORDS[word]!
      let delay: number
      if (!deleting && char >= target.length) { deleting = true; delay = 1400 }
      else if (deleting && char <= 0) { deleting = false; word = (word + 1) % SEARCH_WORDS.length; delay = 300 }
      else { char += deleting ? -1 : 1; delay = deleting ? 40 : 65 }
      el.placeholder = `Search ${target.slice(0, char)}`
      timer = setTimeout(tick, delay)
    }
    tick()
    return () => clearTimeout(timer)
  }, [])

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

  /* "Showing 8–20 of 57". Derived from the SERVER's page, not from the rows in
     hand: the range has to describe where this page sits in the whole result,
     and `sorted` only knows about itself. */
  const rangeFrom = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeTo = Math.min(rangeFrom + sorted.length - 1, totalCount)

  /* Numbered pages, windowed. The design lists every page because its sample
     has three; a brand with four hundred deals would get twenty buttons, so
     the run around the current page is shown and the rest collapses to an
     ellipsis. First and last are always reachable. */
  const pageNumbers: (number | null)[] = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const out: (number | null)[] = [1]
    const from = Math.max(2, currentPage - 1)
    const to = Math.min(totalPages - 1, currentPage + 1)
    if (from > 2) out.push(null)
    for (let n = from; n <= to; n++) out.push(n)
    if (to < totalPages - 1) out.push(null)
    out.push(totalPages)
    return out
  })()

  /* Per-tab empty copy, transcribed from the design. Keyed on the tab, so the
     line answers the question the brand is actually asking — what lands HERE. */
  const emptyCopy: [string, string] = searchInput.trim()
    ? ['No deals match that search', 'Try a different name, title or deal reference, or clear the search to see everything.']
    : EMPTY_COPY[currentStatus ?? 'all'] ?? EMPTY_COPY.all!

  return (
    <>
      <style>{`
        .dcard { transition: background .14s ease; outline: 2px solid transparent; outline-offset: -2px; }
        .dcard:hover { background: #FAFBFC; }
        .dcard:focus-visible { outline-color: var(--neon); }
        .ftab { transition: background .16s ease, color .16s ease; cursor: pointer; }
        .pagebtn { transition: background .14s ease; }
        .pagebtn:hover:not(:disabled) { background: #F5F7FA; }
        .searchwrap { transition: box-shadow .16s ease; }
        .searchwrap:focus-within { box-shadow: 0 0 0 3px rgba(218,254,12,.28), inset 0 1px 3px rgba(18,21,28,.07); }
        .searchwrap input { outline: none; border: none; background: transparent; font-family: var(--font-ui); font-size: 15.5px; font-weight: 500; color: var(--ink); width: 100%; caret-color: var(--ink); }
        .searchwrap input::placeholder { color: var(--wg-400); font-weight: 400; }
        .sortselect { -webkit-appearance: none; -moz-appearance: none; appearance: none; }
        @media (max-width: 900px) {
          /* The row folds onto two lines rather than squeezing: the avatar and
             the name keep the first, the stage pill, the amount and the chevron
             take the second. Squeezed onto one line at this width, the name and
             the pill both truncate to nothing legible. */
          .dcard { flex-wrap: wrap; row-gap: 14px; column-gap: 16px !important; }
          .dcard .dname { flex: 1 1 calc(100% - 64px); min-width: 0 !important; }
          .dcard .dmoney { margin-left: auto; }
        }
      `}</style>

      {/* ══════ DEALS CONSOLE ══════
          One card holds the search, the filters and the rows. The design draws
          no gap between them: the tabs are separated from the list by the same
          hairline that separates one row from the next, so the whole thing
          reads as a single console rather than a toolbar floating above a
          stack of cards. */}
      <section style={consoleCard}>

        <div style={{ padding: '26px clamp(18px, 2.4vw, 26px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>

            {/* ── Search ── */}
            <div className="searchwrap" style={{
              display: 'flex', alignItems: 'center', gap: 12,
              flex: '1 1 320px', minWidth: 200, height: 54,
              padding: '0 10px 0 20px', borderRadius: 999,
              background: '#F5F7FA', border: 'none',
              boxShadow: 'inset 0 1px 3px rgba(18,21,28,.07), inset 0 0 0 1px rgba(18,21,28,.03)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                id="dealsearch"
                ref={searchRef}
                type="search"
                placeholder="Search deals"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') handleSearchChange('')
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
              />
              {searchInput && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                  {/* The SERVER's count for this search, not the rows in hand.
                      Counting `sorted` would report at most one page, so a
                      search matching 40 deals would claim 20 matches. */}
                  <span style={{ fontSize: 12, fontWeight: 600, color: totalCount === 0 ? 'var(--wg-400)' : 'var(--ink)', whiteSpace: 'nowrap' as const }}>
                    {totalCount === 0 ? 'No matches' : totalCount === 1 ? '1 match' : `${totalCount} matches`}
                  </span>
                  <span
                    onClick={() => handleSearchChange('')}
                    title="Clear (Esc)"
                    style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '50%', background: '#F4F6F2', color: 'var(--wg-600)', flexShrink: 0 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </span>
                </div>
              )}
            </div>

            {/* ── Sort ──
                A real <select>. The custom menu it replaces was more code for
                less: this one opens natively on a phone and answers the
                keyboard without a click-outside listener. */}
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
              <select
                className="sortselect"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                title="Sort deals"
                style={{
                  height: 46, padding: '0 38px 0 18px', borderRadius: 999,
                  border: '1px solid var(--hairline)', background: '#FFFFFF',
                  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
                  color: 'var(--ink)', cursor: 'pointer', whiteSpace: 'nowrap' as const,
                }}
              >
                {SORT_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--wg-400)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>

          {/* ── Status tabs ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const, marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--hairline)' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, flex: 1, minWidth: 0 }}>
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
                      padding: '8px 16px', borderRadius: 999, border: 'none',
                      fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' as const,
                      background: active ? 'var(--ink)' : '#F5F7FA',
                      color: active ? '#fff' : 'var(--wg-600)',
                    }}
                  >
                    {label}
                    {/* A number, not a badge. The design sets it as part of the
                        tab's own text so a row of seven chips does not read as
                        a row of seven counters. */}
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: active ? 'rgba(255,255,255,.6)' : 'var(--wg-400)' }}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* A narrowing the brand did not type, so it has to be visible and
              removable. Without it the page just looks short. */}
          {creatorFilter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 8px 6px 14px', borderRadius: 999,
                background: 'var(--neon)', color: 'var(--ink)',
                fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600,
              }}>
                Deals with {creatorFilter.name}
                <button
                  onClick={() => navigate({ creator: null })}
                  aria-label={`Show all deals, not just ${creatorFilter.name}`}
                  style={{ display: 'inline-flex', alignItems: 'center', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: 'var(--ink)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </span>
            </div>
          )}
        </div>

        {/* ── Rows ── */}
        <div>
          {sorted.map((d) => <DealRow key={d.id} deal={d} />)}
        </div>

        {/* ── Nothing matched ──
            Worded per tab, because "no deals match this filter" is the one
            thing the brand can already see. What they cannot see is what WOULD
            land in the tab they are looking at. */}
        {sorted.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', textAlign: 'center' as const, padding: 'clamp(40px, 5vw, 64px) 24px', borderTop: '1px solid var(--hairline)' }}>
            <Mascot size={64} />
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(20px, 2vw, 24px)', lineHeight: 1.1, letterSpacing: '-0.02em', margin: '18px 0 0', color: 'var(--ink)' }}>
              {emptyCopy[0]}
            </p>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, lineHeight: 1.6, color: 'var(--wg-600)', margin: '9px 0 0', maxWidth: 370 }}>
              {emptyCopy[1]}
            </p>
          </div>
        )}
      </section>

      {/* ══════ RESULT COUNT + PAGES ══════ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 22, padding: '0 4px', flexWrap: 'wrap' as const }}>
        <span className="t-meta" style={{ color: 'var(--meta)' }}>
          {totalCount === 0
            ? 'No deals'
            : `Showing ${rangeFrom}–${rangeTo} of ${totalCount} deal${totalCount !== 1 ? 's' : ''}`}
        </span>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 999, background: '#FFFFFF', border: '1px solid var(--hairline)' }}>
            <button
              className="pagebtn"
              disabled={currentPage <= 1}
              onClick={() => navigate({ page: String(currentPage - 1) })}
              aria-label="Previous page"
              style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: currentPage > 1 ? 1 : 0.35, cursor: currentPage > 1 ? 'pointer' : 'default' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            {pageNumbers.map((n, i) => n === null ? (
              <span key={`gap-${i}`} style={{ minWidth: 20, textAlign: 'center' as const, color: 'var(--wg-400)', fontSize: 13 }}>&hellip;</span>
            ) : (
              <button
                key={n}
                className="pagebtn"
                onClick={() => navigate({ page: String(n) })}
                aria-current={n === currentPage ? 'page' : undefined}
                style={{
                  minWidth: 34, height: 34, padding: '0 6px', borderRadius: 999, border: 'none',
                  background: n === currentPage ? 'var(--ink)' : 'transparent',
                  color: n === currentPage ? '#FFFFFF' : 'var(--wg-600)',
                  fontFamily: 'var(--font-num, var(--font-ui))', fontSize: 13,
                  fontWeight: n === currentPage ? 700 : 500, cursor: 'pointer',
                }}
              >
                {n}
              </button>
            ))}
            <button
              className="pagebtn"
              disabled={currentPage >= totalPages}
              onClick={() => navigate({ page: String(currentPage + 1) })}
              aria-label="Next page"
              style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: currentPage < totalPages ? 1 : 0.35, cursor: currentPage < totalPages ? 'pointer' : 'default' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// DEAL ROW
// ════════════════════════════════════════════════════════════════

function DealRow({ deal: d }: { deal: Deal }) {
  const stage = getStageConfig(d)
  const total = brandTotal(d)
  const creatorName = d.creator?.full_name ?? 'Unknown'
  const initials = creatorName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)

  /* "{title} · {deliverables}", as drawn. The deliverables text is what the
     brand wrote on the offer, shown as written and truncated if long — a
     count ("3 deliverables") says less than "1 Reel + 2 Stories" in the same
     space. A deal with none simply shows its title. */
  const subtitle = [d.title?.trim() || 'Untitled deal', d.deliverables?.trim()]
    .filter(Boolean)
    .join(' · ')

  return (
    <Link
      href={`/deals/${d.id}`}
      className="dcard"
      style={{
        display: 'flex', alignItems: 'center', gap: 'clamp(18px, 2.4vw, 30px)',
        borderTop: '1px solid var(--hairline)',
        padding: '22px clamp(20px, 2.4vw, 28px)',
        textDecoration: 'none', color: 'inherit',
      }}
    >
      {d.creator?.profile_photo_url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={d.creator.profile_photo_url} alt="" style={{ flexShrink: 0, width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' as const }} />
      ) : (
        <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', background: 'var(--sec-2)', color: 'var(--wg-600)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5 }}>
          {initials || '?'}
        </span>
      )}

      <div className="dname" style={{ flex: 1, minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 16, color: 'var(--ink)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {creatorName}
          </h3>
          {/* Only Growth is tagged. Every other deal is a Deals deal, and a tag
              on all of them would be one word repeated down the whole list. */}
          {d.track === 'growth' && <TrackTag track="growth" size="sm" />}
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 400, color: 'var(--wg-500)', marginTop: 5, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {subtitle}
        </div>
      </div>

      <span className="dstage" style={{
        flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        width: 150, padding: '6px 10px', borderRadius: 999,
        fontFamily: 'var(--font-ui)', fontSize: 11.5, fontWeight: 600, letterSpacing: '.01em',
        whiteSpace: 'nowrap' as const,
        background: mixWithWhite(stage.bg, 45),
        border: `1px solid ${stage.dot}30`,
        color: 'var(--wg-600)',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: stage.dot }} />
        {stage.label}
      </span>

      <div className="dmoney" style={{ flexShrink: 0, textAlign: 'right' as const, minWidth: 110 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22, letterSpacing: '-0.02em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums lining-nums' }}>
          {total != null ? `₹${(total / 100).toLocaleString('en-IN')}` : '—'}
        </div>
      </div>

      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--wg-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="m9 18 6-6-6-6" />
      </svg>
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
/* The design's console: plain white, radius 20, no shadow and no border. The
   rows' own hairlines carry the structure, so a shadow around them would put a
   second edge inside the page's own card. */
const consoleCard: React.CSSProperties = {
  borderRadius: 20,
  background: '#FFFFFF',
  marginTop: 30,
  overflow: 'hidden',
}
