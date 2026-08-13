'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { validateNewPassword } from '@/lib/password'
import { RECOVERY_COOKIE } from '@/lib/recovery-cookie'

type ResetResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }
  | { status: 'expired' }

/**
 * Set a new password for the current recovery session.
 *
 * The server is the gate, not the form: validation runs here even though the
 * client checks first, and both the session and the recovery marker are
 * re-verified rather than trusted from the page render.
 */
export async function setNewPassword(password: string, confirmation: string): Promise<ResetResult> {
  // 1. Re-check the recovery marker. The page checked it too, but a server
  //    action is directly callable — the page render is not a security gate.
  if (cookies().get(RECOVERY_COOKIE)?.value !== '1') {
    return { status: 'expired' }
  }

  // 2. Same rules as signup, enforced server-side.
  const check = validateNewPassword(password, confirmation)
  if (!check.ok) return { status: 'error', message: check.message }

  const supabase = createClient()

  // 3. Require a live session. Without one updateUser cannot change anything,
  //    so this is the boundary that actually protects the account.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'expired' }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    // Supabase rejects a password matching the current one, and enforces its
    // own project minimum — surface its wording rather than inventing ours.
    return { status: 'error', message: error.message }
  }

  // 4. Burn the marker: one recovery link, one password change.
  cookies().delete(RECOVERY_COOKIE)

  // 5. Revoke every OTHER session. A reset is often prompted by a suspected
  //    compromise; leaving other sessions alive would defeat the point. The
  //    current session is kept so the success screen can render, then the user
  //    is sent to /login to sign in with the new password.
  const { error: signOutErr } = await supabase.auth.signOut({ scope: 'others' })
  if (signOutErr) {
    // Non-fatal: the password DID change. Log it rather than telling the user
    // their reset failed when it did not.
    console.error('[reset-password] failed to revoke other sessions:', signOutErr.message)
  }

  return { status: 'ok' }
}
