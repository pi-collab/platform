import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

/**
 * Verify the current session belongs to a founder in the OPS_ALLOWED_EMAILS allowlist.
 * Returns the verified User if authorized, null otherwise.
 *
 * Uses supabase.auth.getUser() which validates the JWT server-side —
 * never trusts a client-supplied value.
 */
export async function verifyOpsAccess(): Promise<User | null> {
  const allowedRaw = process.env.OPS_ALLOWED_EMAILS
  if (!allowedRaw) return null

  const allowedEmails = new Set(
    allowedRaw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  )

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null

  if (!allowedEmails.has(user.email.toLowerCase())) return null

  return user
}
