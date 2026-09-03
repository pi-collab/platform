'use server'

import { createClient } from '@/lib/supabase/server'
import { markThreadRead } from '@/lib/unread'

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

  // The users row id, not the auth id: message_reads keys on users(id), which
  // is what every other table here joins on.
  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  const userId = profile?.id ?? user.id

  try {
    await markThreadRead(userId, dealId)
  } catch {
    /* see above */
  }
}
