'use client'

import BroadcastComposer from '@/components/BroadcastComposer'
import LegThreadView from './LegThreadView'
import type { LegThread } from '@/lib/experience-console-server'
import { broadcastToCreators, sendGuapdBrandMessage } from './actions'

/** 6.1 item 10: one message to every creator on this Experience, each in their own Guapd thread. */
export function CreatorBroadcast({ experienceId, all, accepted }: { experienceId: string; all: number; accepted: number }) {
  return (
    <BroadcastComposer
      title="Message all creators"
      note="Each creator gets it in their own thread with Guapd. They never see who else got it; the brand never sees it."
      recipients={{ all, accepted }}
      scopes={[{ value: 'all', label: 'Everyone sent an offer' }, { value: 'accepted', label: 'Accepted only' }]}
      send={(body, scope) => broadcastToCreators(experienceId, body, scope === 'accepted' ? 'accepted' : 'all')}
    />
  )
}

/** 6.1 item 11: the brand ↔ Guapd thread, staff side, in the same view as a creator thread. */
export function BrandThreadPanel({ experienceId, thread, closeHref }: { experienceId: string; thread: LegThread; closeHref: string }) {
  return (
    <LegThreadView thread={thread} closeHref={closeHref}
      sendBody={(body) => sendGuapdBrandMessage(experienceId, body)}
      heading={{ sub: `${thread.experience_title} · Guapd ↔ brand. No creator sees this.`, empty: `No messages yet. Write to ${thread.creator_name}; they see it as Guapd.`, placeholder: `Message ${thread.creator_name} as Guapd…` }} />
  )
}
