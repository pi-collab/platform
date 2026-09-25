import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorWhatsAppContact } from '@/lib/creator-whatsapp'

/**
 * Who a WhatsApp broadcast would actually reach.
 *
 * Resolved ONCE, server-side, and shown before anything is sent. The whole
 * point of this module is that "all the creators in deals" is a phrase, and
 * the list behind it is a fact — one that includes people with no phone, people
 * who turned notifications off, and people who have already had this exact
 * message. Those three are the difference between a broadcast and an accident.
 *
 * Number selection and the opt-out are NOT reimplemented here. They live in
 * creatorWhatsAppContact, which the transactional sends already use: a
 * nominated WhatsApp number beats the login phone, and notify_whatsapp === false
 * means do not send. A broadcast honouring a different rule from a deal
 * notification is how someone who opted out still hears from us.
 */

export type BroadcastAudience = 'deals' | 'growth' | 'all_vetted'

const AUDIENCE_STATUS: Record<BroadcastAudience, string[]> = {
  /** Vetted for brand deals — the roster a brand can actually book. */
  deals: ['deals_approved'],
  growth: ['growth'],
  all_vetted: ['deals_approved', 'growth'],
}

export interface BroadcastCandidate {
  creatorId: string
  fullName: string
  /** First name, which is what the template's variable 1 wants. */
  firstName: string
  phone: string | null
  /** Set when we will NOT send, and why. Shown in the preview, not hidden. */
  skip?: 'no_phone' | 'opted_out' | 'already_sent'
}

export interface BroadcastAudienceResult {
  sendable: BroadcastCandidate[]
  skipped: BroadcastCandidate[]
}

/**
 * Has this creator already had this campaign?
 *
 * Read from `events`, which every send writes to. A re-run after a partial
 * failure is the normal case — the first run timed out, or half the sends
 * failed — and the person re-running it must not have to remember where it got
 * to. Without this, the safe-looking action (run it again) is the one that
 * double-messages everybody who already received it.
 */
async function alreadySent(campaignId: string): Promise<Set<string>> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select('detail')
    .eq('event_type', 'broadcast.whatsapp_sent')
  const out = new Set<string>()
  for (const row of data ?? []) {
    const d = (row.detail ?? {}) as Record<string, unknown>
    if (d.campaign === campaignId && typeof d.creator_id === 'string') out.add(d.creator_id)
  }
  return out
}

export async function resolveBroadcastAudience(
  audience: BroadcastAudience,
  campaignId: string,
): Promise<BroadcastAudienceResult> {
  const admin = createAdminClient()

  const { data: creators } = await admin
    .from('creators')
    .select('id, full_name, vetting_status')
    .in('vetting_status', AUDIENCE_STATUS[audience])
    .order('full_name')

  const sent = await alreadySent(campaignId)

  const sendable: BroadcastCandidate[] = []
  const skipped: BroadcastCandidate[] = []

  for (const c of creators ?? []) {
    const fullName = (c.full_name ?? '').trim()
    const contact = await creatorWhatsAppContact(c.id)
    const base: BroadcastCandidate = {
      creatorId: c.id,
      fullName: fullName || '(no name)',
      /* The template greets them by name, so a creator with no name on file
         gets "there" rather than an empty variable — MSG91 rejects a blank
         body parameter outright, which would fail the send rather than send
         something slightly awkward. */
      firstName: contact.name,
      phone: contact.phone,
    }

    if (sent.has(c.id)) { skipped.push({ ...base, skip: 'already_sent' }); continue }
    if (contact.skipReason === 'opted_out') { skipped.push({ ...base, skip: 'opted_out' }); continue }
    if (!contact.phone) { skipped.push({ ...base, skip: 'no_phone' }); continue }

    sendable.push(base)
  }

  return { sendable, skipped }
}
