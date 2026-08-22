import { createClient } from '@/lib/supabase/server'
import { verifyCreator } from '@/lib/creator-auth'
import CreatorInboxView from './CreatorInboxView'
import CreatorPageHeader from '@/components/creator/CreatorPageHeader'
import CreatorEmptyState from '@/components/creator/CreatorEmptyState'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Inbox · Guapd Creator' }

export default async function CreatorInboxPage() {
  await verifyCreator()
  const supabase = createClient()

  const { data: messages } = await supabase
    .from('messages')
    .select('id, deal_id, sender_party, body, created_at, deals(id, title, status, price_paise, brands(name))')
    .order('created_at', { ascending: false })

  const threadMap = new Map<string, {
    dealId: string; dealTitle: string; dealStatus: string; brandName: string;
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
        brandName,
        brandInitials: getInitials(brandName),
        lastMessage: msg.body || '',
        senderParty: msg.sender_party,
        createdAt: msg.created_at,
        amountPaise: deal?.price_paise ?? 0,
      })
    }
  }

  const threads = Array.from(threadMap.values())
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
  if (threads.length === 0) {
    return (
      <main style={{ position: 'relative', zIndex: 1 }}>
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
    )
  }

  return <CreatorInboxView threads={threads} allMessages={allMessages} />
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
