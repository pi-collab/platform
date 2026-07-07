'use client'

import { useTransition } from 'react'
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

interface Props {
  notifications: Notification[]
  dealLinkPrefix: string // '/deals' for brand, '/creator/deals' for creator
  unreadCount: number
}

export default function NotificationFeed({ notifications, dealLinkPrefix, unreadCount }: Props) {
  const [pending, startTransition] = useTransition()

  function handleMarkAllRead() {
    startTransition(() => { markAllNotificationsRead() })
  }

  if (notifications.length === 0) {
    return (
      <div style={emptyState}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <p style={{ fontSize: '1rem', fontWeight: 600, color: '#111', margin: '0.75rem 0 0.25rem' }}>
          No notifications yet
        </p>
        <p style={{ fontSize: '0.875rem', color: '#888', margin: 0 }}>
          When something happens on your deals, you&apos;ll see it here.
        </p>
      </div>
    )
  }

  return (
    <div>
      {unreadCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
          <button
            onClick={handleMarkAllRead}
            disabled={pending}
            style={markAllBtn}
          >
            {pending ? 'Marking...' : 'Mark all as read'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {notifications.map((n) => (
          <NotificationRow
            key={n.id}
            notification={n}
            dealLinkPrefix={dealLinkPrefix}
          />
        ))}
      </div>
    </div>
  )
}

function NotificationRow({ notification: n, dealLinkPrefix }: { notification: Notification; dealLinkPrefix: string }) {
  const [pending, startTransition] = useTransition()
  const isUnread = !n.read_at
  const href = n.deal_id ? `${dealLinkPrefix}/${n.deal_id}` : '#'

  function handleClick() {
    if (isUnread) {
      startTransition(() => { markNotificationRead(n.id) })
    }
  }

  const ago = timeAgo(n.created_at)

  return (
    <Link
      href={href}
      onClick={handleClick}
      style={{
        ...row,
        background: isUnread ? '#f8f9ff' : '#fff',
        borderLeft: isUnread ? '3px solid #111' : '3px solid transparent',
        opacity: pending ? 0.6 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ ...rowBody, fontWeight: isUnread ? 600 : 400 }}>{n.body}</p>
        <p style={rowTime}>{ago}</p>
      </div>
      {isUnread && <span style={dot} />}
    </Link>
  )
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

const emptyState: React.CSSProperties = {
  padding: '4rem 1rem',
  textAlign: 'center',
  border: '1px solid #e5e5e5',
  borderRadius: 12,
  background: '#fff',
}

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.75rem 1rem',
  border: '1px solid #e5e5e5',
  borderRadius: 10,
  textDecoration: 'none',
  color: 'inherit',
  transition: 'background 0.1s',
}

const rowBody: React.CSSProperties = {
  fontSize: '0.875rem',
  color: '#111',
  margin: 0,
  lineHeight: 1.4,
}

const rowTime: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#999',
  margin: '0.15rem 0 0',
}

const dot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#111',
  flexShrink: 0,
}

const markAllBtn: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 600,
  color: '#555',
  background: '#f5f5f5',
  border: '1px solid #e5e5e5',
  borderRadius: 6,
  padding: '0.3rem 0.75rem',
  cursor: 'pointer',
}
