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

  // For creator side, the "other party" is the brand — fetch brand names + prices
  const dealIds = Array.from(new Set(all.map((n) => n.deal_id).filter(Boolean))) as string[]
  let creatorMap: Record<string, { name: string; photo: string | null; pricePaise: number | null }> = {}

  if (dealIds.length > 0) {
    const { data: deals } = await supabase
      .from('deals')
      .select('id, price_paise, brands(name)')
      .in('id', dealIds)

    if (deals) {
      for (const d of deals) {
        const raw = d.brands as unknown
        const brand = Array.isArray(raw) ? raw[0] : (raw as { name: string } | null)
        if (brand) {
          creatorMap[d.id] = { name: brand.name, photo: null, pricePaise: d.price_paise }
        }
      }
    }
  }

  return (
    <main style={wrapper}>
      <NotificationFeed
        notifications={all}
        dealLinkPrefix="/creator/deals"
        unreadCount={unreadCount}
        creatorMap={creatorMap}
        variant="creator"
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
