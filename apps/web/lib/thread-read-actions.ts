'use server'

import { createClient } from '@/lib/supabase/server'
import { markThreadRead } from '@/lib/unread'
import { revalidatePath } from 'next/cache'

/**
 * Mark this deal's thread read for whoever is signed in.
 *
 * Called when the chat panel opens, which is the moment reading actually
 * happens. The badge previously counted unread NOTIFICATIONS of type message,
 * so it only cleared when someone visited the notifications page — a brand
 * could read every message in the panel and still carry a badge saying they had
 * not.
 *
 * Route-neutral on purpose: both deal pages need it, and they are two different
 * dynamic routes. Importing an action across those is what has broken builds in
 * this codebase before.
 *
 * Silent on failure. A read marker that does not save leaves a badge up, which
 * is a nuisance; an error toast over a chat panel that just opened is worse.
 */
export async function markDealThreadRead(dealId: string): Promise<void> {
  if (!dealId) return

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // users.auth_id, NOT users.id. This looked up `id` and found nothing, fell
  // back to the auth id, and message_reads.user_id references users(id) — so
  // every write violated the foreign key and the catch below swallowed it.
  // Zero rows were ever written and the badge never moved.
  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (!profile?.id) {
    console.error(`[thread-read] no users row for auth ${user.id}`)
    return
  }

  try {
    await markThreadRead(profile.id, dealId)
    /* Drop the cached inbox. Without this the marker is written but the list a
       reader navigates back to is served from cache, still wearing the badge
       for a thread they just read. Both inboxes, because this action is
       route-neutral and does not know which side called it. */
    revalidatePath('/creator/inbox')
    revalidatePath('/inbox')
  } catch (err) {
    // Logged, not silent. A swallowed failure here is invisible: the only
    // symptom is a badge that will not clear, which is exactly what happened.
    console.error(`[thread-read] failed deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
