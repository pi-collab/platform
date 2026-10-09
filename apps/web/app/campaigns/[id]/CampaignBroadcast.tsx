'use client'

import BroadcastComposer from '@/components/BroadcastComposer'
import { broadcastToCampaign } from './broadcast-actions'

/** One message to every creator on the campaign, each in their own deal thread (6.1 item 10). */
export default function CampaignBroadcast({ campaignId, open }: { campaignId: string; open: number }) {
  return (
    <BroadcastComposer
      title="Message all creators"
      note="Each creator gets it in their own deal thread, as a normal message. They never see who else got it."
      recipients={{ all: open }}
      send={(body) => broadcastToCampaign(campaignId, body)}
    />
  )
}
