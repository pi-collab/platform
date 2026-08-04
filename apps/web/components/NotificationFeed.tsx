'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { markNotificationRead, markAllNotificationsRead } from '@/app/notifications/actions'

interface Notification {
  id: string
  deal_id: string | null
  type: string
  body: string
  read_at: string | null
  created_at: string
}

interface CreatorInfo {
  name: string
  photo: string | null
  pricePaise: number | null
}

interface Props {
  notifications: Notification[]
  dealLinkPrefix: string
  unreadCount: number
  creatorMap?: Record<string, CreatorInfo>
  variant?: 'brand' | 'creator'
}

type Filter = 'all' | 'unread' | 'submissions' | 'offers' | 'payments' | 'deals'

const BRAND_FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'payments', label: 'Payments' },
  { id: 'deals', label: 'Deals' },
]

const CREATOR_FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'offers', label: 'Offers' },
  { id: 'payments', label: 'Payments' },
  { id: 'deals', label: 'Deals' },
]

// Gradients matching the HTML design (pastel tones with sec-2 purple hints)
const AVATAR_GRADS = [
  'linear-gradient(135deg,#E9E2FF,#DEF0FF)',   // lavender → sky
  'linear-gradient(135deg,#FFEEE2,#FFE1EC)',   // peach → pink
  'linear-gradient(135deg,#D6F0F5,#E8FAFC)',   // cyan → light cyan
  'linear-gradient(135deg,#F7F4FB,#F7F4FB)',   // sec-2 purple (solid)
  'linear-gradient(135deg,#F7F4FB,#FFE0EC)',   // sec-2 → pink
  'linear-gradient(135deg,#F5EDE0,#FFF8E6)',   // warm cream
]

function nameToGradIndex(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  return Math.abs(hash) % AVATAR_GRADS.length
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100_000) { const v = rupees / 100_000; return `\u20B9${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}L` }
  if (rupees >= 1_000) return `\u20B9${Math.round(rupees / 1_000)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function getBucket(iso: string): 'today' | 'week' | 'older' {
  const now = new Date()
  const d = new Date(iso)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (d >= startOfToday) return 'today'
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
  if (d >= startOfWeek) return 'week'
  return 'older'
}

const SUBMISSION_TYPES = new Set(['deliverable_submitted', 'content_posted', 'submission', 'delivered'])
const OFFER_TYPES = new Set(['offer_sent', 'offer_declined', 'offer'])
const PAYMENT_TYPES = new Set(['invoice_issued', 'invoice_accepted', 'payment_paid', 'payment', 'invoice'])
// Brand: deals = everything except submissions/payments/messages
const BRAND_DEAL_TYPES = new Set(['offer_sent', 'deal_agreed', 'offer_declined', 'deal_approved', 'revision_requested', 'product_shipped', 'product_delivered', 'accepted', 'complete', 'cancelled', 'declined', 'agreed', 'approval', 'shipping'])
// Creator: deals = invoice, approval, shipping, delivery (per HTML)
const CREATOR_DEAL_TYPES = new Set(['invoice_issued', 'invoice_accepted', 'deal_agreed', 'deal_approved', 'product_shipped', 'product_delivered', 'invoice', 'approval', 'shipping', 'delivery', 'agreed', 'complete'])

function matchesFilter(n: Notification, f: Filter, allRead: boolean, variant: 'brand' | 'creator'): boolean {
  if (f === 'all') return true
  if (f === 'unread') return !n.read_at && !allRead
  if (f === 'submissions') return SUBMISSION_TYPES.has(n.type)
  if (f === 'offers') return OFFER_TYPES.has(n.type)
  if (f === 'payments') return PAYMENT_TYPES.has(n.type)
  if (f === 'deals') return variant === 'creator' ? CREATOR_DEAL_TYPES.has(n.type) : BRAND_DEAL_TYPES.has(n.type)
  return true
}

const BRAND_DESC: Record<string, string> = {
  offer_sent: 'New offer sent',
  deal_agreed: 'Deal accepted \u00B7 the deal is now active',
  offer_declined: 'Offer declined',
  deal_approved: 'Content approved',
  revision_requested: 'Revision requested',
  deliverable_submitted: 'Content ready for your review',
  invoice_issued: 'Invoice received \u00B7 payment awaiting your release',
  invoice_accepted: 'Invoice accepted',
  payment_paid: 'Payment released',
  content_posted: 'Content is now live',
  product_shipped: 'Product shipped',
  product_delivered: 'Product delivered',
  new_message: 'New message',
  accepted: 'Deal accepted \u00B7 the deal is now active',
  submission: 'Content ready for your review',
  invoice: 'Invoice received \u00B7 payment awaiting your release',
  payment: 'Payment released',
  complete: 'Deal completed',
  message: 'New message',
  shipping: 'Product shipped',
  delivered: 'Content delivered',
  approval: 'Content approved',
  agreed: 'Deal accepted \u00B7 the deal is now active',
  declined: 'Offer declined',
  cancelled: 'Deal cancelled',
}

const CREATOR_DESC: Record<string, string> = {
  offer_sent: 'New offer \u00B7 review the terms',
  deal_agreed: 'You accepted the terms',
  offer_declined: 'Offer declined',
  deal_approved: 'Deliverables approved \u00B7 time to get paid',
  revision_requested: 'Revision requested',
  deliverable_submitted: 'Deliverables submitted',
  invoice_issued: 'Invoice sent',
  invoice_accepted: 'Invoice accepted \u00B7 payment is being processed',
  payment_paid: 'Sent to your linked account',
  content_posted: 'Content is now live',
  product_shipped: 'Tracking added to the deal',
  product_delivered: 'Everything is here \u00B7 time to create',
  new_message: 'New message',
  accepted: 'You accepted the terms',
  submission: 'Deliverables submitted',
  invoice: 'Invoice accepted \u00B7 payment is being processed',
  payment: 'Sent to your linked account',
  complete: 'Deal completed',
  message: 'New message',
  shipping: 'Tracking added to the deal',
  delivered: 'Everything is here \u00B7 time to create',
  delivery: 'Everything is here \u00B7 time to create',
  approval: 'You accepted the terms',
  agreed: 'You accepted the terms',
  declined: 'Offer declined',
  cancelled: 'Deal cancelled',
  offer: 'New offer \u00B7 review the terms',
  approved: 'Deliverables approved',
}

function typeDescription(type: string, variant: 'brand' | 'creator'): string {
  const map = variant === 'creator' ? CREATOR_DESC : BRAND_DESC
  return map[type] || type
}

const PAGE_SIZE = 10

export default function NotificationFeed({ notifications, dealLinkPrefix, unreadCount, creatorMap = {}, variant = 'brand' }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [allRead, setAllRead] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [pending, startTransition] = useTransition()

  function handleMarkAllRead() {
    setAllRead(true)
    startTransition(() => { markAllNotificationsRead() })
  }

  // Reset visible count when filter changes
  function handleFilterChange(f: Filter) {
    setFilter(f)
    setVisibleCount(PAGE_SIZE)
  }

  const effectiveUnread = allRead ? 0 : unreadCount
  const filters = variant === 'creator' ? CREATOR_FILTERS : BRAND_FILTERS
  const filtered = notifications.filter((n) => matchesFilter(n, filter, allRead, variant))
  const totalFiltered = filtered.length
  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < totalFiltered

  const buckets: { key: string; label: string; items: Notification[] }[] = []
  const todayItems = visible.filter((n) => getBucket(n.created_at) === 'today')
  const weekItems = visible.filter((n) => getBucket(n.created_at) === 'week')
  const olderItems = visible.filter((n) => getBucket(n.created_at) === 'older')
  if (todayItems.length > 0) buckets.push({ key: 'today', label: 'Today', items: todayItems })
  if (weekItems.length > 0) buckets.push({ key: 'week', label: 'This week', items: weekItems })
  if (olderItems.length > 0) buckets.push({ key: 'older', label: 'Earlier', items: olderItems })

  const summary = effectiveUnread === 0
    ? "You're all caught up — nothing needs your attention."
    : `You have ${effectiveUnread} unread ${effectiveUnread === 1 ? 'notification' : 'notifications'}.`

  return (
    <div style={outerCard}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={titleStyle}>Notifications</h1>
        {effectiveUnread > 0 && (
          <button onClick={handleMarkAllRead} disabled={pending} style={markAllBtnStyle}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 7 17l-5-5" /><path d="m22 10-7.5 7.5L13 16" /></svg>
            Mark all read
          </button>
        )}
      </div>

      {/* Summary */}
      <div style={summaryRow}>
        <svg width="15" height="15" viewBox="0 0 336 336" fill="none"><path d="M168 12C278 12 324 112 324 188C324 276 252 324 168 324C84 324 12 276 12 188C12 112 58 12 168 12Z" fill="#E8FF66" /></svg>
        <span>{summary}</span>
      </div>

      {/* Filter tabs */}
      <div style={filterRow}>
        {filters.map((f) => {
          const active = filter === f.id
          return (
            <button
              key={f.id}
              onClick={() => handleFilterChange(f.id)}
              style={{
                padding: '8px 15px', borderRadius: 999,
                fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
                whiteSpace: 'nowrap', cursor: 'pointer',
                color: active ? 'var(--ink)' : 'var(--ink-faint)',
                background: active ? 'var(--card)' : 'transparent',
                border: active ? '1px solid rgba(255,255,255,.85)' : '1px solid transparent',
                boxShadow: active ? '0 4px 12px -8px rgba(40,45,25,.5)' : 'none',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* Notification sections */}
      <div style={{ marginTop: 14 }}>
        {buckets.length === 0 ? (
          <div style={emptyState}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D4D4CB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--ink)', margin: '14px 0 0', letterSpacing: '-0.01em' }}>
              {filter === 'unread' ? "You're all caught up" : 'Nothing here yet'}
            </p>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-faint)', margin: '8px 0 0', lineHeight: 1.5, maxWidth: 320 }}>
              {filter === 'unread'
                ? 'No unread notifications — new submissions, deals and payments will land here.'
                : 'There are no notifications in this filter right now.'}
            </p>
          </div>
        ) : (
          buckets.map((section) => (
            <div key={section.key} style={{ marginTop: 18 }}>
              <div style={sectionLabel}>{section.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {section.items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    dealLinkPrefix={dealLinkPrefix}
                    creatorInfo={n.deal_id ? creatorMap[n.deal_id] : undefined}
                    allRead={allRead}
                    variant={variant}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        {/* Load more */}
        {hasMore && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              style={loadMoreBtn}
            >
              Load more
              <span style={{ fontWeight: 400, color: 'var(--ink-faint)', fontSize: 12 }}>
                ({totalFiltered - visibleCount} remaining)
              </span>
            </button>
          </div>
        )}
      </div>

      <style>{`
        .ncard { transition: box-shadow .16s ease, transform .12s ease; cursor: pointer; }
        .ncard:hover { transform: translateY(-1px); box-shadow: 0 16px 34px -18px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.95) !important; }
        .ncard .nchev { opacity: 0.4; transition: opacity .15s ease, transform .15s ease; }
        .ncard:hover .nchev { opacity: 1; transform: translateX(2px); }
      `}</style>
    </div>
  )
}

function NotificationRow({ notification: n, dealLinkPrefix, creatorInfo, allRead, variant }: {
  notification: Notification
  dealLinkPrefix: string
  creatorInfo?: CreatorInfo
  allRead: boolean
  variant: 'brand' | 'creator'
}) {
  const [pending, startTransition] = useTransition()
  const isUnread = !n.read_at && !allRead
  const href = n.deal_id ? `${dealLinkPrefix}/${n.deal_id}` : '#'
  const ago = timeAgo(n.created_at)

  const avatarName = creatorInfo?.name || 'Guapd'
  const initials = getInitials(avatarName)
  const grad = AVATAR_GRADS[nameToGradIndex(avatarName)]

  const isPayment = PAYMENT_TYPES.has(n.type) || n.type === 'payment_paid'
  const isSubmission = variant === 'brand' && SUBMISSION_TYPES.has(n.type)
  const isOffer = variant === 'creator' && OFFER_TYPES.has(n.type)
  const showAmount = isPayment && creatorInfo?.pricePaise && creatorInfo.pricePaise > 0
  const showOfferAmount = isOffer && creatorInfo?.pricePaise && creatorInfo.pricePaise > 0
  const desc = typeDescription(n.type, variant)

  function handleClick() {
    if (isUnread) {
      startTransition(() => { markNotificationRead(n.id) })
    }
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="ncard"
      style={{
        ...rowBase,
        border: isUnread
          ? '1px solid rgba(210,240,74,.85)'
          : '1px solid rgba(255,255,255,.85)',
        boxShadow: isUnread
          ? '0 14px 30px -18px rgba(40,45,25,.45), 0 0 0 3px rgba(232,255,102,.13), inset 0 1px 0 rgba(255,255,255,.95)'
          : '0 12px 28px -20px rgba(40,45,25,.42), inset 0 1px 0 rgba(255,255,255,.95)',
        opacity: pending ? 0.6 : 1,
      }}
    >
      {/* Avatar */}
      {creatorInfo?.photo ? (
        <img
          src={creatorInfo.photo}
          alt={avatarName}
          style={avatarImgStyle}
        />
      ) : (
        <span style={{ ...avatarStyle, background: grad }}>
          {initials}
        </span>
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--font-ui)', fontWeight: isUnread ? 700 : 600,
            fontSize: 15, color: 'var(--ink)',
          }}>
            {n.body}
          </span>
          {isUnread && (
            <span style={newChip}>New</span>
          )}
        </div>
        <div style={{
          fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)',
          marginTop: 4, lineHeight: 1.45,
        }}>
          {desc}
          <span style={{ color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}> · {ago}</span>
        </div>
      </div>

      {/* Right side */}
      {showAmount ? (
        <span style={amountPill}>
          {variant === 'creator' ? '+' : ''}{formatRupees(creatorInfo!.pricePaise!)}
        </span>
      ) : showOfferAmount ? (
        <span style={amountPill}>
          {formatRupees(creatorInfo!.pricePaise!)}
        </span>
      ) : isSubmission ? (
        <span style={reviewBtn}>
          Review
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </span>
      ) : isOffer ? (
        <span style={reviewBtn}>
          View
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </span>
      ) : (
        <svg className="nchev" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m9 18 6-6-6-6" /></svg>
      )}
    </Link>
  )
}

// ── Styles ──

const outerCard: React.CSSProperties = {
  borderRadius: 26,
  border: '1px solid rgba(255,255,255,.85)',
  background: 'var(--card)',
  boxShadow: '0 34px 66px -34px rgba(40,45,25,.42), inset 0 1px 0 rgba(255,255,255,.9)',
  padding: 'clamp(18px, 3vw, 26px)',
}

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 'clamp(22px, 2.5vw, 28px)',
  letterSpacing: '-0.025em',
  lineHeight: 1.05,
  margin: 0,
  color: 'var(--ink)',
}

const summaryRow: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--ink-soft)',
  marginTop: 10,
  lineHeight: 1.4,
  borderRadius: 10,
  padding: '4px 6px',
  marginLeft: -6,
}

const markAllBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '9px 15px',
  borderRadius: 999,
  background: 'var(--card)',
  border: '1px solid rgba(255,255,255,.85)',
  fontFamily: 'var(--font-ui)',
  fontWeight: 600,
  fontSize: 12.5,
  color: 'var(--ink)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const filterRow: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  marginTop: 20,
  paddingBottom: 2,
  overflowX: 'auto',
}

const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontWeight: 600,
  fontSize: 10.5,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink-faint)',
  margin: '0 2px 9px',
}

const rowBase: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '15px 16px',
  borderRadius: 16,
  textDecoration: 'none',
  background: 'var(--card)',
  color: 'inherit',
}

const avatarStyle: React.CSSProperties = {
  width: 46, height: 46, borderRadius: 13, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
  color: 'var(--ink)',
  border: '1px solid rgba(255,255,255,.85)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9), 0 4px 12px -8px rgba(40,45,25,.35)',
}

const avatarImgStyle: React.CSSProperties = {
  width: 46, height: 46, borderRadius: 13, flexShrink: 0,
  objectFit: 'cover',
  border: '1px solid rgba(255,255,255,.85)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9), 0 4px 12px -8px rgba(40,45,25,.35)',
}

const newChip: React.CSSProperties = {
  flexShrink: 0,
  padding: '2px 8px',
  borderRadius: 999,
  background: 'var(--neon)',
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 9.5,
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  color: 'var(--ink)',
}

const reviewBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  flexShrink: 0,
  padding: '8px 14px',
  borderRadius: 999,
  background: 'var(--card)',
  border: '1px solid rgba(255,255,255,.85)',
  fontFamily: 'var(--font-ui)',
  fontWeight: 600,
  fontSize: 12.5,
  color: 'var(--ink)',
  whiteSpace: 'nowrap',
}

// Amount pill uses the HTML's sec-2/sec-mid-2/sec-ink colors (purple tint)
const amountPill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0,
  padding: '7px 12px',
  borderRadius: 999,
  background: '#F7F4FB',
  border: '1px solid #E8E2F0',
  fontFamily: 'var(--font-ui)',
  fontWeight: 700,
  fontSize: 13,
  color: '#79809C',
  whiteSpace: 'nowrap',
}

const loadMoreBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 22px',
  borderRadius: 999,
  background: 'var(--card)',
  border: '1px solid rgba(255,255,255,.85)',
  boxShadow: '0 4px 12px -8px rgba(40,45,25,.35)',
  fontFamily: 'var(--font-ui)',
  fontWeight: 600,
  fontSize: 13,
  color: 'var(--ink)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const emptyState: React.CSSProperties = {
  padding: '48px 24px',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}
