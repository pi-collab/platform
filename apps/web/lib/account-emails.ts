import 'server-only'
import { followerRangeOf } from '@/lib/follower-range'
import { checkDomainHealth } from '@/lib/domain-health'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAccountEmail, isEmailConfigured } from '@/lib/email'
import { renderAccountEmail } from '@/lib/email-template'
import { BRAND_NAME } from '@/lib/content'

/**
 * Account-level emails: the ones that tell someone their account changed
 * state, rather than that a deal did.
 *
 * These are the moments a user is WAITING on us. A brand held at first send
 * and a creator awaiting vetting have both been told "we'll let you know", and
 * until this existed we simply did not — approval happened silently in ops and
 * the only way to discover it was to keep logging in and checking.
 *
 * Every function here:
 *   - never throws, so a mail failure cannot roll back an ops action that
 *     already succeeded
 *   - records the outcome in `events`, so "were they told?" is a query
 *   - is safe to call twice; the idempotency key covers a double-clicked
 *     ops button within Resend's 24h window
 */

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')
}

/** Log the attempt so delivery is auditable, never throwing. */
async function record(
  eventType: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await createAdminClient().from('events').insert({ event_type: eventType, detail })
  } catch (err) {
    console.error(`[account-email] could not record ${eventType}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Tell a brand its account cleared review.
 *
 * Sent to EVERY member, not just the admin who signed up. Any of them may be
 * the one waiting on a held deal, and a brand is a team.
 */
export async function notifyBrandApproved(brandId: string): Promise<void> {
  try {
    const admin = createAdminClient()

    const { data: brand } = await admin
      .from('brands').select('name').eq('id', brandId).maybeSingle()

    const { data: members } = await admin
      .from('brand_members').select('user_id').eq('brand_id', brandId)

    const userIds = (members ?? []).map((m) => m.user_id)
    if (userIds.length === 0) {
      await record('brand.approved_email_skipped', { brand_id: brandId, reason: 'no_members' })
      return
    }

    const { data: users } = await admin
      .from('users').select('email').in('id', userIds)

    const to = (users ?? []).map((u) => u.email).filter((e): e is string => Boolean(e))
    if (to.length === 0) {
      await record('brand.approved_email_skipped', { brand_id: brandId, reason: 'no_addresses' })
      return
    }

    const { html, text } = renderAccountEmail({
      heading: `${brand?.name ?? 'Your brand'} is approved`,
      body: [
        `Your account has been reviewed and cleared, so you can now send deals to creators on ${BRAND_NAME}.`,
        'Anything you had queued while we reviewed you has already gone out. You do not need to send it again.',
      ],
      ctaUrl: `${siteBase()}/dashboard`,
      ctaLabel: 'Go to your dashboard',
      footerNote: `You're receiving this because you're a member of ${brand?.name ?? 'this brand'} on ${BRAND_NAME}.`,
    })

    const res = await sendAccountEmail({
      to,
      subject: `${brand?.name ?? 'Your brand'} is approved on ${BRAND_NAME}`,
      html,
      text,
      // Brand id alone: approval happens once, so a second send within the
      // window is a double-click, not a second event.
      idempotencyKey: `brand-approved-${brandId}`,
    })

    await record(res.ok ? 'brand.approved_email_sent' : 'brand.approved_email_failed', {
      brand_id: brandId,
      recipients: to.length,
      ...(res.ok ? {} : { reason: res.reason }),
    })
  } catch (err) {
    console.error(`[account-email] notifyBrandApproved failed brand=${brandId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Tell a brand its account was not approved.
 *
 * Sent to every member, like the approval email. The reason is ops' own words
 * when given; without one the email says only what is certain. It does not
 * link to the dashboard, because a rejected brand cannot use it: the link goes
 * to the screen that explains the decision.
 */
export async function notifyBrandRejected(brandId: string, reason: string | null): Promise<void> {
  try {
    const admin = createAdminClient()

    const { data: brand } = await admin
      .from('brands').select('name').eq('id', brandId).maybeSingle()

    const { data: members } = await admin
      .from('brand_members').select('user_id').eq('brand_id', brandId)

    const userIds = (members ?? []).map((m) => m.user_id)
    if (userIds.length === 0) {
      await record('brand.rejected_email_skipped', { brand_id: brandId, reason: 'no_members' })
      return
    }

    const { data: users } = await admin
      .from('users').select('email').in('id', userIds)

    const to = (users ?? []).map((u) => u.email).filter((e): e is string => Boolean(e))
    if (to.length === 0) {
      await record('brand.rejected_email_skipped', { brand_id: brandId, reason: 'no_addresses' })
      return
    }

    const name = brand?.name ?? 'Your brand'
    const { html, text } = renderAccountEmail({
      heading: `${name} was not approved`,
      body: [
        `We reviewed your account and were not able to approve it, so it cannot be used to work with creators on ${BRAND_NAME}.`,
        ...(reason ? [`The reason we gave: ${reason}`] : []),
        'If you think this is a mistake, reply to this email or write to contact@guapd.com and we will take another look.',
      ],
      ctaUrl: `${siteBase()}/brand/rejected`,
      ctaLabel: 'View your account status',
      footerNote: `You're receiving this because you're a member of ${name} on ${BRAND_NAME}.`,
    })

    const res = await sendAccountEmail({
      to,
      subject: `${name} was not approved on ${BRAND_NAME}`,
      html,
      text,
      // Brand id alone, like approval: a second send inside the window is a
      // double-click, not a second decision.
      idempotencyKey: `brand-rejected-${brandId}`,
    })

    await record(res.ok ? 'brand.rejected_email_sent' : 'brand.rejected_email_failed', {
      brand_id: brandId,
      recipients: to.length,
      ...(res.ok ? {} : { reason: res.reason }),
    })
  } catch (err) {
    console.error(`[account-email] notifyBrandRejected failed brand=${brandId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Resolve a creator's best contact address, or null. */
async function creatorEmail(creatorId: string): Promise<{ email: string | null; name: string }> {
  const admin = createAdminClient()
  const { data: creator } = await admin
    .from('creators').select('full_name, contact_email, user_id').eq('id', creatorId).maybeSingle()

  if (!creator) return { email: null, name: 'there' }

  // contact_email is the address the creator gave us for exactly this; the
  // users row only has one if they signed up with Google.
  let email = creator.contact_email ?? null
  if (!email && creator.user_id) {
    const { data: u } = await admin.from('users').select('email').eq('id', creator.user_id).maybeSingle()
    email = u?.email ?? null
  }

  return { email, name: creator.full_name?.split(' ')[0] || 'there' }
}

/**
 * Welcome a creator into Guapd Growth.
 *
 * A POSITIVE outcome, written as one. Growth is a track for creators who are
 * not ready for the Deals side yet, and the difference between "you're in a
 * programme" and "you didn't get in" is entirely in how this reads. It is not a
 * softened rejection, and it does not apologise.
 */
export async function notifyCreatorGrowth(creatorId: string): Promise<void> {
  try {
    // No name here: the heading is fixed copy, matching the page a creator
    // lands on, so there is nowhere left to address them by name.
    const { email } = await creatorEmail(creatorId)
    if (!email) {
      await record('creator.growth_email_skipped', { creator_id: creatorId, reason: 'no_address' })
      return
    }

    const { html, text } = renderAccountEmail({
      heading: `You’ve been approved for Guapd Growth`,
      body: [
        `We have reviewed your profile and brought you into Guapd Growth, our track for creators on their way up.`,
        'It is where we help you grow your audience and learn how brand collaborations actually work, and we are lining up the best brand deals for creators like you. We will let you know the moment there is something for you.',
      ],
      ctaUrl: `${siteBase()}/creator/growth`,
      ctaLabel: 'See your Guapd Growth page',
    })

    const res = await sendAccountEmail({
      to: [email],
      subject: `You’ve been approved for Guapd Growth`,
      html,
      text,
      idempotencyKey: `creator-growth-${creatorId}`,
    })

    await record(res.ok ? 'creator.growth_email_sent' : 'creator.growth_email_failed', {
      creator_id: creatorId,
      ...(res.ok ? {} : { reason: res.reason }),
    })
  } catch (err) {
    console.error(`[account-email] notifyCreatorGrowth failed creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Tell a creator their profile passed vetting. */
export async function notifyCreatorApproved(creatorId: string): Promise<void> {
  try {
    const { email, name } = await creatorEmail(creatorId)
    if (!email) {
      // Expected, not exceptional: a creator who signed up by phone has given
      // us no address. Recorded so the gap is visible rather than silent.
      await record('creator.approved_email_skipped', { creator_id: creatorId, reason: 'no_address' })
      return
    }

    const { html, text } = renderAccountEmail({
      heading: `You're approved, ${name}`,
      body: [
        `Your profile has been reviewed and you're now live on ${BRAND_NAME}.`,
        'Brands can find you and send offers. Set up your shopfront so they see your rates and your best work.',
      ],
      ctaUrl: `${siteBase()}/creator/dashboard`,
      ctaLabel: 'Go to your dashboard',
    })

    const res = await sendAccountEmail({
      to: [email],
      subject: `You're approved on ${BRAND_NAME}`,
      html,
      text,
      idempotencyKey: `creator-approved-${creatorId}`,
    })

    await record(res.ok ? 'creator.approved_email_sent' : 'creator.approved_email_failed', {
      creator_id: creatorId,
      ...(res.ok ? {} : { reason: res.reason }),
    })
  } catch (err) {
    console.error(`[account-email] notifyCreatorApproved failed creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Tell a creator their profile was not approved.
 *
 * Deliberately leaves a door open rather than closing the account off. Vetting
 * is a judgement made on limited information, and the people most likely to be
 * rejected early are the ones whose profile was simply too thin to assess.
 */
export async function notifyCreatorRejected(creatorId: string): Promise<void> {
  try {
    const { email, name } = await creatorEmail(creatorId)
    if (!email) {
      await record('creator.rejected_email_skipped', { creator_id: creatorId, reason: 'no_address' })
      return
    }

    const { html, text } = renderAccountEmail({
      heading: `An update on your ${BRAND_NAME} profile`,
      body: [
        `Hi ${name}, we've reviewed your profile and can't approve it for ${BRAND_NAME} right now.`,
        'Review looks at a few different parameters, and this is not a judgement on the quality of your work.',
        // NOT "reply to this email": EMAIL_REPLY_TO is unset, so a reply goes
        // nowhere. The appeal box on their profile page does reach us, and it
        // records what they wrote rather than depending on mail routing.
        'If you think we have got this wrong, open your profile and send us a note. We will take another look.',
      ],
      ctaUrl: `${siteBase()}/creator/dashboard`,
      ctaLabel: 'View your profile status',
      footerNote: `This is an automated notification from ${BRAND_NAME}.`,
    })

    const res = await sendAccountEmail({
      to: [email],
      subject: `An update on your ${BRAND_NAME} profile`,
      html,
      text,
      idempotencyKey: `creator-rejected-${creatorId}`,
    })

    await record(res.ok ? 'creator.rejected_email_sent' : 'creator.rejected_email_failed', {
      creator_id: creatorId,
      ...(res.ok ? {} : { reason: res.reason }),
    })
  } catch (err) {
    console.error(`[account-email] notifyCreatorRejected failed creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}


/**
 * Tell ops a creator has submitted their profile and is waiting on vetting.
 *
 * The mirror of the brand gate's notifyOpsOnce. Without it a creator sits on
 * "check back in 24 to 48 hours" while nobody knows to look: the ops queue is
 * a page somebody has to remember to open, and the creator has been given a
 * deadline we never agreed to internally.
 *
 * Sent ONCE per creator. The event guard is on existence rather than a time
 * window, so re-saving the profile does not re-notify.
 */
/**
 * Tell a creator their Instagram connection stopped working.
 *
 * ── Why this is worth an email at all ───────────────────────────────────────
 * Nothing visibly breaks when a connection dies. The storefront keeps working,
 * keeps showing audience figures, and simply reverts to the numbers the creator
 * typed in months ago — which a brand cannot tell apart from verified ones, and
 * which the creator has no reason to look at. Silence here is not a small
 * omission: it is a storefront quietly making a weaker claim than it could.
 *
 * ── Two messages, not one with a clause ─────────────────────────────────────
 * A Personal account needs a different ACTION, not a softer sentence. Sending
 * the reconnect copy to someone on a Personal account tells them to do a thing
 * that cannot work — they would do it, watch it fail, and be right to think the
 * fault is ours.
 *
 * `idempotencyKey` carries the variant, so a creator who breaks, reconnects as
 * Personal and breaks again inside Resend's 24h window still receives the
 * second, different message rather than having it swallowed as a duplicate.
 */
export async function notifyCreatorInstagramBroken(
  creatorId: string,
  variant: 'reconnect' | 'personal_account',
  stage: 'first' | 'reminder' = 'first',
): Promise<boolean> {
  try {
    const { email, name } = await creatorEmail(creatorId)
    if (!email) {
      await record('creator.instagram_email_skipped', {
        creator_id: creatorId, variant, stage, reason: 'no_address',
      })
      return false
    }

    const personal = variant === 'personal_account'
    const reminder = stage === 'reminder'

    const { html, text } = renderAccountEmail({
      // The reminder says something the first message could not: that a week
      // has passed and nothing has changed. Repeating the original word for
      // word would read as a duplicate and be ignored as one.
      heading: personal
        ? reminder
          ? 'Your Instagram is still set to Personal'
          : 'Switch your Instagram back to a Business or Creator account'
        : reminder
          ? `Your Instagram is still disconnected, ${name}`
          : `Reconnect your Instagram, ${name}`,
      body: personal
        ? reminder
          ? [
              `Your Instagram account is still set to Personal, so the verified figures on your ${BRAND_NAME} shopfront have not updated for a week.`,
              'Open Instagram, go to Settings and account type, and switch back to a Business or Creator account. Then reconnect here. This is the last reminder we will send about it.',
            ]
          : [
              `Your Instagram account is now set to Personal. Instagram does not report audience insights for Personal accounts, so the verified figures on your ${BRAND_NAME} shopfront have stopped updating.`,
              'To fix it: open Instagram, go to Settings and account type, and switch back to a Business or Creator account. Then reconnect here. Reconnecting on its own will not work while the account is Personal.',
            ]
        : reminder
          ? [
              'Your Instagram has been disconnected for a week, so brands browsing your shopfront are still seeing the audience numbers you typed in yourself rather than the ones Instagram reports.',
              'Reconnecting takes about thirty seconds. This is the last reminder we will send about it.',
            ]
          : [
              `Your Instagram connection needs a quick reconnect to keep your verified stats live on your shopfront.`,
              `Until you do, brands see the audience numbers you typed in yourself rather than the ones Instagram reports. It takes about thirty seconds.`,
            ],
      ctaUrl: `${siteBase()}/creator/settings`,
      ctaLabel: 'Reconnect Instagram',
    })

    const res = await sendAccountEmail({
      to: [email],
      subject: personal
        ? reminder
          ? `Your Instagram is still set to Personal`
          : `Your Instagram is set to Personal. Switch it back to keep verified stats`
        : reminder
          ? `Your shopfront still is not showing verified stats`
          : `Reconnect your Instagram to keep your verified stats live`,
      html,
      text,
      // Stage is part of the key, so the reminder is not swallowed as a
      // duplicate of the first message inside Resend's window.
      idempotencyKey: `creator-instagram-${variant}-${stage}-${creatorId}`,
    })

    await record(res.ok ? 'creator.instagram_email_sent' : 'creator.instagram_email_failed', {
      creator_id: creatorId,
      variant,
      stage,
      ...(res.ok ? {} : { reason: res.reason }),
    })
    return res.ok
  } catch (err) {
    console.error(`[account-email] notifyCreatorInstagramBroken failed creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

export async function notifyOpsCreatorPending(creatorId: string): Promise<void> {
  try {
    const admin = createAdminClient()

    const { data: already } = await admin
      .from('events')
      .select('id')
      .eq('event_type', 'creator.pending_review_notified')
      .contains('detail', { creator_id: creatorId })
      .limit(1)
      .maybeSingle()

    if (already) return

    const to = process.env.OPS_NOTIFY_EMAIL
    if (!to) {
      console.warn('[account-email] OPS_NOTIFY_EMAIL unset, skipping creator review notice')
      return
    }
    if (!isEmailConfigured()) {
      console.warn('[account-email] email not configured, skipping creator review notice')
      return
    }

    const { data: creator } = await admin
      .from('creators')
      .select('full_name, handle, primary_platform, phone, social_accounts')
      .eq('id', creatorId)
      .maybeSingle()

    const name = creator?.full_name?.trim() || 'A creator'
    const handle = creator?.handle ? `@${creator.handle}` : 'no handle'
    const reach = followerRangeOf(creator?.social_accounts)

    const { html, text } = renderAccountEmail({
      heading: `${name} is waiting on vetting`,
      body: [
        `${name} (${handle}) has completed their profile and is waiting to be reviewed.`,
        // The audience band they picked. It is the first thing anyone vetting
        // wants, and putting it here means the obvious calls can be made from
        // the mail without opening ops at all.
        reach
          ? `Audience: ${reach} followers.`
          : 'Audience: not answered (profile predates the follower question).',
        // They have been promised a window; ops needs to know the clock is on.
        'They have been told to check back in 24 to 48 hours, so this one is on a clock.',
      ],
      // Straight to the creator, not the list. The queue is where you end up
      // hunting for the row this email is about.
      ctaUrl: `${siteBase()}/ops/creators/${creatorId}`,
      ctaLabel: 'Review this creator',
      footerNote: `Sent to the ops address for ${BRAND_NAME}.`,
    })

    const res = await sendAccountEmail({
      to: [to],
      subject: `Creator awaiting vetting: ${name}`,
      html,
      text,
      idempotencyKey: `creator-pending-${creatorId}`,
    })

    // Recorded only on success, so a transient failure retries on the next
    // submit rather than burning the single notice this creator gets.
    if (res.ok) {
      await record('creator.pending_review_notified', {
        creator_id: creatorId,
        to_masked: to.replace(/(.{2}).*(@.*)/, '$1***$2'),
      })
    } else {
      console.error(`[account-email] ops creator notice failed creator=${creatorId}: ${res.reason}`)
    }
  } catch (err) {
    console.error(`[account-email] notifyOpsCreatorPending failed creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}


/**
 * Forward a rejected creator's appeal to ops.
 *
 * The appeal is already stored as an event before this runs, so a mail
 * failure loses the notification, not what they wrote.
 */
export async function notifyOpsCreatorAppeal(creatorId: string, note: string): Promise<void> {
  try {
    const to = process.env.OPS_NOTIFY_EMAIL
    if (!to || !isEmailConfigured()) {
      console.warn('[account-email] ops address or email not configured, appeal not forwarded')
      return
    }

    const admin = createAdminClient()
    const { data: creator } = await admin
      .from('creators').select('full_name, handle').eq('id', creatorId).maybeSingle()

    const name = creator?.full_name?.trim() || 'A creator'

    const { html, text } = renderAccountEmail({
      heading: `${name} has appealed their rejection`,
      body: [
        `${name}${creator?.handle ? ` (@${creator.handle})` : ''} was not approved and has asked us to look again.`,
        note,
      ],
      ctaUrl: `${siteBase()}/ops/creators/${creatorId}`,
      ctaLabel: 'Open their profile',
      footerNote: `Sent to the ops address for ${BRAND_NAME}.`,
    })

    const res = await sendAccountEmail({
      to: [to],
      subject: `Appeal from ${name}`,
      html,
      text,
      idempotencyKey: `creator-appeal-${creatorId}`,
    })

    await record(res.ok ? 'creator.appeal_notified' : 'creator.appeal_notify_failed', {
      creator_id: creatorId,
      ...(res.ok ? {} : { reason: res.reason }),
    })
  } catch (err) {
    console.error(`[account-email] notifyOpsCreatorAppeal failed creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}


/**
 * Tell ops that a brand has signed up.
 *
 * The creator side has notifyOpsCreatorPending; the brand side had nothing at
 * signup — notifyOpsOnce in send-gate.ts only fires later, when an unapproved
 * brand tries to send a deal. So a brand could sit unreviewed in the queue with
 * nobody told it had arrived.
 *
 * Carries the details rather than just a link, because the first question about
 * a new brand is whether it looks real, and that can usually be answered from
 * the name, the domain and the industry without opening anything.
 *
 * Once-only, keyed to the brand, so a retry cannot send twice. Never throws:
 * this runs inside signup and a failed notification must not fail an account.
 */
export async function notifyOpsBrandSignup(brandId: string): Promise<void> {
  try {
    const admin = createAdminClient()

    const { data: already } = await admin
      .from('events')
      .select('id')
      .eq('event_type', 'ops.brand_signup_notified')
      .contains('detail', { brand_id: brandId })
      .limit(1)
      .maybeSingle()

    if (already) return

    const to = process.env.OPS_NOTIFY_EMAIL
    if (!to) {
      console.warn('[account-email] OPS_NOTIFY_EMAIL unset, skipping brand signup notice')
      return
    }
    if (!isEmailConfigured()) {
      console.warn('[account-email] email not configured, skipping brand signup notice')
      return
    }

    const { data: brand } = await admin
      .from('brands')
      .select('name, category, website, contact_email, contact_phone, contact_name, company_size, location, social_accounts, created_at')
      .eq('id', brandId)
      .maybeSingle()

    if (!brand) return

    const name = brand.name?.trim() || 'A brand'
    const social = Array.isArray(brand.social_accounts) ? brand.social_accounts : []
    const instagram = social
      .map((a) => (a && typeof a === 'object' ? (a as Record<string, unknown>) : null))
      .find((a) => a && a.platform === 'instagram')
    const handle = instagram && typeof instagram.handle === 'string' ? instagram.handle : null

    // One fact per line. Anything missing says so rather than being dropped,
    // because "no website" is itself worth knowing when judging a signup.
    // A signal, not a verdict. When the sign-in domain and the website domain
    // disagree it is worth a second look — but plenty of legitimate brands sign
    // up from an agency address or a founder's own domain, so this must never
    // block a signup. It goes in the mail so the judgement stays with a person.
    // Cheap DNS/TLS facts about the website, so whoever reviews this sees what
    // a manual check would have shown. Awaited because the notice is worth a
    // few seconds — but every lookup inside is capped and failure-tolerant, so
    // this cannot hang the send.
    const health = await checkDomainHealth(brand.website)
    const healthNote = health?.notes.length
      ? `\n\nAbout ${health.host}:\n` + health.notes.map((n) => `  - ${n}`).join('\n')
      : ''

    let domainNote = ''
    try {
      const emailDomain = (brand.contact_email || '').split('@')[1]?.toLowerCase()
      const siteDomain = brand.website
        ? new URL(brand.website).hostname.toLowerCase().replace(/^www\./, '')
        : null
      if (emailDomain && siteDomain && emailDomain !== siteDomain) {
        domainNote = `\nHeads up: the email domain (${emailDomain}) does not match the website (${siteDomain}).`
      }
    } catch { /* an unparseable website is not worth failing the notice over */ }

    const detail = [
      `Industry: ${brand.category || 'not given'}`,
      `Website: ${brand.website || 'not given'}`,
      `Instagram: ${handle ? '@' + handle : 'not given'}`,
      `Company size: ${brand.company_size || 'not given'}`,
      `Location: ${brand.location || 'not given'}`,
      `Contact: ${brand.contact_name || 'not given'} (${brand.contact_email || 'no email'})`,
      `Phone: ${brand.contact_phone || 'not given'}`,
    ].join('\n') + domainNote + healthNote

    const { html, text } = renderAccountEmail({
      heading: `${name} just signed up`,
      body: [
        `${name} created a brand account and is waiting to be reviewed.`,
        detail,
      ],
      ctaUrl: `${siteBase()}/ops/brands`,
      ctaLabel: 'Review this brand',
      footerNote: `Sent to the ops address for ${BRAND_NAME}.`,
    })

    const res = await sendAccountEmail({
      to: [to],
      subject: `New brand signup: ${name}`,
      html,
      text,
      idempotencyKey: `brand-signup-${brandId}`,
    })

    if (res.ok) {
      await record('ops.brand_signup_notified', {
        brand_id: brandId,
        to_masked: to.replace(/(.{2}).*(@.*)/, '$1***$2'),
      })
    } else {
      console.error(`[account-email] ops brand signup notice failed brand=${brandId}: ${res.reason}`)
    }
  } catch (err) {
    console.error(`[account-email] notifyOpsBrandSignup failed brand=${brandId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * A reply to a creator's appeal, written by ops.
 *
 * Sent from the same address and in the same shell as every other account email,
 * so a creator who has already had a rejection from Guapd recognises this as
 * being from Guapd. The body is whatever ops actually wrote: the templates on
 * the ops page are a starting point that gets edited, not a fixed set, because
 * an appeal is a person asking to be reconsidered and a form letter reads like
 * one.
 *
 * Returns the outcome rather than swallowing it. Unlike a notification, this is
 * an action someone took deliberately and is waiting on, so "we could not send
 * that" has to reach them rather than a log.
 */
export async function replyToCreatorAppeal(
  creatorId: string,
  subject: string,
  message: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isEmailConfigured()) {
    return { ok: false, reason: 'Email is not configured on this environment.' }
  }

  const { email, name } = await creatorEmail(creatorId)
  if (!email) {
    return { ok: false, reason: 'We have no email address for this creator.' }
  }

  // Paragraphs, split on blank lines. Ops writes in a textarea and expects the
  // breaks they typed to survive; a single block would arrive as a wall.
  const body = message.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  if (body.length === 0) return { ok: false, reason: 'The message is empty.' }

  const { html, text } = renderAccountEmail({
    heading: subject,
    body: [`Hi ${name},`, ...body],
    footerNote: `You are receiving this because you appealed a decision on your ${BRAND_NAME} account.`,
  })

  try {
    const res = await sendAccountEmail({ to: [email], subject, html, text })
    if (!res.ok) return { ok: false, reason: res.reason ?? 'The email provider rejected it.' }
    return { ok: true }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error(`[account-email] appeal reply failed creator=${creatorId}: ${detail}`)
    return { ok: false, reason: 'Could not send that. Please try again.' }
  }
}
