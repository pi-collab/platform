'use server'

import { revalidatePath } from 'next/cache'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { logOpsEvent } from '@/lib/ops-audit'
import { replyToCreatorAppeal } from '@/lib/account-emails'

export type ReplyResult = { ok: true } | { ok: false; message: string }

const MAX_SUBJECT = 120
const MAX_MESSAGE = 4000

/**
 * Reply to an appeal, by email, from ops.
 *
 * Gated again here rather than relying on the layout. A server action is its own
 * entry point: the layout guard protects the page, not the POST, and this one
 * sends mail to a real person under the company's address.
 *
 * AUDITED, and audited BEFORE the result is returned. This is an outbound
 * message to a rejected creator, so "who said what to whom, and when" has to
 * survive the session it was sent in. The message body is recorded too — the
 * whole point of the log is that the reply can be read back later, and a record
 * saying only "a reply was sent" answers none of the questions anyone will
 * actually have.
 */
export async function replyToAppeal(
  creatorId: string,
  subject: string,
  message: string,
): Promise<ReplyResult> {
  const user = await verifyOpsAccess()
  if (!user) return { ok: false, message: 'Not authorised.' }

  const cleanSubject = subject.trim().slice(0, MAX_SUBJECT)
  const cleanMessage = message.trim().slice(0, MAX_MESSAGE)

  if (!creatorId) return { ok: false, message: 'No creator on that appeal.' }
  if (!cleanSubject) return { ok: false, message: 'Add a subject.' }
  if (!cleanMessage) return { ok: false, message: 'Write a message first.' }

  const sent = await replyToCreatorAppeal(creatorId, cleanSubject, cleanMessage)

  // Logged either way. A failed send is a thing that happened and is worth
  // knowing about when a creator says they never heard back.
  await logOpsEvent(user, 'creator.appeal_replied', 'creators', creatorId, {
    subject: cleanSubject,
    message: cleanMessage,
    delivered: sent.ok,
    ...(sent.ok ? {} : { failure: sent.reason }),
  })

  if (!sent.ok) return { ok: false, message: sent.reason }

  revalidatePath('/ops/appeals')
  revalidatePath(`/ops/creators/${creatorId}`)
  return { ok: true }
}
