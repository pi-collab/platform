import 'server-only'
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Ensure a `users` row exists for the given auth user.
 * Called by BOTH the Google OAuth callback and email+password login
 * to guarantee identical account state regardless of auth method.
 *
 * Idempotent across auth methods: if the same email logs in via
 * Google and email+password (which can produce different auth_ids
 * in Supabase), we find the existing row by email and update its
 * auth_id rather than creating a duplicate.
 */
export async function ensureBrandUserRow(
  supabase: SupabaseClient,
  authId: string,
  email: string | undefined
): Promise<string | null> {
  // 1. Check by auth_id (exact identity match)
  const { data: byAuthId } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', authId)
    .maybeSingle()

  if (byAuthId) return byAuthId.id

  // 2. Check by email (same person, different auth method)
  if (email) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (byEmail) {
      // Link this auth identity to the existing row
      await supabase
        .from('users')
        .update({ auth_id: authId })
        .eq('id', byEmail.id)
      return byEmail.id
    }
  }

  // 3. No existing row — create one
  const { data: created, error } = await supabase
    .from('users')
    .insert({
      auth_id: authId,
      email,
      role: 'brand_member',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[ensureBrandUserRow] users insert failed:', error.message)
    return null
  }

  return created.id
}
