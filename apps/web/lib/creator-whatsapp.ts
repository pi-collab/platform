import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsAppTemplate, maskPhone } from '@/lib/whatsapp'

/**
 * WhatsApp to a creator about their own account, rather than about a deal.
 *
 * The number-selection rules already existed inside notifyDealParty, which
 * meant they only worked for deal-scoped messages — so approving a creator
 * reached nobody, even one who had nominated a WhatsApp number for exactly
 * this. Same rules, lifted out.
 */

/** How the status-update template is registered in MSG91. */
const STATUS_TEMPLATE = 'status_update'

/**
 * The button carries a URL SUFFIX only — the base is baked into the approved
 * template, and sending a full URL yields https://guapd.com/https://guapd.com/…
 *
 * /creator/dashboard serves every status on its own: the creator layout sends a
 * rejected creator to the rejection screen, a pending one to the under-review
 * page, and an approved one to the dashboard. Logged out, the login page
 * carries them back here afterwards. One link, honestly described as "check
 * your status", whatever the decision was.
 */
const STATUS_LINK = 'creator/dashboard'

export interface CreatorContact {
  phone: string | null
  name: string
  /** Set when we deliberately will not send, for the audit trail. */
  skipReason?: 'opted_out' | 'no_phone' | 'no_creator'
}

/**
 * Which number to use, and whether to use one at all.
 *
 * creators.phone is the LOGIN identity and is often not where someone reads
 * WhatsApp, so a nominated number wins. The opt-out is honoured only when
 * explicitly false: every creator predates the setting, and treating absent as
 * "no" would silence the entire existing roster.
 */
export async function creatorWhatsAppContact(creatorId: string): Promise<CreatorContact> {
  const admin = createAdminClient()

  const { data: creator } = await admin
    .from('creators')
    .select('full_name, phone, user_id')
    .eq('id', creatorId)
    .maybeSingle()

  if (!creator) return { phone: null, name: 'there', skipReason: 'no_creator' }

  const name = (creator.full_name ?? '').trim().split(/\s+/)[0] || 'there'
  let phone = creator.phone ?? null

  // A stub creator has no users row at all, so there are no preferences to read
  // — and for them WhatsApp is the only channel that reaches them.
  if (creator.user_id) {
    const { data: row } = await admin
      .from('users')
      .select('preferences')
      .eq('id', creator.user_id)
      .maybeSingle()

    const prefs = (row?.preferences ?? {}) as Record<string, unknown>

    const nominated = typeof prefs.whatsapp_phone === 'string' ? prefs.whatsapp_phone.trim() : ''
    if (nominated) phone = nominated

    if (prefs.notify_whatsapp === false) {
      return { phone: null, name, skipReason: 'opted_out' }
    }
  }

  if (!phone) return { phone: null, name, skipReason: 'no_phone' }
  return { phone, name }
}

/**
 * Tell a creator their profile status changed.
 *
 * ONE template for every outcome — approved, rejected, or still being decided.
 * It says an update exists and links to where the answer is, which is both
 * kinder than announcing a rejection over WhatsApp and reusable for the growth
 * tier when that lands, without a new approval queue.
 *
 * Never throws. A notification that fails must not fail the ops action that
 * triggered it — the decision is already recorded, and a creator who hears
 * nothing is recoverable where a half-applied approval is not.
 */
export async function notifyCreatorStatusChanged(
  creatorId: string,
  status: 'approved' | 'rejected' | 'pending',
): Promise<void> {
  try {
    const { phone, name, skipReason } = await creatorWhatsAppContact(creatorId)

    if (!phone) {
      await record('creator.status_whatsapp_skipped', {
        creator_id: creatorId, status, reason: skipReason ?? 'no_phone',
      })
      return
    }

    const res = await sendWhatsAppTemplate({
      template: STATUS_TEMPLATE,
      toPhone: phone,
      // One variable: their first name. If the approved template takes more,
      // MSG91 rejects the send rather than delivering something wrong, so a
      // mismatch is loud.
      bodyVars: [name],
      buttonValue: STATUS_LINK,
    })

    await record(res.ok ? 'creator.status_whatsapp_sent' : 'creator.status_whatsapp_failed', {
      creator_id: creatorId,
      status,
      // Masked: the events table is readable in more places than the phone
      // column is, and the number is not what makes this row useful.
      to: maskPhone(phone),
      ...(res.ok ? {} : { reason: res.reason }),
    })

    if (!res.ok) {
      console.error(`[creator-status] whatsapp failed creator=${creatorId} reason=${res.reason}`)
    }
  } catch (err) {
    console.error(
      `[creator-status] notify failed creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

async function record(eventType: string, detail: Record<string, unknown>): Promise<void> {
  try {
    await createAdminClient().from('events').insert({ event_type: eventType, detail })
  } catch (err) {
    console.error(`[creator-status] could not record ${eventType}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
