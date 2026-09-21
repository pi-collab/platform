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
 * NOT SENT. The approved status_update template's URL button is STATIC — the
 * whole address is baked into it — so it takes no parameter, and supplying one
 * is rejected outright:
 *
 *   buttons: Button at index 0 of type Url does not require parameters
 *
 * This is the second time this template rejected a send for an argument it
 * never declared; the first was bodyVars, for the same underlying reason. The
 * rule for status_update is simply: no variables, of any kind.
 *
 * Kept as a constant because it documents where that button actually points,
 * and because a dynamic-suffix button is what we would need the day the
 * template is revised to link at a specific deal.
 *
 * /creator/dashboard serves every status on its own: the creator layout sends a
 * rejected creator to the rejection screen, a pending one to the under-review
 * page, and an approved one to the dashboard. Logged out, the login page
 * carries them back here afterwards.
 */
const STATUS_LINK = 'creator/dashboard'
void STATUS_LINK

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
  status: 'approved' | 'rejected' | 'pending' | 'growth',
): Promise<void> {
  try {
    const { phone, skipReason } = await creatorWhatsAppContact(creatorId)

    if (!phone) {
      await record('creator.status_whatsapp_skipped', {
        creator_id: creatorId, status, reason: skipReason ?? 'no_phone',
      })
      return
    }

    const res = await sendWhatsAppTemplate({
      template: STATUS_TEMPLATE,
      toPhone: phone,
      // EMPTY on purpose. The approved status_update template has no body
      // variables — its text is fixed. Sending one produced
      //   "number of localizable_params (1) does not match the expected
      //    number of params (0)"
      // and the send was rejected, which is the failure mode worth having:
      // loud, and never a message with a stray placeholder in it.
      //
      // If the template is later revised to greet by name, add `name` back here
      // in the same order the template declares its variables.
      bodyVars: [],
      // No buttonValue either. See STATUS_LINK above: the template's URL button
      // is static, and MSG91 rejects the whole send for supplying a parameter
      // it does not declare.
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

/**
 * Two templates, because the instruction differs.
 *
 * `instagram_reconnect` says reconnect, and for an expired or failed token
 * that is the whole fix. `instagram_personal_account` says change the account
 * type FIRST, because reconnecting a Personal account produces a Personal
 * account again — the creator would follow our instruction, watch it fail, and
 * reasonably conclude the product is broken.
 *
 * Both declare ONE body variable (the creator's first name) and a URL button
 * with a dynamic suffix. That shape is chosen against the scar tissue above:
 * `status_update` was rejected twice for passing arguments it never declared.
 * Whatever is registered with Meta must match this exactly — one body var, one
 * dynamic URL suffix — or the send fails at MSG91 rather than at review.
 *
 * PENDING META APPROVAL at time of writing. Until each is live, sends return
 * not ok and are recorded as failures; email and the dashboard banner still
 * reach the creator. That is the intended degradation, not a gap to paper over.
 */
const IG_RECONNECT_TEMPLATE = 'instagram_reconnect'
const IG_PERSONAL_TEMPLATE = 'instagram_personal_account'

/** Where the button lands. A relative suffix, appended to the template's own
 *  base URL by Meta. NOT /api/instagram/connect: that needs a live session and
 *  would dead-end anyone tapping from WhatsApp while logged out. /creator/settings
 *  carries them through login and back. */
const RECONNECT_SUFFIX = 'creator/settings'

/**
 * Tell a creator their Instagram connection stopped working.
 *
 * Never throws: this is called from the nightly sync, and one creator's failed
 * WhatsApp must not end a run that still has other creators' tokens to refresh.
 */
export async function notifyCreatorInstagramBroken(
  creatorId: string,
  variant: 'reconnect' | 'personal_account',
): Promise<boolean> {
  try {
    const { phone, name, skipReason } = await creatorWhatsAppContact(creatorId)

    if (!phone) {
      await record('creator.instagram_whatsapp_skipped', {
        creator_id: creatorId, variant, reason: skipReason ?? 'no_phone',
      })
      return false
    }

    const res = await sendWhatsAppTemplate({
      template: variant === 'personal_account' ? IG_PERSONAL_TEMPLATE : IG_RECONNECT_TEMPLATE,
      toPhone: phone,
      // creatorWhatsAppContact already falls back to 'there' when full_name is
      // empty, which matters more than it looks: sendWhatsAppTemplate REJECTS a
      // blank body var outright, so an unnamed creator would otherwise get no
      // message at all rather than an unpersonalised one.
      bodyVars: [name],
      buttonValue: RECONNECT_SUFFIX,
    })

    await record(res.ok ? 'creator.instagram_whatsapp_sent' : 'creator.instagram_whatsapp_failed', {
      creator_id: creatorId,
      variant,
      to: maskPhone(phone),
      ...(res.ok ? {} : { reason: res.reason }),
    })

    if (!res.ok) {
      console.error(`[instagram-notify] whatsapp failed creator=${creatorId} reason=${res.reason}`)
    }
    return res.ok
  } catch (err) {
    console.error(
      `[instagram-notify] whatsapp threw creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`,
    )
    return false
  }
}

async function record(eventType: string, detail: Record<string, unknown>): Promise<void> {
  try {
    await createAdminClient().from('events').insert({ event_type: eventType, detail })
  } catch (err) {
    console.error(`[creator-status] could not record ${eventType}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
