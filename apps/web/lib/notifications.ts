import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsAppTemplate, isWhatsAppConfigured } from '@/lib/whatsapp'

/**
 * NOTIFICATION HELPER — the single site for all outbound notifications.
 *
 * COVERAGE CONTRACT: every server action that mutates deal state (status
 * change, message, invoice, payment) MUST call one of these helpers.
 * If you add a new deal-action server action, add a notify() call here.
 *
 * Architecture:
 *   deal event → notify() → INSERT into notifications table  (channel #1)
 *                         → WhatsApp template via MSG91      (channel #2)
 *                         → (later) transactional email      (channel #3)
 *
 * CHANNELS ARE ADDITIVE AND INDEPENDENT. The in-app row is written first and
 * is never gated on any external channel; WhatsApp cannot throw (see
 * lib/whatsapp.ts) so it cannot fail a deal action. Email slots in the same
 * way later — call sites should not need to change.
 *
 * WhatsApp is CREATOR-ONLY by product decision. Passing a `whatsapp` spec for
 * the 'brand' role is ignored.
 */

interface NotifyParams {
  userId: string
  dealId: string
  type: string
  body: string
}

/** Deal facts available when building template variables. */
export interface WhatsAppContext {
  creatorName: string
  brandName: string
  dealTitle: string
  /** Human-readable reference like "GD-1042", null on older deals. */
  dealRef: string | null
}

export interface WhatsAppSpec {
  /** Approved template name. */
  template: string
  /** Fills body_1..body_n in order. */
  bodyVars: string[]
  /**
   * Fills button_1 — the URL SUFFIX only.
   *
   * new_offer_received → an HMAC offer TOKEN (generateOfferToken), because the
   * offer page is token-authorised and a bare UUID will not open it.
   * All other creator templates → the deal UUID, for /creator/deals/{id}.
   */
  buttonValue: string
}

/** Built lazily so call sites can use deal facts they don't already hold. */
export type WhatsAppSpecBuilder = (ctx: WhatsAppContext) => WhatsAppSpec

interface NotifyOptions {
  whatsapp?: WhatsAppSpecBuilder
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
  options?: NotifyOptions,
) {
  const admin = createAdminClient()

  const { data: deal } = await admin
    .from('deals')
    .select('title, deal_ref, brand_id, creator_id')
    .eq('id', dealId)
    .single()

  if (!deal) return

  let targetUserId: string | null = null
  let creatorName: string | null = null
  let creatorPhone: string | null = null

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
      .select('user_id, full_name, phone')
      .eq('id', deal.creator_id)
      .single()
    targetUserId = cr?.user_id ?? null
    creatorName = cr?.full_name ?? null
    creatorPhone = cr?.phone ?? null
  }

  // ── Channel #1: in-app feed ──
  // An ops-created creator stub has no users row yet (user_id is null), so
  // there is nobody to file an in-app notification against. That must NOT
  // suppress WhatsApp — for a stub creator receiving their first offer,
  // WhatsApp is the ONLY way they hear about it.
  if (targetUserId) {
    await createNotification({
      userId: targetUserId,
      dealId,
      type,
      body: bodyFn(deal.title),
    })
  }

  // ── Channel #2: WhatsApp (creator-only, never fails the caller) ──
  if (role === 'creator' && options?.whatsapp) {
    await sendCreatorWhatsApp(admin, {
      dealId,
      brandId: deal.brand_id,
      dealTitle: deal.title,
      dealRef: deal.deal_ref ?? null,
      creatorName,
      creatorPhone,
      build: options.whatsapp,
    })
  }
}

/**
 * Resolve template variables and hand off to MSG91.
 *
 * Wrapped in its own try/catch on top of the sender's internal guarantee:
 * the extra DB lookups here (brand name) could throw independently, and a
 * notification lookup failure must never surface into the deal action.
 */
async function sendCreatorWhatsApp(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    dealId: string
    brandId: string
    dealTitle: string
    dealRef: string | null
    creatorName: string | null
    creatorPhone: string | null
    build: WhatsAppSpecBuilder
  },
) {
  try {
    // Cheap exits before spending a query on the brand name.
    if (!isWhatsAppConfigured()) return
    if (!args.creatorPhone) {
      console.warn(`[whatsapp] skipped deal=${args.dealId} reason=creator_has_no_phone`)
      return
    }

    const { data: brand } = await admin
      .from('brands')
      .select('name')
      .eq('id', args.brandId)
      .maybeSingle()

    const spec = args.build({
      creatorName: args.creatorName?.trim() || 'there',
      brandName: brand?.name?.trim() || 'A brand',
      dealTitle: args.dealTitle,
      dealRef: args.dealRef,
    })

    await sendWhatsAppTemplate({
      template: spec.template,
      toPhone: args.creatorPhone,
      bodyVars: spec.bodyVars,
      buttonValue: spec.buttonValue,
      dealId: args.dealId,
    })
  } catch (err) {
    console.error(
      `[whatsapp] dispatch failed deal=${args.dealId}: ${err instanceof Error ? err.message : String(err)}`
    )
  }
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
