import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * NOTIFICATION HELPER — the single site for all in-app notifications.
 *
 * COVERAGE CONTRACT: every server action that mutates deal state (status
 * change, message, invoice, payment) MUST call one of these helpers.
 * If you add a new deal-action server action, add a notify() call here.
 * This is the same site where WhatsApp/Interakt push will slot in later
 * as channel #2 — one function, multiple delivery channels.
 *
 * Architecture:
 *   deal event → notify() → INSERT into notifications table (channel #1)
 *                         → (later) WhatsApp via Interakt    (channel #2)
 */

interface NotifyParams {
  userId: string
  dealId: string
  type: string
  body: string
}

/**
 * Create a notification for a specific user.
 * Uses service-role (admin client) because the caller may not be the
 * recipient, and RLS on notifications restricts INSERT to server only.
 */
export async function createNotification({ userId, dealId, type, body }: NotifyParams) {
  const admin = createAdminClient()
  await admin.from('notifications').insert({
    user_id: userId,
    deal_id: dealId,
    type,
    body,
  })
  // Future: check user preferences, send WhatsApp via Interakt here
}

/**
 * Look up the OTHER party's user_id on a deal given the actor's user_id.
 * Returns { otherUserId, dealTitle } or null if not found.
 */
async function getOtherParty(dealId: string, actorProfileId: string) {
  const admin = createAdminClient()

  const { data: deal } = await admin
    .from('deals')
    .select('title, brand_id, creator_id')
    .eq('id', dealId)
    .single()

  if (!deal) return null

  // Get brand user
  const { data: brandMember } = await admin
    .from('brand_members')
    .select('user_id')
    .eq('brand_id', deal.brand_id)
    .limit(1)
    .single()

  // Get creator user
  const { data: creator } = await admin
    .from('creators')
    .select('user_id')
    .eq('id', deal.creator_id)
    .single()

  const brandUserId = brandMember?.user_id
  const creatorUserId = creator?.user_id

  // Figure out who the "other" is
  let otherUserId: string | null = null
  if (actorProfileId === brandUserId) {
    otherUserId = creatorUserId ?? null
  } else if (actorProfileId === creatorUserId) {
    otherUserId = brandUserId ?? null
  }

  return otherUserId ? { otherUserId, dealTitle: deal.title } : null
}

/**
 * Notify the other party on a deal. Used for most deal events.
 */
export async function notifyOtherParty(
  dealId: string,
  actorProfileId: string,
  type: string,
  bodyFn: (dealTitle: string) => string,
) {
  const result = await getOtherParty(dealId, actorProfileId)
  if (!result) return
  await createNotification({
    userId: result.otherUserId,
    dealId,
    type,
    body: bodyFn(result.dealTitle),
  })
}

/**
 * Notify a specific party (brand or creator) on a deal by role.
 */
export async function notifyDealParty(
  dealId: string,
  role: 'brand' | 'creator',
  type: string,
  bodyFn: (dealTitle: string) => string,
) {
  const admin = createAdminClient()

  const { data: deal } = await admin
    .from('deals')
    .select('title, brand_id, creator_id')
    .eq('id', dealId)
    .single()

  if (!deal) return

  let targetUserId: string | null = null

  if (role === 'brand') {
    const { data: bm } = await admin
      .from('brand_members')
      .select('user_id')
      .eq('brand_id', deal.brand_id)
      .limit(1)
      .single()
    targetUserId = bm?.user_id ?? null
  } else {
    const { data: cr } = await admin
      .from('creators')
      .select('user_id')
      .eq('id', deal.creator_id)
      .single()
    targetUserId = cr?.user_id ?? null
  }

  if (!targetUserId) return

  await createNotification({
    userId: targetUserId,
    dealId,
    type,
    body: bodyFn(deal.title),
  })
}

/**
 * Notify both parties on a deal.
 */
export async function notifyBothParties(
  dealId: string,
  type: string,
  bodyFn: (dealTitle: string) => string,
) {
  await notifyDealParty(dealId, 'brand', type, bodyFn)
  await notifyDealParty(dealId, 'creator', type, bodyFn)
}
