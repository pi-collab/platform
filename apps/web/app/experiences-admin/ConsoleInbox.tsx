'use client'

import BrandInboxView, { type InboxConsoleMode } from '@/app/inbox/BrandInboxView'
import { sendGuapdBrandMessage, sendGuapdLegMessage } from './actions'

/**
 * The console inbox on the brand inbox's design (6.1). Two kinds of thread in
 * one list: Guapd <-> creator on each sent deal (id = the deal id) and Guapd <->
 * brand on each Experience (id = "b:" + the Experience id). The creator never
 * sees a brand thread, the brand never sees a creator thread; staff read and
 * send only through the gated console functions.
 */
export type ConsoleThread = Parameters<typeof BrandInboxView>[0]['threads'][number]
export type ConsoleMessage = Parameters<typeof BrandInboxView>[0]['allMessages'][number]

const isBrand = (id: string) => id.startsWith('b:')

export default function ConsoleInbox({ threads, messages, selected, unread, dealHrefs }: {
  threads: ConsoleThread[]
  messages: ConsoleMessage[]
  selected: string | null
  unread: Record<string, number>
  /** thread id -> where "View deal" goes. */
  dealHrefs: Record<string, string>
}) {
  const cm: InboxConsoleMode = {
    send: (id, body) => isBrand(id) ? sendGuapdBrandMessage(id.slice(2), body) : sendGuapdLegMessage(id, body),
    threadHref: (id) => `/experiences-admin/inbox?thread=${encodeURIComponent(id)}`,
    dealHref: (id) => dealHrefs[id] ?? null,
    inboxHref: '/experiences-admin/inbox',
    dealLinkLabel: 'View deal',
  }
  return <BrandInboxView key={selected ?? 'none'} threads={threads} allMessages={messages} initialDealId={selected} unreadByDeal={unread} console={cm} />
}
