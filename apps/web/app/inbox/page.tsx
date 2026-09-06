import { createClient } from '@/lib/supabase/server'
import InboxListMobile from '@/components/InboxListMobile'
import { resolveStatus } from '@/lib/deal-stage'
import { unreadByDeal } from '@/lib/unread'
import { verifyBrand } from '@/lib/brand-auth'
import BrandInboxView from './BrandInboxView'

export default async function BrandInboxPage({ searchParams }: {
  searchParams: { deal?: string }
}) {
  await verifyBrand()
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // The users row, not the auth user: message_reads keys on users(id).
  const { data: profile } = user
    ? await supabase.from('users').select('id').eq('auth_id', user.id).maybeSingle()
    : { data: null }

  // Threads come from DEALS as well as from messages.
  //
  // They were built from messages alone, so a deal nobody had written on yet had
  // no thread — and pressing Message on that deal landed here on an empty inbox
  // with no way to start. A conversation that only exists once it exists is a
  // chicken and egg, and it is the whole of this bug.
  //
  // Closed deals are excluded: messaging is open until the deal completes.
  const [{ data: messages }, { data: openDeals }] = await Promise.all([
    supabase
      .from('messages')
      .select('id, deal_id, sender_party, body, created_at, deals(id, title, status, price_paise, creators(full_name, profile_photo_url))')
      .order('created_at', { ascending: false }),
    supabase
      .from('deals')
      .select('id, title, status, is_posted, price_paise, creators(full_name, profile_photo_url)')
      .not('status', 'in', '(cancelled,declined)')
      .order('created_at', { ascending: false }),
  ])

  const threadMap = new Map<string, {
    dealId: string; dealTitle: string; dealStatus: string; dealStage: string; creatorName: string;
    creatorPhoto: string | null; creatorInitials: string; lastMessage: string;
    senderParty: string; createdAt: string; amountPaise: number;
  }>()

  for (const msg of messages ?? []) {
    if (!threadMap.has(msg.deal_id)) {
      const deal = msg.deals as any
      const creator = deal?.creators
      const creatorObj = Array.isArray(creator) ? creator[0] : creator
      const creatorName = creatorObj?.full_name || 'Unknown'
      threadMap.set(msg.deal_id, {
        dealId: msg.deal_id,
        dealTitle: deal?.title || 'Untitled deal',
        dealStatus: deal?.status || '',
        dealStage: resolveStatus({ status: deal?.status ?? '', is_posted: deal?.is_posted ?? null }),
        creatorName,
        creatorPhoto: creatorObj?.profile_photo_url || null,
        creatorInitials: getInitials(creatorName),
        lastMessage: msg.body || '',
        senderParty: msg.sender_party,
        createdAt: msg.created_at,
        amountPaise: deal?.price_paise ?? 0,
      })
    }
  }

  // Every live deal gets a thread, even with nothing said on it yet. Added
  // after the message pass so a deal that HAS messages keeps its last-message
  // preview rather than being overwritten by an empty one.
  for (const deal of openDeals ?? []) {
    if (threadMap.has(deal.id)) continue
    const creatorObj = Array.isArray(deal.creators) ? deal.creators[0] : (deal.creators as any)
    const creatorName = creatorObj?.full_name || 'Unknown'
    threadMap.set(deal.id, {
      dealId: deal.id,
      dealTitle: deal.title || 'Untitled deal',
      dealStatus: deal.status || '',
      dealStage: resolveStatus({ status: deal.status ?? '', is_posted: (deal as { is_posted?: boolean | null }).is_posted ?? null }),
      creatorName,
      creatorPhoto: creatorObj?.profile_photo_url || null,
      creatorInitials: getInitials(creatorName),
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
    ? await unreadByDeal(profile.id, 'brand', threads.map((t) => t.dealId))
    : {}
  const allMessages = (messages ?? []).map((m) => ({
    id: m.id,
    deal_id: m.deal_id,
    sender_party: m.sender_party as 'brand' | 'creator',
    body: m.body,
    created_at: m.created_at,
  }))

  // Same list, same component. Only the counterpart differs: a brand sees the
  // creator's name where a creator sees the brand's.
  const selected = searchParams?.deal ?? null

  return (
    <>
      {!selected && (
        <InboxListMobile
          threads={threads.map((t) => ({
            dealId: t.dealId, dealTitle: t.dealTitle, dealStatus: t.dealStatus, dealStage: t.dealStage,
            name: t.creatorName, initials: t.creatorInitials,
            lastMessage: t.lastMessage, createdAt: t.createdAt,
          }))}
          unreadByDeal={unread}
          basePath="/inbox"
          notificationsHref="/notifications"
        />
      )}
      <div className={selected ? 'inbox-thread-only' : 'inbox-hide-mobile'}>
        <BrandInboxView threads={threads} allMessages={allMessages} initialDealId={selected} unreadByDeal={unread} />
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
