'use client'

import DealThread from '@/app/deals/[id]/DealThread'
import { markGuapdThreadRead, sendMessageToGuapd } from '../actions'

/**
 * The brand ↔ Guapd thread on an Experience (6.1 item 11), in the SAME chat a
 * brand uses on its deals (DealThread). Messages come from the brand gate
 * (brand_experience_messages); Guapd's read as "Guapd", never a staff name.
 * No creator can reach this thread, and it carries no money.
 */
export default function GuapdChat({ experienceId, messages, autoOpen = false }: {
  experienceId: string
  messages: { id: string; from: 'brand' | 'guapd'; body: string; created_at: string }[]
  autoOpen?: boolean
}) {
  return (
    <DealThread
      dealId={experienceId}
      dealStatus="agreed"
      autoOpen={autoOpen}
      hideLauncher
      initialMessages={messages.map((m) => ({ id: m.id, deal_id: experienceId, sender_party: m.from === 'brand' ? 'brand' as const : 'creator' as const, body: m.body, created_at: m.created_at }))}
      channel={{
        send: (body) => sendMessageToGuapd(experienceId, body),
        markRead: () => markGuapdThreadRead(experienceId),
        otherLabel: 'Guapd',
        otherPhrase: 'Guapd',
      }}
    />
  )
}
