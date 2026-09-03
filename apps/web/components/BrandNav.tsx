import { createClient } from '@/lib/supabase/server'
import { unreadMessageCount } from '@/lib/unread'
import BrandSidebar from '@/components/BrandSidebar'
import AnalyticsIdentify from '@/components/AnalyticsIdentify'

export default async function BrandNav() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profileId: string | null = null
  let brandName: string | null = null
  let unreadCount = 0
  let unreadInbox = 0
  let recentNotifications: { id: string; deal_id: string | null; type: string; body: string; read_at: string | null; created_at: string }[] = []
  let notifCreatorMap: Record<string, { name: string; photo: string | null }> = {}

  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (profile) {
      profileId = profile.id
      const { data: membership } = await supabase
        .from('brand_members')
        .select('brands(name)')
        .eq('user_id', profile.id)
        .maybeSingle()

      brandName = (membership as any)?.brands?.name ?? null

      // Unread notification count
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .is('read_at', null)

      unreadCount = count ?? 0

      // Unread MESSAGES, not unread message-notifications.
      //
      // This counted notifications of type 'message', which clear when someone
      // visits the notifications page — so a brand could read every message in
      // the chat panel and still carry a badge saying they had not. Counted
      // against message_reads now, which the panel updates when it opens.
      const { data: dealRows } = await supabase.from('deals').select('id')
      unreadInbox = await unreadMessageCount(
        profile.id,
        'brand',
        (dealRows ?? []).map((d) => d.id as string),
      )

      // Recent notifications for dropdown
      const { data: recentNotifs } = await supabase
        .from('notifications')
        .select('id, deal_id, type, body, read_at, created_at')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(5)

      recentNotifications = recentNotifs ?? []

      // Fetch creator names for recent notifications
      const recentDealIds = Array.from(new Set(recentNotifications.map((n) => n.deal_id).filter(Boolean))) as string[]
      if (recentDealIds.length > 0) {
        const { data: deals } = await supabase
          .from('deals')
          .select('id, creators(full_name, profile_photo_url)')
          .in('id', recentDealIds)
        if (deals) {
          for (const d of deals) {
            const raw = d.creators as unknown
            const creator = Array.isArray(raw) ? raw[0] : (raw as { full_name: string; profile_photo_url: string | null } | null)
            if (creator) {
              notifCreatorMap[d.id] = { name: creator.full_name, photo: creator.profile_photo_url }
            }
          }
        }
      }
    }
  }

  return (
    <>
      {/* UUID only — never email/phone/name. No-op until consent is granted. */}
      {profileId && <AnalyticsIdentify userId={profileId} role="brand" />}
      <BrandSidebar brandName={brandName} userEmail={user?.email ?? null} unreadCount={unreadCount} unreadInbox={unreadInbox} recentNotifications={recentNotifications} notifCreatorMap={notifCreatorMap} />
    </>
  )
}
