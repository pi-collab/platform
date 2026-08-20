import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CreatorSidebar from '@/components/CreatorSidebar'
import SignOutButton from '@/components/SignOutButton'
import AnalyticsIdentify from '@/components/AnalyticsIdentify'
import { currentPath } from '@/lib/creator-auth'
import { creatorLoginUrl } from '@/lib/safe-next'
import CreatorRejected from '@/components/CreatorRejected'

export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // This gate fires BEFORE any page under /creator, so it — not the page's
  // verifyCreator() — is what a logged-out creator from a WhatsApp deal link
  // actually hits. It must preserve where they were headed.
  if (!user) redirect(creatorLoginUrl(currentPath()))

  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()

  let creatorName: string | null = null
  let creatorPhoto: string | null = null
  let isVetted = false
  let isRejected = false
  let creatorId: string | null = null
  if (profile) {
    const { data: creator } = await supabase
      .from('creators')
      .select('id, full_name, is_vetted, is_rejected, profile_photo_url')
      .eq('user_id', profile.id)
      .maybeSingle()
    creatorId = creator?.id ?? null
    creatorName = creator?.full_name ?? null
    creatorPhoto = creator?.profile_photo_url ?? null
    isVetted = creator?.is_vetted ?? false
    isRejected = creator?.is_rejected ?? false
  }

  // No name means they verified a phone and never finished the profile step.
  // This used to send them to the marketing home page, which is the worst
  // possible answer: they are half-registered, nothing says so, and there is no
  // route back into the form. They land back in onboarding instead, so
  // returning always resumes where they stopped.
  if (!creatorName) redirect('/signup/creator/onboarding')

  // Unread notification count + recent notifications for dropdown
  let unreadCount = 0
  let recentNotifications: { id: string; deal_id: string | null; type: string; body: string; read_at: string | null; created_at: string }[] = []
  let notifBrandMap: Record<string, { name: string; photo: string | null }> = {}

  if (profile && isVetted) {
    const [{ count }, { data: recentNotifs }] = await Promise.all([
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .is('read_at', null),
      supabase
        .from('notifications')
        .select('id, deal_id, type, body, read_at, created_at')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(5),
    ])
    unreadCount = count ?? 0
    recentNotifications = recentNotifs ?? []

    // Fetch brand names for recent notifications
    const recentDealIds = Array.from(new Set(recentNotifications.map((n) => n.deal_id).filter(Boolean))) as string[]
    if (recentDealIds.length > 0) {
      const { data: deals } = await supabase
        .from('deals')
        .select('id, brands(name)')
        .in('id', recentDealIds)
      if (deals) {
        for (const d of deals) {
          const raw = d.brands as unknown
          const brand = Array.isArray(raw) ? raw[0] : (raw as { name: string } | null)
          if (brand) {
            notifBrandMap[d.id] = { name: brand.name, photo: null }
          }
        }
      }
    }
  }

  // Vetting gate. Two outcomes, two designed screens.
  //
  // Pending redirects to /signup/creator/complete rather than rendering a
  // second under-review message here: that page is the designed one, and it
  // also carries the notification preferences, which are the whole reason a
  // waiting creator would want to be on it.
  if (!isVetted) {
    if (isRejected) {
      // Whether they have already appealed, so the box does not invite a
      // second note the action would refuse anyway.
      const { data: appeal } = creatorId
        ? await supabase
            .from('events')
            .select('id')
            .eq('event_type', 'creator.appeal_submitted')
            .contains('detail', { creator_id: creatorId })
            .limit(1)
            .maybeSingle()
        : { data: null }

      return <CreatorRejected alreadyAppealed={Boolean(appeal)} />
    }

    redirect('/signup/creator/complete')
  }

  return (
    <>
      {/* UUID only — never email/phone/name. No-op until consent is granted. */}
      {profile?.id && <AnalyticsIdentify userId={profile.id} role="creator" />}
      <div className="creator-main">
        <CreatorSidebar creatorName={creatorName} creatorPhoto={creatorPhoto} userEmail={user?.email ?? null} unreadCount={unreadCount} recentNotifications={recentNotifications} notifBrandMap={notifBrandMap} />
        <main style={{ position: 'relative', zIndex: 1 }}>{children}</main>
      </div>
    </>
  )
}

const gateHeader: React.CSSProperties = {
  borderBottom: '1px solid #e5e5e5',
  background: '#fafafa',
  padding: '0.75rem 1rem',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  maxWidth: 480,
  margin: '0 auto',
}

const gateLogo: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: '#111',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
}

const gateBadge: React.CSSProperties = {
  fontSize: '0.625rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: '0.15rem 0.5rem',
  borderRadius: 9999,
  background: '#ede9fe',
  color: '#6d28d9',
}
