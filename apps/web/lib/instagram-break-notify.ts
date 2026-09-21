import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { notifyCreatorInstagramBroken as whatsappBroken } from '@/lib/creator-whatsapp'
import { notifyCreatorInstagramBroken as emailBroken } from '@/lib/account-emails'
import type { IgStatus } from '@/lib/ig-connection-status'

/**
 * Telling a creator their Instagram connection has stopped working.
 *
 * Twice at most, ever: once when it breaks, and once a week later if it is
 * still broken. Never a third time — at that point they have decided, and an
 * unactivated creator is a job for the ops connection filter and a human,
 * not for another automated message.
 *
 * ── Why "once" needs state and not just care ────────────────────────────────
 * Both of these are called from the nightly cron, which will find the same
 * broken connection again tomorrow, and the night after, for as long as it
 * stays broken. Without a record of having spoken, a creator who is slow to
 * reconnect gets the same WhatsApp every morning — which is how a useful
 * message becomes one people mute.
 */

type Variant = 'reconnect' | 'personal_account'
type Stage = 'first' | 'reminder'

/**
 * Take ownership of one notification by stamping its column, and say whether
 * we got it.
 *
 * ── Claimed BEFORE sending, not written after ───────────────────────────────
 * The update is conditional on the column being NULL and returns the row only
 * if it actually changed it. Whoever gets a row back owns the send; anyone
 * else — a retry, an overlapping run, a manual re-sync fired while the cron is
 * mid-pass — gets nothing back and sends nothing.
 *
 * The cost of claiming first is that a send failing AFTER the claim is not
 * retried tomorrow. That is the right way round here: every channel records
 * its own outcome in `events`, so a failure is visible and answerable, whereas
 * a retry loop on a flaky channel is a creator's phone buzzing at 3am every
 * night until they give up on us.
 */
async function claim(creatorId: string, column: 'broken_notified_at' | 'reminder_sent_at'): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('creator_instagram_connections')
    .update({ [column]: new Date().toISOString() })
    .eq('creator_id', creatorId)
    .is(column, null)
    .select('creator_id')
    .maybeSingle()
  return Boolean(data)
}

/**
 * All three channels, settled rather than raced: one failing must not cancel
 * the others.
 *
 * Reconnecting is the wrong instruction for a Personal account — it produces a
 * Personal account again — so the distinction is carried all the way into the
 * copy on every channel rather than flattened here.
 */
async function fanOut(creatorId: string, variant: Variant, stage: Stage): Promise<void> {
  const reminder = stage === 'reminder'

  const body = variant === 'personal_account'
    ? reminder
      ? 'Your Instagram is still set to a Personal account, so your verified stats have not updated for a week. Switch back to a Business or Creator account in Instagram, then reconnect.'
      : 'Your Instagram is set to a Personal account, so your verified stats have stopped updating. Switch back to a Business or Creator account in Instagram, then reconnect.'
    : reminder
      ? 'Your Instagram has been disconnected for a week. Reconnect to put your verified stats back on your shopfront.'
      : 'Your Instagram connection needs a quick reconnect to keep your verified stats live on your shopfront.'

  const [waRes, mailRes, inAppRes] = await Promise.allSettled([
    whatsappBroken(creatorId, variant, stage),
    emailBroken(creatorId, variant, stage),
    createInAppNotice(creatorId, variant, body),
  ])

  const ok = (r: PromiseSettledResult<boolean>) => r.status === 'fulfilled' && r.value
  // One line per notification, so "did we tell them, and did anything land?"
  // is a log search rather than three separate event queries.
  console.info(
    `[instagram-notify] creator=${creatorId} variant=${variant} stage=${stage} `
    + `whatsapp=${ok(waRes)} email=${ok(mailRes)} in_app=${ok(inAppRes)}`,
  )
}

function variantOf(status: IgStatus): Variant {
  return status === 'personal_account' ? 'personal_account' : 'reconnect'
}

/**
 * First contact, the moment the connection breaks.
 *
 * Never throws. A creator's notification must not end a sync run that still
 * has other creators' tokens to refresh — those are the ones that expire.
 */
export async function notifyConnectionBroken(creatorId: string, status: IgStatus): Promise<void> {
  try {
    // Already told them about this break. Reconnecting clears the stamp (see
    // the connect upsert), so the NEXT break notifies again.
    if (!(await claim(creatorId, 'broken_notified_at'))) return
    await fanOut(creatorId, variantOf(status), 'first')
  } catch (err) {
    console.error(
      `[instagram-notify] failed creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/**
 * The one reminder, a week on, for a connection still broken.
 *
 * Caller supplies only rows that are genuinely due — see
 * `connectionsDueForReminder`, which is the thing that knows about the seven
 * days. The claim here is the guard against sending twice, not against
 * sending early.
 */
export async function remindConnectionBroken(creatorId: string, status: IgStatus): Promise<void> {
  try {
    if (!(await claim(creatorId, 'reminder_sent_at'))) return
    await fanOut(creatorId, variantOf(status), 'reminder')
  } catch (err) {
    console.error(
      `[instagram-notify] reminder failed creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/**
 * The dashboard's own copy of the message.
 *
 * Needs `creators.user_id`: notifications are keyed to a user, and an
 * ops-created creator who has never claimed their profile has no user row.
 * They can still hold a connection and still break, so this is a real skip
 * rather than a defensive one — WhatsApp is the channel that reaches them.
 */
async function createInAppNotice(
  creatorId: string,
  variant: Variant,
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
