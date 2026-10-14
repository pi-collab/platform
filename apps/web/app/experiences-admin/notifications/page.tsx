import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { experienceStaffGate } from '@/lib/experience-staff-auth'
import { STAFF_NOTIFICATION_TYPES, staffNotificationHref } from '@/lib/experience-staff-notifications'
import NoAccess from '../NoAccess'
import StaffNotificationList from './StaffNotificationList'
import { card, container, h1, lede } from '../ui'

export const dynamic = 'force-dynamic'

/** Guapd staff alerts (0546): this user's own rows (RLS), staff types only. */
export default async function ConsoleNotificationsPage() {
  const gate = await experienceStaffGate()
  if (!gate.ok) return <NoAccess reason={gate.reason} />
  const supabase = createClient()
  const { data } = await supabase.from('notifications')
    .select('id, deal_id, type, body, read_at, created_at')
    .in('type', [...STAFF_NOTIFICATION_TYPES])
    .order('created_at', { ascending: false }).limit(100)
  const rows = (data ?? []).map((n) => ({ ...n, href: staffNotificationHref(n.deal_id as string | null, n.type as string) }))
  return (
    <div style={container}>
      <Link href="/experiences-admin" style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--wg-600)', textDecoration: 'none' }}>← All Experiences</Link>
      <h1 style={{ ...h1, marginTop: 12, fontSize: 'clamp(26px, 3.2vw, 34px)' }}>Notifications</h1>
      <p style={lede}>What creators and brands did on your Experiences.</p>
      <section className="surface" style={{ ...card, marginTop: 18 }}>
        <StaffNotificationList rows={rows as never} />
      </section>
    </div>
  )
}
