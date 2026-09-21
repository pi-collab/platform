import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { notifyCreatorInstagramBroken as whatsappBroken } from '@/lib/creator-whatsapp'
import { notifyCreatorInstagramBroken as emailBroken } from '@/lib/account-emails'
import type { IgStatus } from '@/lib/ig-connection-status'

/**
 * Tell a creator, once, that their Instagram connection has stopped working.
 *
 * ── Why "once" needs state and not just care ────────────────────────────────
 * This is called from the nightly sync, which will find the same broken
 * connection again tomorrow, and the night after, for as long as it stays
 * broken. Without a record of having spoken, a creator who is slow to
 * reconnect gets the same WhatsApp every morning — which is how a useful
 * message becomes one people mute.
 *
 * ── The stamp is CLAIMED before sending, not written after ──────────────────
 * The update below is conditional on `broken_notified_at IS NULL` and returns
 * the row only if it actually changed it. Whoever gets a row back owns the
 * send; anyone else — a retry, an overlapping run, a manual re-sync fired while
 * the cron is mid-pass — gets nothing back and sends nothing.
 *
 * The cost of claiming first is that a send failing AFTER the claim is not
 * retried tomorrow. That is the right way round for this feature: every channel
 * records its own outcome in `events`, so a failure is visible and answerable,
 * whereas a retry loop on a flaky channel is a creator's phone buzzing at 3am
 * every night. Tell once, loudly, and make the failure queryable.
 *
 * Never throws. A creator's notification must not end a sync run that still has
 * other creators' tokens to refresh — those are the ones that expire.
 */
export async function notifyConnectionBroken(creatorId: string, status: IgStatus): Promise<void> {
  try {
    // Reconnecting is the wrong instruction for a Personal account: it produces
    // a Personal account again. That distinction is carried all the way through
    // to the copy on every channel rather than being flattened here.
    const variant = status === 'personal_account' ? 'personal_account' : 'reconnect'

    const admin = createAdminClient()
    const { data: claimed } = await admin
      .from('creator_instagram_connections')
      .update({ broken_notified_at: new Date().toISOString() })
      .eq('creator_id', creatorId)
      .is('broken_notified_at', null)
      .select('creator_id')
      .maybeSingle()

    // Already told them about this break. Reconnecting clears the stamp (see
    // the connect upsert), so the NEXT break notifies again.
    if (!claimed) return

    const body = variant === 'personal_account'
      ? 'Your Instagram is set to a Personal account, so your verified stats have stopped updating. Switch back to a Business or Creator account in Instagram, then reconnect.'
      : 'Your Instagram connection needs a quick reconnect to keep your verified stats live on your shopfront.'

    // All three fire together: this is a rare event the creator cannot discover
    // on their own, and the dedupe above is what keeps that from being noisy.
    // Settled, not raced — one channel failing must not cancel the others.
    const [waRes, mailRes, inAppRes] = await Promise.allSettled([
      whatsappBroken(creatorId, variant),
      emailBroken(creatorId, variant),
      createInAppNotice(creatorId, variant, body),
    ])

    const ok = (r: PromiseSettledResult<boolean>) => r.status === 'fulfilled' && r.value
    // One line per break, so "did we tell them, and did anything land?" is a log
    // search rather than three separate event queries.
    console.info(
      `[instagram-notify] creator=${creatorId} variant=${variant} `
      + `whatsapp=${ok(waRes)} email=${ok(mailRes)} in_app=${ok(inAppRes)}`,
    )
  } catch (err) {
    console.error(
      `[instagram-notify] failed creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/**
 * The dashboard's own copy of the message.
 *
 * Needs `creators.user_id`: notifications are keyed to a user, and an
 * ops-created creator who has never claimed their profile has no user row. They
 * can still hold a connection and still break, so this is a real skip rather
 * than a defensive one — WhatsApp is the channel that reaches them.
 */
async function createInAppNotice(
  creatorId: string,
  variant: 'reconnect' | 'personal_account',
  body: string,
): Promise<boolean> {
  const admin = createAdminClient()
  const { data: creator } = await admin
    .from('creators').select('user_id').eq('id', creatorId).maybeSingle()

  if (!creator?.user_id) return false

  const id = await createNotification({
    userId: creator.user_id,
    // Account-level, not deal-level. The column is nullable for exactly this.
    dealId: null,
    type: variant === 'personal_account' ? 'instagram.personal_account' : 'instagram.reconnect',
    body,
  })
  return id !== null
}
