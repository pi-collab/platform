import { createClient } from '@/lib/supabase/server'
import { verifyCreator } from '@/lib/creator-auth'
import NotificationFeed from '@/components/NotificationFeed'
import NotificationsMobile from '@/components/NotificationsMobile'
import { pendingForCreator } from '@/lib/notification-priority'
import CreatorPageHeader from '@/components/creator/CreatorPageHeader'
import CreatorEmptyState, { BellIcon } from '@/components/creator/CreatorEmptyState'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Notifications · Guapd Creator' }

/**
 * Where the back arrow goes.
 *
 * These screens have two doors — the profile menu and the dashboard — so a
 * fixed href sends half the visitors somewhere they have never been. The
 * caller states its own return in `?from=`, which keeps CreatorPageHeader's
 * rule that a back arrow never guesses.
 */
function backFrom(from: string | undefined) {
  return from === 'profile' ? '/creator/profile' : '/creator/dashboard'
}

export default async function CreatorNotificationsPage({ searchParams }: { searchParams?: { from?: string } }) {
  const backHref = backFrom(searchParams?.from)
  const { creatorId } = await verifyCreator()
  const supabase = createClient()

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, deal_id, type, body, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const all = notifications ?? []
  const unreadCount = all.filter((n) => !n.read_at).length

  /* Offers still awaiting an answer. Asked of the deals table rather than
     counted from unread `offer_sent` rows: a notification says something
     happened, this card claims something is still outstanding, and a creator
     who already replied elsewhere would otherwise be nagged about finished
     work. */
  const priority = await pendingForCreator(supabase, creatorId)

  // For creator side, the "other party" is the brand — fetch brand names + prices
  const dealIds = Array.from(new Set(all.map((n) => n.deal_id).filter(Boolean))) as string[]
  let creatorMap: Record<string, { name: string; photo: string | null; pricePaise: number | null; title: string | null }> = {}

  if (dealIds.length > 0) {
    const { data: deals } = await supabase
      .from('deals')
      .select('id, title, price_paise, brands(name)')
      .in('id', dealIds)

    if (deals) {
      for (const d of deals) {
        const raw = d.brands as unknown
        const brand = Array.isArray(raw) ? raw[0] : (raw as { name: string } | null)
        if (brand) {
          creatorMap[d.id] = { name: brand.name, photo: null, pricePaise: d.price_paise, title: d.title }
        }
      }
    }
  }

  // Nothing to show. The feed renders its own header and chrome, so an empty
  // list would still draw a toolbar over blank space — the designed empty state
  // replaces the whole screen rather than sitting inside it.
  // Both render when there is nothing to show; the width decides which is
  // visible. Returning the mobile design early fired at every width, so a
  // creator on a desktop never saw the desktop screen at all.
  const isEmpty = all.length === 0

  return (
    <>
    {isEmpty && (
      <main className="creator-empty-mobile" style={{ position: 'relative', zIndex: 1 }}>
        <CreatorPageHeader title="Notifications" backHref={backHref} />
        <CreatorEmptyState
          icon={<BellIcon />}
          title="You&rsquo;re all caught up"
          body="No new notifications. Updates about offers, deals and payments will show up here."
        />
      </main>
    )}
    {/* Mobile screen and desktop feed are both mounted; CSS picks one. The
        empty state above already works this way on this page. */}
    {!isEmpty && (
      <NotificationsMobile
        notifications={all}
        dealLinkPrefix="/creator/deals"
        unreadCount={unreadCount}
        creatorMap={creatorMap}
        variant="creator"
        priority={priority}
        backHref={backHref}
      />
    )}
    <main className={isEmpty ? 'creator-empty-desktop' : 'notif-desktop'} style={wrapper}>
      <NotificationFeed
        notifications={all}
        dealLinkPrefix="/creator/deals"
        unreadCount={unreadCount}
        creatorMap={creatorMap}
        variant="creator"
      />
    </main>
    </>
  )
}

const wrapper: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  padding: 'clamp(20px, 3vw, 40px) clamp(18px, 4vw, 44px) clamp(56px, 6vw, 90px)',
  maxWidth: 1080,
  margin: '0 auto',
}
