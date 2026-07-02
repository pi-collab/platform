'use server'

import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'

type SignInResult =
  | { status: 'ok'; redirect: string }
  | { status: 'error'; message: string }

/**
 * Verify OTP and sign in an existing creator.
 * Does NOT create accounts — for that, use /signup/creator.
 */
export async function verifyAndSignIn(rawPhone: string, inputCode: string): Promise<SignInResult> {
  const phone = normalizePhone(rawPhone)
  if (!phone) return { status: 'error', message: 'Invalid phone number.' }

  const trimmedCode = inputCode.trim()
  if (!/^\d{6}$/.test(trimmedCode)) return { status: 'error', message: 'Enter a 6-digit code.' }

  const admin = createAdminClient()

  // ── 1. OTP verification ──
  const isDevBypass =
    trimmedCode === '123456' && process.env.NODE_ENV !== 'production'

  if (!isDevBypass) {
    const { data: verification } = await admin
      .from('phone_verifications')
      .select('id')
      .eq('phone', phone)
      .eq('code', trimmedCode)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!verification) {
      return { status: 'error', message: 'Invalid or expired code. Try again.' }
    }

    await admin
      .from('phone_verifications')
      .update({ used: true })
      .eq('id', verification.id)
  }

  // ── 2. Find creator by phone ──
  const { data: creators } = await admin
    .from('creators')
    .select('id, user_id')
    .eq('phone', phone)

  const matched = creators ?? []

  if (matched.length === 0) {
    return { status: 'error', message: 'No account found for this number. Sign up first.' }
  }

  // If all matched creators are unclaimed stubs (no user_id), send to signup to claim
  const claimed = matched.find((c) => c.user_id)
  if (!claimed) {
    return { status: 'error', message: 'Your profile exists but hasn\'t been set up yet. Please sign up to claim it.' }
  }

  const creator = claimed

  // ── 3. Find auth user ──
  const { data: profile } = await admin
    .from('users')
    .select('auth_id')
    .eq('id', creator.user_id)
    .maybeSingle()

  if (!profile?.auth_id) {
    return { status: 'error', message: 'Account configuration error. Please contact support.' }
  }

  // ── 4. Reset password and sign in ──
  const syntheticEmail = `creator_${phone.replace('+', '')}@auth.guapd.internal`
  const password = crypto.randomBytes(32).toString('hex')

  const { error: updateErr } = await admin.auth.admin.updateUserById(profile.auth_id, {
    password,
    email: syntheticEmail,
  })

  if (updateErr) {
    console.error('[LOGIN] Failed to update auth user:', updateErr.message)
    return { status: 'error', message: 'Sign-in failed. Please try again.' }
  }

  const supabase = createClient()
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: syntheticEmail,
    password,
  })

  if (signInErr) {
    console.error('[LOGIN] signInWithPassword failed:', signInErr.message)
    return { status: 'error', message: 'Sign-in failed. Please try again.' }
  }

  return { status: 'ok', redirect: '/creator/deals' }
}
