'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markStaffNotificationsRead } from './actions'

type Row = { id: string; deal_id: string | null; type: string; body: string; read_at: string | null; created_at: string; href: string }

export default function StaffNotificationList({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const unread = rows.filter((r) => !r.read_at)
  if (rows.length === 0) return <p className="t-body" style={{ margin: 0 }}>Nothing yet. You are told here when a creator accepts, counters, writes or submits, when a payout needs approving, and when a brand acts on Guapd.</p>
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)' }}>{unread.length} unread</span>
        {unread.length > 0 && (
          <button type="button" disabled={pending} onClick={() => start(async () => { await markStaffNotificationsRead(unread.map((r) => r.id)); router.refresh() })}
            style={{ height: 32, padding: '0 14px', borderRadius: 999, border: '1px solid var(--hairline)', background: '#fff', fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            Mark all read
          </button>
        )}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {rows.map((n) => (
          <li key={n.id}>
            <Link href={n.href} onClick={() => { if (!n.read_at) void markStaffNotificationsRead([n.id]) }}
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 12, textDecoration: 'none', border: '1px solid var(--hairline)', background: n.read_at ? '#fff' : 'rgba(232,255,102,.10)' }}>
              {!n.read_at && <span aria-label="Unread" style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--neon-deep)', marginTop: 6, flex: 'none' }} />}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink)', fontWeight: n.read_at ? 400 : 600, lineHeight: 1.45 }}>{n.body}</span>
                <span style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--ink-faint)', marginTop: 3 }}>
                  {new Date(n.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
