'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

/**
 * Inbox list, mobile — built to "Creator Inbox List - Mobile Standalone".
 *
 * Shared by the creator and brand inboxes: the design is the same list on both
 * sides, only the counterpart differs (a brand's name to a creator, a creator's
 * to a brand), so this takes an already-normalised `name`/`initials` rather
 * than knowing which side it is on.
 *
 * ── List state only ────────────────────────────────────────────────────────
 * The mockup is the LIST; tapping a row opens a separate thread screen, which
 * has its own design we do not have. So this renders when no thread is
 * selected, and hands over to the existing master-detail view once `?deal=` is
 * set. Rows link to that same `?deal=` the desktop view already understands.
 *
 * ── Unread, per the design ─────────────────────────────────────────────────
 * Four things change together, and it is worth listing because they are easy to
 * half-implement: a neon ring on the avatar, the name at 700 instead of 600,
 * the preview in ink at 600 instead of grey at 400, and a neon-deep dot after
 * the preview. The card's shadow also deepens (.2 against .16). Together they
 * make an unread row read as heavier without any badge or count.
 */

export interface InboxThread {
  dealId: string
  dealTitle: string
  dealStatus: string
  name: string
  initials: string
  lastMessage: string
  createdAt: string
}

const TERMINAL_STATUSES = ['complete', 'declined', 'cancelled']
const ACTIVE_STATUSES = ['negotiating', 'agreed', 'delivered', 'revision', 'approved']

type FilterKey = 'all' | 'unread' | 'active' | 'completed'
const FILTERS: [FilterKey, string][] = [
  ['all', 'All'], ['unread', 'Unread'], ['active', 'Active'], ['completed', 'Completed'],
]

/**
 * Today shows a clock, this week a weekday, older a date — the design's three
 * forms. A bare time on a three-week-old message reads as "just now".
 */
function stamp(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (d >= startOfToday) {
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  }
  const weekAgo = new Date(startOfToday)
  weekAgo.setDate(weekAgo.getDate() - 6)
  if (d >= weekAgo) return d.toLocaleDateString('en-IN', { weekday: 'short' })
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function InboxListMobile({
  threads, unreadByDeal = {}, basePath, notificationsHref,
}: {
  threads: InboxThread[]
  unreadByDeal?: Record<string, number>
  /** '/creator/inbox' or '/inbox' — rows link to `${basePath}?deal=<id>`. */
  basePath: string
  notificationsHref: string
}) {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [search, setSearch] = useState('')

  const counts = useMemo(() => ({
    all: threads.length,
    unread: threads.filter((t) => (unreadByDeal[t.dealId] ?? 0) > 0).length,
    active: threads.filter((t) => ACTIVE_STATUSES.includes(t.dealStatus)).length,
    completed: threads.filter((t) => TERMINAL_STATUSES.includes(t.dealStatus)).length,
  }), [threads, unreadByDeal])

  const rows = useMemo(() => {
    let list = threads
    if (filter === 'unread') list = list.filter((t) => (unreadByDeal[t.dealId] ?? 0) > 0)
    else if (filter === 'active') list = list.filter((t) => ACTIVE_STATUSES.includes(t.dealStatus))
    else if (filter === 'completed') list = list.filter((t) => TERMINAL_STATUSES.includes(t.dealStatus))

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((t) =>
        [t.name, t.lastMessage, t.dealTitle].some((v) => v && v.toLowerCase().includes(q)))
    }
    return list
  }, [threads, unreadByDeal, filter, search])

  return (
    <div className="inbox-m">
      <header className="inbox-m__head">
        <h1 className="inbox-m__title">Messages</h1>
        <Link href={notificationsHref} className="inbox-m__bell" aria-label="Notifications">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </Link>
      </header>

      <div className="inbox-m__top">
        <div className="inbox-m__searchrow">
          <div className="inbox-m__search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#565C68" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages"
              aria-label="Search messages"
            />
          </div>
          {/* The design's second control. It is the filters the desktop view
              already has, rather than a new idea — same four keys, same
              meaning, so a filter cannot mean one thing per screen. */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`inbox-m__filterbtn${showFilters || filter !== 'all' ? ' is-on' : ''}`}
            aria-expanded={showFilters}
            aria-label="Filter conversations"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" />
            </svg>
          </button>
        </div>

        {showFilters && (
          <div className="inbox-m__filters" role="tablist" aria-label="Filter conversations">
            {FILTERS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                onClick={() => setFilter(id)}
                className={`inbox-m__chip${filter === id ? ' is-on' : ''}`}
              >
                {label}<span className="inbox-m__chip-count">{counts[id]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="inbox-m__rows">
        {rows.length === 0 ? (
          <p className="inbox-m__empty">
            {search
              ? `No conversations match “${search}”.`
              : filter === 'unread'
                ? 'Nothing unread. You are all caught up.'
                : 'No conversations yet. Messages about a deal appear here.'}
          </p>
        ) : (
          rows.map((t) => {
            const unread = (unreadByDeal[t.dealId] ?? 0) > 0
            return (
              <Link
                key={t.dealId}
                href={`${basePath}?deal=${t.dealId}`}
                className={`inbox-m__row${unread ? ' is-unread' : ''}`}
              >
                <div className="inbox-m__row-inner">
                  <span className={`inbox-m__avatar${unread ? ' is-unread' : ''}`} aria-hidden="true">
                    {t.initials}
                  </span>
                  <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                    <div className="inbox-m__row-top">
                      <span className="inbox-m__name">{t.name}</span>
                      <span className="inbox-m__time">{stamp(t.createdAt)}</span>
                    </div>
                    <div className="inbox-m__preview-row">
                      <p className="inbox-m__preview">{t.lastMessage || 'No messages yet'}</p>
                      {unread && <span className="inbox-m__dot" aria-label="Unread" />}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
