import { experienceStaffGate } from '@/lib/experience-staff-auth'
import { getBrandThread, getLegThread, listBrandThreads, listLegThreads } from '@/lib/experience-console-server'
import NoAccess from '../NoAccess'
import ConsoleInbox, { type ConsoleMessage, type ConsoleThread } from '../ConsoleInbox'

export const dynamic = 'force-dynamic'

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'

/**
 * The console inbox (0546, 0550), on the brand inbox's design: every Guapd <->
 * creator thread on a sent Experience deal and every Guapd <-> brand thread,
 * newest first. Staff-only (the gate here, and experience_console_require
 * inside every function). Only the open thread's messages are read, through
 * the gated read, which marks that one thread read for this staff user.
 */
export default async function ConsoleInboxPage({ searchParams }: { searchParams?: { thread?: string; deal?: string; brand?: string } }) {
  const gate = await experienceStaffGate()
  if (!gate.ok) return <NoAccess reason={gate.reason} />
  const [legs, brands] = await Promise.all([listLegThreads(null), listBrandThreads()])
  const legRows = legs.ok ? legs.data : []
  const brandRows = brands.ok ? brands.data : []

  const threads: ConsoleThread[] = [
    ...legRows.map((r) => ({
      dealId: r.deal_id, dealTitle: `${r.experience_title} · ${r.brand_name}`, dealStatus: r.status,
      creatorName: r.creator_name, creatorPhoto: r.creator_photo, creatorInitials: initials(r.creator_name),
      lastMessage: r.last_message?.body ?? '', senderParty: r.last_message?.from === 'guapd' ? 'brand' : r.last_message ? 'creator' : '',
      createdAt: r.last_message?.created_at ?? r.sent_at ?? '', amountPaise: 0,
    })),
    ...brandRows.map((b) => ({
      dealId: `b:${b.experience_id}`, dealTitle: `Brand · ${b.experience_title}`, dealStatus: 'agreed',
      creatorName: b.brand_name, creatorPhoto: null, creatorInitials: initials(b.brand_name),
      lastMessage: b.last_message?.body ?? '', senderParty: b.last_message?.from === 'guapd' ? 'brand' : b.last_message ? 'creator' : '',
      createdAt: b.last_message?.created_at ?? '', amountPaise: 0,
    })),
  ].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

  const unread: Record<string, number> = {}
  for (const r of legRows) if (r.unread > 0) unread[r.deal_id] = r.unread
  for (const b of brandRows) if (b.unread > 0) unread[`b:${b.experience_id}`] = b.unread
  const dealHrefs: Record<string, string> = {}
  for (const r of legRows) dealHrefs[r.deal_id] = `/experiences-admin/deals/${r.deal_id}`
  for (const b of brandRows) dealHrefs[`b:${b.experience_id}`] = `/experiences-admin/${b.experience_id}`

  // Old links: ?deal=<leg> and ?brand=<experience>.
  const asked = searchParams?.thread ?? (searchParams?.deal ? searchParams.deal : searchParams?.brand ? `b:${searchParams.brand}` : null)
  const selected = asked && threads.some((t) => t.dealId === asked) ? asked : null

  let messages: ConsoleMessage[] = []
  if (selected?.startsWith('b:')) {
    const t = await getBrandThread(selected.slice(2))
    if (t.ok) messages = t.data.messages.map((m) => ({ id: m.id, deal_id: selected, sender_party: m.from === 'guapd' ? 'brand' as const : 'creator' as const, body: m.body, created_at: m.created_at, sender_label: m.from === 'guapd' ? `Guapd · ${m.sender_name ?? 'staff'}` : m.sender_name ?? 'Brand' }))
  } else if (selected) {
    const t = await getLegThread(selected)
    if (t.ok) messages = t.data.messages.map((m) => ({ id: m.id, deal_id: selected, sender_party: m.from === 'guapd' ? 'brand' as const : 'creator' as const, body: m.body, created_at: m.created_at, sender_label: m.from === 'guapd' ? `Guapd · ${m.sender_name ?? 'staff'}` : m.sender_name ?? t.data.creator_name }))
    if (t.ok) delete unread[selected]
  }
  if (selected?.startsWith('b:')) delete unread[selected]

  return <ConsoleInbox threads={threads} messages={messages} selected={selected} unread={unread} dealHrefs={dealHrefs} />
}
