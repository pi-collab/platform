'use client'

import DealThread from '@/app/deals/[id]/DealThread'
import { markGuapdLegRead, sendGuapdLegMessage } from './actions'

/** The brand deal page's bottom-right message panel, on a console deal: Guapd <-> this creator (0546). */
export default function ConsoleDealThread({ dealId, status, creatorName, messages, autoOpen }: {
  dealId: string
  status: string
  creatorName: string
  messages: { id: string; deal_id: string; sender_party: 'brand' | 'creator'; body: string | null; created_at: string }[]
  autoOpen: boolean
}) {
  return (
    <DealThread dealId={dealId} dealStatus={status} initialMessages={messages} autoOpen={autoOpen} hideLauncher
      channel={{
        send: async (body) => {
          const r = await sendGuapdLegMessage(dealId, body)
          return r.ok ? { status: 'success', data: r.data } : { status: 'error', message: r.error }
        },
        markRead: () => markGuapdLegRead(dealId),
        otherLabel: creatorName,
        otherPhrase: creatorName,
      }} />
  )
}
