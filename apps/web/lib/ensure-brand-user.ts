import 'server-only'
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Ensure a `users` row exists for the given auth user.
 * Called by BOTH the Google OAuth callback and email+password login
 * to guarantee identical account state regardless of auth method.
 *
 * Accepts a Supabase client so the caller controls the cookie context
 * (route handlers and server actions create clients differently).
 */
export async function ensureBrandUserRow(
  supabase: SupabaseClient,
  authId: string,
  email: string | undefined
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', authId)
    .maybeSingle()

  if (existing) return existing.id

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
