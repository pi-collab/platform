'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CREATOR_APPROVAL_ACK } from '@/lib/creator-approval'

/**
 * Mark the approval screen as seen, so it shows once and not again.
 *
 * The creator is resolved from the session, never passed in.
 */
export async function acknowledgeCreatorApproval(): Promise<{ ok: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()
  if (!profile) return { ok: false }

  const { data: creator } = await admin
    .from('creators').select('id').eq('user_id', profile.id).maybeSingle()
  if (!creator) return { ok: false }

  const { error } = await admin.from('events').insert({
    event_type: CREATOR_APPROVAL_ACK,
    detail: { creator_id: creator.id },
  })

  if (error) {
    // Non-fatal: the screen reappears next visit, which is a smaller problem
    // than an error on a congratulation.
    console.error(`[creator-approval] ack failed creator=${creator.id}: ${error.message}`)
    return { ok: false }
  }
  return { ok: true }
}
