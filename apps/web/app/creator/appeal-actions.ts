'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyOpsCreatorAppeal } from '@/lib/account-emails'

type Result = { status: 'ok' } | { status: 'error'; message: string }

const MAX_LENGTH = 2000

/**
 * A rejected creator asking us to look again.
 *
 * The creator is resolved from the session, never from an id in the payload —
 * a server action is directly callable, and this one emails ops.
 */
export async function sendAppeal(note: string): Promise<Result> {
  const trimmed = note.trim()
  if (!trimmed) return { status: 'error', message: 'Add a note so we know what to look at.' }
  if (trimmed.length > MAX_LENGTH) {
    return { status: 'error', message: `Keep it under ${MAX_LENGTH} characters.` }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Not signed in.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()
  if (!profile) return { status: 'error', message: 'Profile not found.' }

  const { data: creator } = await admin
    .from('creators').select('id, is_rejected').eq('user_id', profile.id).maybeSingle()
  if (!creator) return { status: 'error', message: 'Creator profile not found.' }
  if (!creator.is_rejected) {
    return { status: 'error', message: 'There is nothing to appeal on this account.' }
  }

  // One open appeal at a time. Without this, a creator who hears nothing for a
  // day can send the same note ten times and bury the queue they are trying to
  // reach.
  const { data: existing } = await admin
    .from('events')
    .select('id')
    .eq('event_type', 'creator.appeal_submitted')
    .contains('detail', { creator_id: creator.id })
    .limit(1)
    .maybeSingle()

  if (existing) return { status: 'error', message: 'You have already sent an appeal. We will come back to you.' }

  // Stored before the email, so the appeal survives a mail failure — losing
  // what someone wrote is worse than ops finding it in the log rather than
  // their inbox.
  await admin.from('events').insert({
    event_type: 'creator.appeal_submitted',
    detail: { creator_id: creator.id, note: trimmed },
  })

  await notifyOpsCreatorAppeal(creator.id, trimmed)

  return { status: 'ok' }
}
