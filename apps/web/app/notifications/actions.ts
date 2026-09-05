'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Errors are LOGGED, not swallowed.
 *
 * These used to `await` the update and ignore whatever came back. That is the
 * shape of a bug we have already shipped once: `markDealThreadRead` wrote zero
 * rows for its entire life because it filtered on the wrong column, and the
 * silence meant the unread badge counted every message ever sent while
 * everything looked fine. RLS scopes both updates here, so a policy change is
 * enough to make them no-ops — and a no-op that says nothing is indistinguishable
 * from success.
 */

export async function markNotificationRead(id: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)

  if (error) {
    console.error(`[notifications] mark read failed id=${id}: ${error.message}`)
  }
  revalidatePath('/notifications')
  revalidatePath('/creator/notifications')
}

export async function markAllNotificationsRead() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // auth_id, not id. users.auth_id is the link to the auth user; filtering on
  // users.id against an auth uuid matches nothing and fails silently.
  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()
  if (!profile) {
    console.error(`[notifications] mark all read: no users row for auth_id=${user.id}`)
    return
  }

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', profile.id)
    .is('read_at', null)

  if (error) {
    console.error(`[notifications] mark all read failed user=${profile.id}: ${error.message}`)
  }
  revalidatePath('/notifications')
  revalidatePath('/creator/notifications')
}
