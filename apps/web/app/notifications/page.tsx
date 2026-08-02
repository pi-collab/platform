import { createClient } from '@/lib/supabase/server'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import NotificationFeed from '@/components/NotificationFeed'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Notifications — Guapd' }

export default async function BrandNotificationsPage() {
  await verifyApprovedBrand()
  const supabase = createClient()

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, deal_id, type, body, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const all = notifications ?? []
  const unreadCount = all.filter((n) => !n.read_at).length

  // Collect unique deal_ids to fetch creator names + prices
  const dealIds = Array.from(new Set(all.map((n) => n.deal_id).filter(Boolean))) as string[]
  let creatorMap: Record<string, { name: string; photo: string | null; pricePaise: number | null }> = {}

  if (dealIds.length > 0) {
    const { data: deals } = await supabase
      .from('deals')
      .select('id, price_paise, creators(full_name, profile_photo_url)')
      .in('id', dealIds)

    if (deals) {
      for (const d of deals) {
        const raw = d.creators as unknown
        const creator = Array.isArray(raw) ? raw[0] : (raw as { full_name: string; profile_photo_url: string | null } | null)
        if (creator) {
          creatorMap[d.id] = { name: creator.full_name, photo: creator.profile_photo_url, pricePaise: d.price_paise }
        }
      }
    }
  }

  return (
    <main style={wrapper}>
      <NotificationFeed
        notifications={all}
        dealLinkPrefix="/deals"
        unreadCount={unreadCount}
        creatorMap={creatorMap}
      />
    </main>
  )
}

const wrapper: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  padding: 'clamp(20px, 3vw, 40px) clamp(18px, 4vw, 44px) clamp(56px, 6vw, 90px)',
  maxWidth: 1080,
  margin: '0 auto',
}
