import { createClient } from '@/lib/supabase/server'
import { verifyCreator } from '@/lib/creator-auth'
import NotificationFeed from '@/components/NotificationFeed'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Notifications — Guapd Creator' }

export default async function CreatorNotificationsPage() {
  await verifyCreator()
  const supabase = createClient()

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, deal_id, type, body, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const all = notifications ?? []
  const unreadCount = all.filter((n) => !n.read_at).length

  return (
    <main style={wrapper}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={heading}>Notifications</h1>
        <p style={{ color: '#888', fontSize: '0.875rem', margin: 0 }}>
          {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        </p>
      </div>

      <NotificationFeed
        notifications={all}
        dealLinkPrefix="/creator/deals"
        unreadCount={unreadCount}
      />
    </main>
  )
}

const wrapper: React.CSSProperties = {
  padding: '2rem clamp(1rem, 3vw, 2.5rem)',
  maxWidth: 900,
  margin: '0 auto',
}

const heading: React.CSSProperties = {
  fontFamily: 'var(--font-heading, inherit)',
  fontSize: '1.375rem',
  fontWeight: 700,
  color: 'var(--color-heading, #111)',
  margin: '0 0 0.25rem',
}
