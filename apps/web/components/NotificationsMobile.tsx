'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { markAllNotificationsRead } from '@/app/notifications/actions'
import {
  AVATAR_GRADS, nameToGradIndex, getInitials, formatRupees, getBucket,
  matchesFilter, typeDescription, BRAND_FILTERS, CREATOR_FILTERS,
  type Notification, type CreatorInfo, type Variant, type Filter,
} from '@/lib/notification-format'
import type { PriorityItem } from '@/lib/notification-priority'

/**
 * Notifications, mobile — built to "Creator Notifications - Mobile Standalone".
 *
 * Renders below 720px only; the existing NotificationFeed still serves desktop.
 * Both are mounted and CSS picks one, matching how the empty state on this
 * screen already works.
 *
 * ── Departures from the mockup, and why ────────────────────────────────────
 * • FILTER CHIPS KEPT. The design has none. They were kept deliberately: they
 *   already exist and are how someone finds an old payment notification, and a
 *   screen that only groups by Today/Earlier gives them no way back to it.
 *   Placed under the summary card so the priority item still leads.
 * • "Respond in 2 days" IS NOT SHOWN. No offer expiry exists in the schema and
 *   nothing expires an offer, so a countdown would be a promise the product
 *   does not keep. It shows how long the offer HAS waited instead — true, and
 *   it carries the same urgency. See lib/notification-priority.ts.
 * • BRAND CARD ASKS A DIFFERENT QUESTION. A brand never answers offers, so
 *   theirs counts content awaiting their approval.
 */

interface Props {
  notifications: Notification[]
  dealLinkPrefix: string
  unreadCount: number
  creatorMap?: Record<string, CreatorInfo>
  variant?: Variant
  priority?: PriorityItem[]
  backHref?: string
}

function waitingLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'Came in today'
  if (days === 1) return 'Waiting since yesterday'
  return `Waiting ${days} days`
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function NotificationsMobile({
  notifications, dealLinkPrefix, unreadCount, creatorMap = {},
  variant = 'brand', priority = [], backHref,
}: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [allRead, setAllRead] = useState(false)
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()

  const filters = variant === 'creator' ? CREATOR_FILTERS : BRAND_FILTERS
  const shown = allRead ? 0 : unreadCount
  const needs = priority.length

  function handleMarkAllRead() {
    setAllRead(true)
    startTransition(() => { markAllNotificationsRead() })
  }

  const filtered = notifications.filter((n) => matchesFilter(n, filter, allRead, variant))
  const today = filtered.filter((n) => getBucket(n.created_at) === 'today')
  const earlier = filtered.filter((n) => getBucket(n.created_at) !== 'today')
  const groups = [
    { key: 'today', label: 'Today', items: today },
    { key: 'earlier', label: 'Earlier', items: earlier },
  ].filter((g) => g.items.length > 0)

  return (
    <div className="notif-m">
      {/* Header — sticky, so "Mark all read" stays reachable down a long list */}
      <header className="notif-m__head">
        <div className="notif-m__head-row">
          <div className="notif-m__title-wrap">
            {backHref && (
              <Link href={backHref} className="notif-m__back" aria-label="Back">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              </Link>
            )}
            <h1 className="notif-m__title">Notifications</h1>
          </div>
          {shown > 0 && (
            <button type="button" onClick={handleMarkAllRead} className="notif-m__markall">
              Mark all read
            </button>
          )}
        </div>

        {/* Summary — the accordion from the design. Collapsed by default, and
            only interactive when there is something behind it to open. */}
        {(shown > 0 || needs > 0) && (
          <div className="notif-m__summary">
            <button
              type="button"
              className="notif-m__summary-row"
              onClick={() => needs > 0 && setOpen((v) => !v)}
              aria-expanded={needs > 0 ? open : undefined}
              style={{ cursor: needs > 0 ? 'pointer' : 'default' }}
            >
              <span className="notif-m__dot" aria-hidden="true" />
              <span className="notif-m__summary-text">
                {shown > 0 && <>{shown} unread</>}
                {shown > 0 && needs > 0 && ', '}
                {needs > 0 && (
                  <strong>
                    {needs} needs your {variant === 'creator' ? 'reply' : 'review'}
                  </strong>
                )}
              </span>
              {needs > 0 && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9AA08C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                     style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              )}
            </button>

            {open && needs > 0 && (
              <div className="notif-m__priority-list">
                {priority.map((p) => (
                  <div key={p.dealId} className="notif-m__priority">
                    <div className="notif-m__priority-top">
                      <span
                        className="notif-m__avatar notif-m__avatar--lg"
                        style={{ background: AVATAR_GRADS[nameToGradIndex(p.counterpart)] }}
                        aria-hidden="true"
                      >
                        {getInitials(p.counterpart)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="notif-m__priority-title">
                          {variant === 'creator'
                            ? <>New offer from {p.counterpart}</>
                            : <>{p.counterpart} sent work to review</>}
                        </div>
                        <div className="notif-m__priority-sub">
                          {p.deliverables || p.title}
                        </div>
                      </div>
                      {p.pricePaise != null && p.pricePaise > 0 && (
                        <div className="notif-m__priority-amount">{formatRupees(p.pricePaise)}</div>
                      )}
                    </div>
                    <div className="notif-m__priority-foot">
                      <span className="notif-m__waiting">{waitingLabel(p.waitingSince)}</span>
                      <Link href={`${dealLinkPrefix}/${p.dealId}`} className="notif-m__cta">
                        {variant === 'creator' ? 'Review offer' : 'Review work'}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Kept from the existing feed — see the note at the top of this file. */}
        <div className="notif-m__filters" role="tablist" aria-label="Filter notifications">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`notif-m__chip${filter === f.id ? ' is-on' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <div className="notif-m__body">
        {groups.length === 0 ? (
          <p className="notif-m__empty">
            {filter === 'all'
              ? 'Nothing here yet. Updates about offers, deals and payments will show up here.'
              : 'Nothing matches this filter.'}
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.key} className="notif-m__group">
              <h2 className="notif-m__group-label">{g.label}</h2>
              <div className="notif-m__card">
                {g.items.map((n) => {
                  const info = n.deal_id ? creatorMap[n.deal_id] : undefined
                  const who = info?.name ?? null
                  const desc = typeDescription(n.type, variant)
                  const href = n.deal_id ? `${dealLinkPrefix}/${n.deal_id}` : null
                  const unread = !n.read_at && !allRead
                  const inner = (
                    <>
                      <span
                        className="notif-m__avatar"
                        style={{ background: who ? AVATAR_GRADS[nameToGradIndex(who)] : '#E7EAF0' }}
                        aria-hidden="true"
                      >
                        {who ? getInitials(who) : '•'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="notif-m__row-title">
                          {who && <strong>{who} </strong>}
                          <span>{desc}</span>
                        </div>
                        <div className="notif-m__row-sub">
                          {n.body ? `${n.body} · ` : ''}{dayLabel(n.created_at)}
                        </div>
                      </div>
                      {unread && <span className="notif-m__unread" aria-label="Unread" />}
                      {href && (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C9CCC2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                      )}
                    </>
                  )
                  return href
                    ? <Link key={n.id} href={href} className="notif-m__row">{inner}</Link>
                    : <div key={n.id} className="notif-m__row">{inner}</div>
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
