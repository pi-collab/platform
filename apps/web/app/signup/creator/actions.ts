'use server'

import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'

// ── Types ──────────────────────────────────────────────────────────

type OTPResult =
  | { status: 'sent' }
  | { status: 'error'; message: string }

type VerifyResult =
  | { status: 'ok'; redirect: string }
  | { status: 'multi_stub'; message: string }
  | { status: 'error'; message: string }

// ── Send OTP ───────────────────────────────────────────────────────

export async function sendOTP(rawPhone: string): Promise<OTPResult> {
  const phone = normalizePhone(rawPhone)
  if (!phone) return { status: 'error', message: 'Enter a valid 10-digit Indian phone number.' }

  const admin = createAdminClient()

  // Rate limit: max 3 active (unused, unexpired) codes per phone
  const { count } = await admin
    .from('phone_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())

  if ((count ?? 0) >= 3) {
    return { status: 'error', message: 'Too many codes sent. Wait a few minutes and try again.' }
  }

  // Generate 6-digit code
  const code = String(Math.floor(100000 + Math.random() * 900000))

  const { error } = await admin.from('phone_verifications').insert({
    phone,
    code,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
  })

  if (error) return { status: 'error', message: 'Failed to send code. Please try again.' }

  // PLUGGABLE: In production, replace this with real SMS (Twilio/MSG91).
  // For now, log to server console for dev testing.
  console.log(`[OTP] Code for ${phone}: ${code}`)

  return { status: 'sent' }
}

// ── Verify OTP + Stub-Match + Session ──────────────────────────────

export async function verifyAndMatch(rawPhone: string, inputCode: string): Promise<VerifyResult> {
  const phone = normalizePhone(rawPhone)
  if (!phone) return { status: 'error', message: 'Invalid phone number.' }

  const trimmedCode = inputCode.trim()
  if (!/^\d{6}$/.test(trimmedCode)) return { status: 'error', message: 'Enter a 6-digit code.' }

  const admin = createAdminClient()

  // ── 1. OTP verification ──

  // ENV-GATED dev bypass: accept 123456 ONLY when NODE_ENV !== 'production'
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

    // Mark as used (prevent replay)
    await admin
      .from('phone_verifications')
      .update({ used: true })
      .eq('id', verification.id)
  }

  // ── 2. Stub-match ──

  const { data: stubs } = await admin
    .from('creators')
    .select('id, user_id, full_name, is_vetted')
    .eq('phone', phone)

  const matchedStubs = stubs ?? []
  const unclaimed = matchedStubs.filter((s) => !s.user_id)

  // Case 2c: phone exists and ALL matches are already claimed → account exists
  if (matchedStubs.length > 0 && unclaimed.length === 0) {
    return {
      status: 'ok',
      redirect: '/login/creator?error=account_exists',
    }
  }

  // Multi-stub: multiple unclaimed stubs with same phone → ops alert, block signup
  if (unclaimed.length > 1) {
    console.error(
      `[SIGNUP ALERT] Multiple unclaimed creator stubs for phone ${phone}: ` +
      `IDs: ${unclaimed.map((s) => s.id).join(', ')}. ` +
      `Manual resolution required. Creator cannot complete signup until resolved.`
    )

    // Ops-visible event (shows in events table for dashboard pickup)
    await admin.from('events').insert({
      event_type: 'ops.multi_stub_alert',
      detail: {
        phone,
        stub_ids: unclaimed.map((s) => s.id),
        stub_names: unclaimed.map((s) => s.full_name),
        message: 'Multiple unclaimed stubs match this phone. Manual resolution required.',
      },
    })

    return {
      status: 'multi_stub',
      message: 'We need to verify your account. Our team has been notified and will reach out shortly.',
    }
  }

  // ── 3. Create or find auth user ──

  // Synthetic email for auth — Supabase signInWithPassword needs email
  // when phone auth isn't configured. The user never sees this; future
  // logins go through Google OAuth. Format: deterministic from phone.
  const syntheticEmail = `creator_${phone.replace('+', '')}@auth.guapd.internal`
  const password = crypto.randomBytes(32).toString('hex')
  let authId: string

  const { data: newAuth, error: createAuthErr } = await admin.auth.admin.createUser({
    phone,
    email: syntheticEmail,
    email_confirm: true,
    phone_confirm: true,
    password,
  })

  if (newAuth?.user) {
    authId = newAuth.user.id
  } else {
    // Auth user may already exist (partial previous signup attempt).
    // Look up by phone via DB function and reset password so we can sign in.
    const { data: existingAuthId } = await admin.rpc('get_auth_id_by_phone', { p_phone: phone })

    if (!existingAuthId) {
      console.error('[SIGNUP] createUser failed and no existing auth user found:', createAuthErr?.message)
      return { status: 'error', message: 'Failed to create account. Please try again.' }
    }

    authId = existingAuthId

    // Update password so we can sign in below
    const { error: updateErr } = await admin.auth.admin.updateUserById(authId, { password })
    if (updateErr) {
      console.error('[SIGNUP] Failed to update auth user password:', updateErr.message)
      return { status: 'error', message: 'Failed to create account. Please try again.' }
    }
  }

  // ── 4. Ensure users row ──

  const { data: existingProfile } = await admin
    .from('users')
    .select('id')
    .eq('auth_id', authId)
    .maybeSingle()

  let userId: string

  if (existingProfile) {
    userId = existingProfile.id
  } else {
    const { data: newProfile, error: profileErr } = await admin
      .from('users')
      .insert({ auth_id: authId, phone, role: 'creator' })
      .select('id')
      .single()

    if (profileErr || !newProfile) {
      return { status: 'error', message: 'Failed to create profile. Please try again.' }
    }
    userId = newProfile.id
  }

  // ── 5. Claim stub or create new creator ──

  let redirect: string

  if (unclaimed.length === 1) {
    // Case 2b: claim the unclaimed stub
    const stub = unclaimed[0]

    const { error: claimErr } = await admin
      .from('creators')
      .update({ user_id: userId })
      .eq('id', stub.id)
      .is('user_id', null) // guard: only if still unclaimed (race protection)

    if (claimErr) {
      return { status: 'error', message: 'Failed to link your account. Please try again.' }
    }

    // Vetted stub with a name → straight to deals
    redirect = (stub.is_vetted && stub.full_name)
      ? '/signup/creator/complete?claimed=1'
      : '/signup/creator/onboarding'
  } else {
    // Case 2a: no match → new creator (unvetted)
    const { error: createErr } = await admin.from('creators').insert({
      user_id: userId,
      full_name: '',
      phone,
      is_vetted: false,
    })

    if (createErr) {
      return { status: 'error', message: 'Failed to create creator profile. Please try again.' }
    }

    redirect = '/signup/creator/onboarding'
  }

  // ── 6. Establish browser session ──
  // Sign in via the server-side Supabase client (writes session cookies).
  // This is a server action, so cookies().set() works.

  const supabase = createClient()
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email: syntheticEmail, password })

  if (signInErr) {
    console.error('[SIGNUP] signInWithPassword failed:', signInErr.message)
    // Account was created but session failed — send to login as fallback
    return { status: 'ok', redirect: '/login/creator' }
  }

  return { status: 'ok', redirect }
}
