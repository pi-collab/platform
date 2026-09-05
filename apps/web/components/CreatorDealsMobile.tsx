'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  STAGE, TAB_DEFS, EMPTY, resolveStatus, needsAction, isLive, matchFilter,
  formatRupees, getInitials, type Deal,
} from '@/lib/deal-stage'

/**
 * Creator deals, mobile — built to "Creator Deals - Mobile Standalone".
 *
 * Renders below 720px; CreatorDealsTable keeps desktop. The table had NO media
 * queries at all, so a phone was being served a desktop table with columns.
 *
 * Almost none of this is new logic. The stage map, the filters, "needs you" and
 * "live now" already existed in the table and now live in lib/deal-stage.ts —
 * this file is the phone's presentation of them.
 *
 * ── Where it departs from the mockup ──────────────────────────────────────
 * • THIRD KPI IS "Total deals", per the design. The desktop's third figure is
 *   the VALUE of live deals, which is a different question; the design asked
 *   for a count and a count is what this shows.
 * • SORT IS NOT INCLUDED. The design has no sort control and the row order is
 *   "needs you first, then newest" — the desktop default. Adding a hidden sort
 *   would be inventing a control the design deliberately left out.
 */

const PAGE_SIZE = 8

export default function CreatorDealsMobile({ deals }: { deals: Deal[] }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const resolved = useMemo(
    () => deals.map((d) => ({ ...d, st: resolveStatus(d) })),
    [deals],
  )

  const kpiAction = resolved.filter((d) => needsAction(d.st)).length
  const kpiLive = resolved.filter((d) => isLive(d.st)).length
  const kpiTotal = resolved.length

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const [id] of TAB_DEFS) m[id] = resolved.filter((d) => matchFilter(d.st, id)).length
    return m
  }, [resolved])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = resolved.filter((d) => {
      if (!matchFilter(d.st, filter)) return false
      if (!q) return true
      // Deal ref included: it is how someone refers to a deal in a message,
      // so it is what they will paste into a search box.
      return [d.brand, d.title, d.deliverables, d.deal_ref]
        .some((v) => v && v.toLowerCase().includes(q))
    })
    // Needs-you first, then newest. The desktop's default, kept because the
    // design shows no sort control and a phone list is scanned top-down.
    return list.sort((a, b) => {
      const ha = needsAction(a.st) ? 0 : 1
      const hb = needsAction(b.st) ? 0 : 1
      if (ha !== hb) return ha - hb
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [resolved, filter, search])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const shown = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const [emptyTitle, emptyText] = EMPTY[filter] ?? EMPTY.all

  function changeFilter(id: string) {
    setFilter(id)
    setPage(0)
  }

  return (
    <div className="cdeals-m">
      <header className="cdeals-m__head">
        <h1 className="cdeals-m__title">
          Deals at <span className="cdeals-m__title-em">a glance</span>
        </h1>
        <Link href="/creator/notifications?from=deals" className="cdeals-m__bell" aria-label="Notifications">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </Link>
      </header>

      <div className="cdeals-m__top">
        {/* Three-up hero. Counts, not money — the design asks "how many need
            me / are live / exist", which is what a phone glance is for. */}
        <div className="cdeals-m__kpis">
          <div className="cdeals-m__kpi">
            <div className="cdeals-m__kpi-label">Needs you</div>
            <div className="cdeals-m__kpi-value">{kpiAction}</div>
          </div>
          <div className="cdeals-m__kpi">
            <div className="cdeals-m__kpi-label">Live now</div>
            <div className="cdeals-m__kpi-value">{kpiLive}</div>
          </div>
          <div className="cdeals-m__kpi">
            <div className="cdeals-m__kpi-label">Total deals</div>
            <div className="cdeals-m__kpi-value">{kpiTotal}</div>
          </div>
        </div>

        <div className="cdeals-m__search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#565C68" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            placeholder="Search brand, deal or reference"
            aria-label="Search deals"
          />
          {search && (
            <button type="button" onClick={() => { setSearch(''); setPage(0) }} aria-label="Clear search" className="cdeals-m__clear">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        <div className="cdeals-m__tabs" role="tablist" aria-label="Filter deals">
          {TAB_DEFS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              onClick={() => changeFilter(id)}
              className={`cdeals-m__tab${filter === id ? ' is-on' : ''}`}
            >
              {label}
              <span className="cdeals-m__tab-count">{counts[id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="cdeals-m__rows">
        {shown.length === 0 ? (
          <div className="cdeals-m__empty">
            <h2>{emptyTitle}</h2>
            <p>{search ? `Nothing matches “${search}”.` : emptyText}</p>
          </div>
        ) : (
          shown.map((d) => {
            const st = STAGE[d.st] ?? STAGE.negotiating
            const brand = d.brand || 'Brand'
            const sub = [d.title, d.deliverables].filter(Boolean).join(' · ')
            return (
              <Link key={d.id} href={`/creator/deals/${d.id}`} className="cdeals-m__row">
                <div className="cdeals-m__row-top">
                  <span className="cdeals-m__avatar" aria-hidden="true">{getInitials(brand)}</span>
                  <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                    <div className="cdeals-m__brand">{brand}</div>
                    {sub && <div className="cdeals-m__sub">{sub}</div>}
                  </div>
                  {d.price_paise != null && d.price_paise > 0 && (
                    <div className="cdeals-m__price">{formatRupees(d.price_paise)}</div>
                  )}
                </div>
                <div className="cdeals-m__row-foot">
                  <span
                    className="cdeals-m__stage"
                    style={{ background: `color-mix(in srgb, ${st.bg} 55%, #fff)` }}
                  >
                    <span className="cdeals-m__stage-dot" style={{ background: st.dot }} />
                    {st.short}
                  </span>
                  <span style={{ flex: 1 }} />
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                </div>
              </Link>
            )
          })
        )}
      </div>

      {rows.length > PAGE_SIZE && (
        <div className="cdeals-m__pager">
          <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} aria-label="Previous page">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <span className="cdeals-m__page-label">Page {safePage + 1} of {pageCount}</span>
          <button type="button" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} aria-label="Next page">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <p className="cdeals-m__result">
          {rows.length} deal{rows.length === 1 ? '' : 's'}{filter !== 'all' ? ' in this filter' : ''}
        </p>
      )}
    </div>
  )
}
