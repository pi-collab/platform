import { createClient } from '@/lib/supabase/server'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import BrandInboxView from './BrandInboxView'

export default async function BrandInboxPage() {
  await verifyApprovedBrand()
  const supabase = createClient()

  const { data: messages } = await supabase
    .from('messages')
    .select('id, deal_id, sender_party, body, created_at, deals(id, title, status, price_paise, creators(full_name, profile_photo_url))')
    .order('created_at', { ascending: false })

  const threadMap = new Map<string, {
    dealId: string; dealTitle: string; dealStatus: string; creatorName: string;
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

  const threads = Array.from(threadMap.values())
  const allMessages = (messages ?? []).map((m) => ({
    id: m.id,
    deal_id: m.deal_id,
    sender_party: m.sender_party as 'brand' | 'creator',
    body: m.body,
    created_at: m.created_at,
  }))

  return <BrandInboxView threads={threads} allMessages={allMessages} />
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
