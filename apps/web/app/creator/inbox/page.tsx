import { createClient } from '@/lib/supabase/server'
import { unreadByDeal } from '@/lib/unread'
import InboxListMobile from '@/components/InboxListMobile'
import InboxThreadMobile from '@/components/InboxThreadMobile'
import { resolveStatus } from '@/lib/deal-stage'
import { verifyCreator } from '@/lib/creator-auth'
import CreatorInboxView from './CreatorInboxView'
import CreatorPageHeader from '@/components/creator/CreatorPageHeader'
import CreatorEmptyState from '@/components/creator/CreatorEmptyState'
import CreatorInboxEmptyDesktop from './CreatorInboxEmptyDesktop'
import type { Metadata } from 'next'
import { unreadNotificationCount } from '@/lib/unread'

export const metadata: Metadata = { title: 'Inbox · Guapd Creator' }

export default async function CreatorInboxPage({ searchParams }: {
  searchParams: { deal?: string }
}) {
  await verifyCreator()
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // The users row, not the auth user: message_reads keys on users(id).
  const { data: profile } = user
    ? await supabase.from('users').select('id').eq('auth_id', user.id).maybeSingle()
    : { data: null }

  // Threads come from DEALS as well as messages: a deal nobody has written on
  // had no thread, so Message from that deal landed on an empty inbox with no
  // way to start. Closed deals are excluded — messaging stays open until the
  // deal completes.
  const [{ data: messages }, { data: openDeals }] = await Promise.all([
    supabase
      .from('messages')
      .select('id, deal_id, sender_party, body, created_at, deals(id, title, status, price_paise, brands(name))')
      .order('created_at', { ascending: false }),
    supabase
      .from('deals')
      .select('id, title, status, is_posted, price_paise, brands(name)')
      .not('status', 'in', '(cancelled,declined)')
      .order('created_at', { ascending: false }),
  ])

  const threadMap = new Map<string, {
    dealId: string; dealTitle: string; dealStatus: string; dealStage: string; brandName: string;
    brandInitials: string; lastMessage: string; senderParty: string; createdAt: string;
    amountPaise: number;
  }>()

  for (const msg of messages ?? []) {
    if (!threadMap.has(msg.deal_id)) {
      const deal = msg.deals as any
      const brand = deal?.brands
      const brandObj = Array.isArray(brand) ? brand[0] : brand
      const brandName = brandObj?.name || 'Unknown brand'
      threadMap.set(msg.deal_id, {
        dealId: msg.deal_id,
        dealTitle: deal?.title || 'Untitled deal',
        dealStatus: deal?.status || '',
        dealStage: resolveStatus({ status: deal?.status ?? '', is_posted: deal?.is_posted ?? null }),
        brandName,
        brandInitials: getInitials(brandName),
        lastMessage: msg.body || '',
        senderParty: msg.sender_party,
        createdAt: msg.created_at,
        amountPaise: deal?.price_paise ?? 0,
      })
    }
  }

  // Live deals with nothing said yet. After the message pass, so a deal that
  // HAS messages keeps its preview instead of being overwritten by a blank one.
  for (const deal of openDeals ?? []) {
    if (threadMap.has(deal.id)) continue
    const brandObj = Array.isArray(deal.brands) ? deal.brands[0] : (deal.brands as any)
    const brandName = brandObj?.name || 'Brand'
    threadMap.set(deal.id, {
      dealId: deal.id,
      dealTitle: deal.title || 'Untitled deal',
      dealStatus: deal.status || '',
      dealStage: resolveStatus({ status: deal.status ?? '', is_posted: (deal as { is_posted?: boolean | null }).is_posted ?? null }),
      brandName,
      brandInitials: getInitials(brandName),
      lastMessage: '',
      senderParty: '',
      createdAt: '',
      amountPaise: deal.price_paise ?? 0,
    })
  }

  const threads = Array.from(threadMap.values())

  // Per-thread unread, so the list can say which conversations are waiting.
  // The Unread tab was hardcoded to 0 and every row looked alike.
  const unread = profile?.id
    ? await unreadByDeal(profile.id, 'creator', threads.map((t) => t.dealId))
    : {}
  const allMessages = (messages ?? []).map((m) => ({
    id: m.id,
    deal_id: m.deal_id,
    sender_party: m.sender_party as 'brand' | 'creator',
    body: m.body,
    created_at: m.created_at,
  }))

  // No conversations. CreatorInboxView renders a thread list and a message
  // pane — two empty columns — so the empty state replaces the screen, and
  // carries the header the other creator screens have.
  //
  // BOTH are rendered and the width decides which is visible. Returning one
  // early fires at EVERY width: that is what left a creator on a desktop
  // looking at the phone empty state, and it has now cost this codebase the
  // same bug on the dashboard and the deals list before this one.
  if (threads.length === 0) {
    return (
      <>
      <main className="creator-empty-mobile" style={{ position: 'relative', zIndex: 1 }}>
        <CreatorPageHeader title="Inbox" backHref="/creator/dashboard" />
        <CreatorEmptyState
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9AA08C"
                 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          }
          title="No messages yet"
          body="When a brand starts a conversation about a deal, it appears here."
        />
      </main>
      {/* Desktop's own drawing. The phone version above is UNCHANGED, it is only
          gated by width now instead of rendering at all of them. */}
      <main className="creator-empty-desktop" style={{ position: 'relative', zIndex: 1 }}>
        <CreatorInboxEmptyDesktop />
      </main>
      </>
    )
  }

  /* List state on mobile; the existing master-detail view takes over as soon
     as a thread is chosen, because the thread screen is its own design. Both
     are mounted and CSS decides, except that the desktop view must stay
     visible on mobile once ?deal= is set — hence the conditional class rather
     than a blanket one. */
  const unreadNotifs = profile?.id ? await unreadNotificationCount(supabase, profile.id) : 0
  const selected = searchParams?.deal ?? null
  const selectedThread = selected ? threads.find((t) => t.dealId === selected) ?? null : null
  const selectedMessages = selected
    ? allMessages
        .filter((m) => m.deal_id === selected)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    : []

  return (
    <>
      {!selected && (
        <InboxListMobile
          threads={threads.map((t) => ({
            dealId: t.dealId, dealTitle: t.dealTitle, dealStatus: t.dealStatus, dealStage: t.dealStage,
            name: t.brandName, initials: t.brandInitials,
            lastMessage: t.lastMessage, createdAt: t.createdAt,
          }))}
          unreadByDeal={unread}
          basePath="/creator/inbox"
          notificationsHref="/creator/notifications?from=inbox"
          unreadNotifications={unreadNotifs}
        />
      )}
      {/* The thread on a phone. Mirrors the desktop rule for a closed thread
          rather than introducing a second one — see the component's note. */}
      {selectedThread && (
        <InboxThreadMobile
          dealId={selectedThread.dealId}
          name={selectedThread.brandName}
          initials={selectedThread.brandInitials}
          messages={selectedMessages}
          me="creator"
          backHref="/creator/inbox"
          dealHref={`/creator/deals/${selectedThread.dealId}`}
          closedNotice={
            ['complete', 'declined', 'cancelled'].includes(selectedThread.dealStatus)
              ? `This deal is ${selectedThread.dealStatus}, so messaging is closed.`
              : null
          }
          hasTabBar={true}
        />
      )}
      <div className={selected ? 'inbox-thread-only inbox-hide-mobile' : 'inbox-hide-mobile'}>
        <CreatorInboxView threads={threads} allMessages={allMessages} initialDealId={selected} unreadByDeal={unread} />
      </div>
    </>
  )
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
