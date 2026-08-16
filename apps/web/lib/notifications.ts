import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsAppTemplate, isWhatsAppConfigured } from '@/lib/whatsapp'
import { sendDealEmail, isEmailConfigured, isPlausibleEmail } from '@/lib/email'
import { renderDealEmail, buildDealUrl } from '@/lib/email-template'
import { calculateFee } from '@/lib/fee'

/**
 * NOTIFICATION HELPER — the single site for all outbound notifications.
 *
 * COVERAGE CONTRACT: every server action that mutates deal state (status
 * change, message, invoice, payment) MUST call one of these helpers.
 * If you add a new deal-action server action, add a notify() call here.
 *
 * Architecture:
 *   deal event → notify() → INSERT into notifications table  (channel #1)
 *                         → WhatsApp template via MSG91      (channel #2, creator)
 *                         → Transactional email via Resend   (channel #3, brand)
 *
 * CHANNELS ARE ADDITIVE AND INDEPENDENT. The in-app rows are written FIRST and
 * are never gated on an external channel. Neither lib/whatsapp.ts nor
 * lib/email.ts can throw, so neither can fail a deal action.
 *
 * CHANNEL IS DECIDED BY ROLE, by product design:
 *   creator → WhatsApp   (an `email` spec for 'creator' is ignored)
 *   brand   → email      (a `whatsapp` spec for 'brand' is ignored)
 *
 * A BRAND IS A TEAM. Every brand member is notified — in-app and by email.
 * This previously resolved a single arbitrary member with .limit(1) and no
 * ORDER BY, so on a multi-member brand exactly one non-deterministically
 * chosen person heard about a deal event.
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
  /**
   * How a deal should be named TO THE CREATOR: `"Diwali Reel (GD-1042)"`.
   *
   * Title alone is brand-authored free text of unpredictable quality; ref
   * alone reads like an internal ticket number and means nothing to a
   * creator. Combining gives recognisable context plus something they can
   * quote to support, matching the ref on their invoice.
   *
   * Prefer this over raw dealTitle/dealRef in outbound messages.
   */
  dealLabel: string
  /**
   * What the BRAND PAYS for the deal as it currently stands, in paise —
   * gross, inclusive of platform fee. The mirror of the creator's net.
   *
   * Brand-facing surfaces must show this, never creator_receives_paise.
   * Computed here from the deal's fee snapshot so the rule lives in ONE place
   * rather than being re-derived (and eventually mis-derived) per call site.
   */
  brandPaysPaise: number
  /**
   * Apply the deal's fee snapshot to an arbitrary base amount — for figures
   * not yet written to the deal, such as a countered total that only exists
   * in the calling action's scope.
   */
  brandPaysFor: (basePaise: number) => number
}

/** Longest brand-authored title we will put in a message before truncating. */
const MAX_TITLE_CHARS = 40

/**
 * Build the creator-facing deal label.
 *
 * Guaranteed non-empty — WhatsApp rejects blank body parameters, and both
 * title and ref are nullable in practice (ops-created and pre-migration rows).
 */
export function buildDealLabel(title: string | null, ref: string | null): string {
  const cleanTitle = title?.trim().replace(/\s+/g, ' ') ?? ''
  const cleanRef = ref?.trim() ?? ''

  const shortTitle =
    cleanTitle.length > MAX_TITLE_CHARS
      ? `${cleanTitle.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…`
      : cleanTitle

  if (shortTitle && cleanRef) return `${shortTitle} (${cleanRef})`
  return shortTitle || cleanRef || 'your deal'
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

/**
 * What a brand notification email should say.
 *
 * The template supplies the shell (wordmark, deal row, CTA, footer); this is
 * the per-event content.
 */
export interface EmailSpec {
  /** Subject line. */
  subject: string
  /** Headline inside the email. */
  heading: string
  /** One or two sentences of context. */
  body: string
  /**
   * Amount in paise as the BRAND PAYS IT — gross, inclusive of platform fee
   * (calculateFee(...).brand_pays_paise), never the creator's net figure.
   * Omit where an amount adds noise rather than meaning.
   */
  amountPaise?: number
  /** Label for the amount row, e.g. "Amount due". */
  amountLabel?: string
  /** CTA text. Defaults to "View deal". */
  ctaLabel?: string
}

/** Built lazily, same shape as the WhatsApp builder. */
export type EmailSpecBuilder = (ctx: WhatsAppContext) => EmailSpec

interface NotifyOptions {
  whatsapp?: WhatsAppSpecBuilder
  email?: EmailSpecBuilder
}

/**
 * Create a notification for a specific user.
 * Uses service-role (admin client) because the caller may not be the
 * recipient, and RLS on notifications restricts INSERT to server only.
 */
export async function createNotification({
  userId,
  dealId,
  type,
  body,
}: NotifyParams): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('notifications')
    .insert({
      user_id: userId,
      deal_id: dealId,
      type,
      body,
    })
    .select('id')
    .single()

  if (error) {
    console.error(`[notify] in-app insert failed deal=${dealId} type=${type}: ${error.message}`)
    return null
  }
  return data?.id ?? null
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
    .select('title, deal_ref, brand_id, creator_id, price_paise, fee_percent, fee_mode')
    .eq('id', dealId)
    .single()

  if (!deal) return

  // Apply the deal's fee snapshot. Defined once so "brand pays gross" is a
  // single rule rather than an assumption repeated at every call site.
  const feeMode = (deal.fee_mode as 'on_top' | 'deducted') ?? 'on_top'
  const brandPaysFor = (basePaise: number) =>
    calculateFee(basePaise ?? 0, deal.fee_percent ?? 0, feeMode).brand_pays_paise

  // Recipients. A creator is one person; a BRAND IS A TEAM — every member is
  // notified, not one arbitrary row.
  let targetUserIds: string[] = []
  let brandEmails: string[] = []
  let creatorName: string | null = null
  let creatorPhone: string | null = null

  if (role === 'brand') {
    const { data: members } = await admin
      .from('brand_members')
      .select('user_id, users(email)')
      .eq('brand_id', deal.brand_id)

    for (const m of members ?? []) {
      if (m.user_id) targetUserIds.push(m.user_id)
      const email = (m.users as { email?: string | null } | null)?.email
      if (isPlausibleEmail(email)) {
        brandEmails.push(email)
      } else if (email) {
        console.warn(`[email] member skipped deal=${dealId} reason=unusable_email_on_users_row`)
      }
    }

    // A member with no email still gets the in-app notification; only their
    // email is skipped. One missing address must not suppress the others.
    const missing = targetUserIds.length - brandEmails.length
    if (missing > 0) {
      console.warn(`[email] deal=${dealId} ${missing} of ${targetUserIds.length} brand member(s) have no usable email`)
    }
  } else {
    const { data: cr } = await admin
      .from('creators')
      .select('user_id, full_name, phone')
      .eq('id', deal.creator_id)
      .single()
    if (cr?.user_id) targetUserIds.push(cr.user_id)
    creatorName = cr?.full_name ?? null
    creatorPhone = cr?.phone ?? null

    // A creator can nominate a different WhatsApp number on the under-review
    // screen. creators.phone is their LOGIN identity and often is not where
    // they read WhatsApp, so the nominated number wins where one exists.
    //
    // Falls back rather than failing: a stub creator has no users row at all,
    // and for them WhatsApp is the only channel that reaches them.
    if (cr?.user_id) {
      const { data: prefsRow } = await admin
        .from('users')
        .select('preferences')
        .eq('id', cr.user_id)
        .maybeSingle()

      const prefs = (prefsRow?.preferences ?? {}) as Record<string, unknown>
      const nominated = typeof prefs.whatsapp_phone === 'string' ? prefs.whatsapp_phone : null
      if (nominated) creatorPhone = nominated

      // An explicit opt-out is honoured. Absent means opted in: every creator
      // predates this setting, and defaulting them to silence would stop deal
      // notifications for the entire existing roster.
      if (prefs.notify_whatsapp === false) {
        console.info(`[whatsapp] ✗ skipped deal=${dealId} reason=creator_opted_out`)
        creatorPhone = null
      }
    }
  }

  // ── Channel #1: in-app feed (always first, never gated) ──
  // An ops-created creator stub has no users row yet (user_id is null), so
  // there is nobody to file an in-app notification against. That must NOT
  // suppress WhatsApp — for a stub creator receiving their first offer,
  // WhatsApp is the ONLY way they hear about it.
  const notificationIds: string[] = []
  for (const userId of targetUserIds) {
    const id = await createNotification({
      userId,
      dealId,
      type,
      body: bodyFn(deal.title),
    })
    if (id) notificationIds.push(id)
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
      dealPricePaise: deal.price_paise ?? 0,
      brandPaysFor,
      build: options.whatsapp,
    })
  }

  // ── Channel #3: email (brand-only, never fails the caller) ──
  if (role === 'brand' && options?.email) {
    await sendBrandEmail(admin, {
      dealId,
      brandId: deal.brand_id,
      creatorId: deal.creator_id,
      dealTitle: deal.title,
      dealRef: deal.deal_ref ?? null,
      toEmails: brandEmails,
      // Stable key for THIS event, so a replayed send delivers once. Two
      // genuinely distinct events produce different rows and both send —
      // which is correct; two counter-offers deserve two emails.
      idempotencyKey: notificationIds[0],
      dealPricePaise: deal.price_paise ?? 0,
      brandPaysFor,
      build: options.email,
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
    dealPricePaise: number
    brandPaysFor: (basePaise: number) => number
    build: WhatsAppSpecBuilder
  },
) {
  try {
    // Entry log: proves the WhatsApp path was reached for this event, which is
    // the first thing to check when no message arrives.
    const configured = isWhatsAppConfigured()
    console.info(`[whatsapp] dispatch deal=${args.dealId} configured=${configured}`)

    if (!configured) {
      console.warn(`[whatsapp] ✗ skipped deal=${args.dealId} reason=not_configured (MSG91_WHATSAPP_ENABLED must be exactly "true")`)
      return
    }
    if (!args.creatorPhone) {
      console.warn(`[whatsapp] ✗ skipped deal=${args.dealId} reason=creator_has_no_phone`)
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
      dealLabel: buildDealLabel(args.dealTitle, args.dealRef),
      brandPaysPaise: args.brandPaysFor(args.dealPricePaise),
      brandPaysFor: args.brandPaysFor,
    })

    // The result is inspected rather than discarded — the sender logs its own
    // failures, but dropping the value here once hid the reason entirely.
    const result = await sendWhatsAppTemplate({
      template: spec.template,
      toPhone: args.creatorPhone,
      bodyVars: spec.bodyVars,
      buttonValue: spec.buttonValue,
      dealId: args.dealId,
    })

    if (!result.ok) {
      console.warn(`[whatsapp] ✗ not delivered deal=${args.dealId} template=${spec.template} reason=${result.reason}`)
    }
  } catch (err) {
    console.error(
      `[whatsapp] dispatch failed deal=${args.dealId}: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

/**
 * Resolve email content and hand off to Resend.
 *
 * Wrapped in its own try/catch on top of the sender's guarantee: the extra DB
 * lookups here (creator and brand names) could throw independently, and a
 * notification lookup failure must never surface into the deal action.
 */
async function sendBrandEmail(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    dealId: string
    brandId: string
    creatorId: string
    dealTitle: string
    dealRef: string | null
    toEmails: string[]
    idempotencyKey?: string
    dealPricePaise: number
    brandPaysFor: (basePaise: number) => number
    build: EmailSpecBuilder
  },
) {
  try {
    // Entry log: proves the email path was reached for this event, which is
    // the first thing to check when no email arrives.
    const configured = isEmailConfigured()
    console.info(`[email] dispatch deal=${args.dealId} configured=${configured} recipients=${args.toEmails.length}`)

    if (!configured) {
      console.warn(`[email] ✗ skipped deal=${args.dealId} reason=not_configured (EMAIL_ENABLED must be exactly "true")`)
      return
    }
    if (args.toEmails.length === 0) {
      console.warn(`[email] ✗ skipped deal=${args.dealId} reason=no_brand_member_emails`)
      return
    }

    const [{ data: creator }, { data: brand }] = await Promise.all([
      admin.from('creators').select('full_name').eq('id', args.creatorId).maybeSingle(),
      admin.from('brands').select('name').eq('id', args.brandId).maybeSingle(),
    ])

    const spec = args.build({
      creatorName: creator?.full_name?.trim() || 'The creator',
      brandName: brand?.name?.trim() || 'your brand',
      dealTitle: args.dealTitle,
      dealRef: args.dealRef,
      dealLabel: buildDealLabel(args.dealTitle, args.dealRef),
      brandPaysPaise: args.brandPaysFor(args.dealPricePaise),
      brandPaysFor: args.brandPaysFor,
    })

    const { html, text } = renderDealEmail({
      heading: spec.heading,
      body: spec.body,
      dealLabel: buildDealLabel(args.dealTitle, args.dealRef),
      amountPaise: spec.amountPaise,
      amountLabel: spec.amountLabel,
      // Brand route. /creator/deals/{id} here would bounce them to creator login.
      dealUrl: buildDealUrl(args.dealId),
      ctaLabel: spec.ctaLabel,
    })

    // Result inspected rather than discarded — the sender logs its own
    // failures, but dropping the value once hid the reason entirely.
    const result = await sendDealEmail({
      to: args.toEmails,
      subject: spec.subject,
      html,
      text,
      idempotencyKey: args.idempotencyKey,
      dealId: args.dealId,
    })

    if (!result.ok) {
      console.warn(`[email] ✗ not delivered deal=${args.dealId} reason=${result.reason}`)
    }
  } catch (err) {
    console.error(
      `[email] dispatch failed deal=${args.dealId}: ${err instanceof Error ? err.message : String(err)}`
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
