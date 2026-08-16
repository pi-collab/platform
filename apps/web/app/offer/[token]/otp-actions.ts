'use server'

import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOfferToken } from '@/lib/offer-token'
import { sendOTP } from '@/app/signup/creator/actions'

export type OfferOtpSend =
  | { status: 'sent'; masked: string }
  | { status: 'error'; message: string }

export type OfferOtpVerify =
  /** Signed in and linked; `dealId` is where to send them. */
  | { status: 'ok'; dealId: string }
  | { status: 'error'; message: string }

/** +91 98765 43210 → +91 •••••  43210, enough to recognise, not enough to leak. */
function mask(phone: string): string {
  const d = phone.replace(/\D/g, '').slice(-10)
  return d.length === 10 ? `+91 •••••&nbsp;${d.slice(5)}`.replace('&nbsp;', ' ') : 'your number'
}

/**
 * Resolve the creator this offer belongs to, from the signed token alone.
 *
 * The token is an HMAC of the deal id, so the deal — and therefore the
 * creator and their number — is derived, never supplied by the caller.
 */
async function creatorForToken(token: string) {
  const parsed = verifyOfferToken(token)
  if (!parsed) return null

  const admin = createAdminClient()
  const { data: deal } = await admin
    .from('deals').select('id, creator_id').eq('id', parsed.dealId).maybeSingle()
  if (!deal?.creator_id) return null

  const { data: creator } = await admin
    .from('creators').select('id, phone, user_id').eq('id', deal.creator_id).maybeSingle()
  if (!creator?.phone) return null

  return { ...creator, dealId: deal.id }
}

/**
 * Send a sign-in code to the number this offer was sent to.
 *
 * Deliberately takes NO phone from the caller. The offer already went to a
 * specific creator over WhatsApp, so the number is known — asking for it would
 * add a field, invite a typo, and turn the form into a way to probe which
 * numbers exist.
 */
export async function sendOfferOTP(token: string): Promise<OfferOtpSend> {
  const creator = await creatorForToken(token)
  if (!creator) {
    return { status: 'error', message: 'This link is invalid, or the profile has no number on file.' }
  }

  const sent = await sendOTP(creator.phone!)
  if (sent.status === 'error') return { status: 'error', message: sent.message }

  return { status: 'sent', masked: mask(creator.phone!) }
}

/**
 * Verify the code and sign this creator in.
 *
 * ── Why this is a security fix, not just a UI change ────────────────────────
 * The accept action claims an unclaimed creator stub for WHOEVER is signed in.
 * With Google as the only door, anyone holding the offer link could sign in
 * with any account and take over that creator's profile — its vetting status,
 * its products, its deal history.
 *
 * Here the code goes only to the number already on the creator's row, so
 * completing this proves possession of that number. The person accepting is
 * the person the offer was sent to.
 */
export async function verifyOfferOTP(token: string, inputCode: string): Promise<OfferOtpVerify> {
  const creator = await creatorForToken(token)
  if (!creator) return { status: 'error', message: 'This link is invalid or has expired.' }

  const code = inputCode.trim()
  if (!/^\d{6}$/.test(code)) return { status: 'error', message: 'Enter the 6-digit code.' }

  const phone = creator.phone!
  const admin = createAdminClient()

  // STAGING ONLY — mirrors the bypass in signup/login. Never on production.
  const bypass =
    (code === '000000' || code === '123456') &&
    process.env.STAGING_OTP_BYPASS === 'true' &&
    process.env.VERCEL_ENV !== 'production'

  if (!bypass) {
    const { data: verification } = await admin
      .from('phone_verifications')
      .select('id')
      .eq('phone', phone)
      .eq('code', code)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!verification) return { status: 'error', message: 'Invalid or expired code. Try again.' }
    await admin.from('phone_verifications').update({ used: true }).eq('id', verification.id)
  }

  // ── Establish a session on the auth user for this number ──────────────────
  const syntheticEmail = `creator_${phone.replace('+', '')}@auth.guapd.internal`
  const password = crypto.randomBytes(32).toString('hex')

  let authId: string | null = null
  if (creator.user_id) {
    const { data: profile } = await admin
      .from('users').select('auth_id').eq('id', creator.user_id).maybeSingle()
    authId = profile?.auth_id ?? null
  }

  let loginEmail = syntheticEmail

  if (authId) {
    // Existing account: keep a real email if they have one, only reset the
    // password so we can sign in as them.
    const { data: authUser } = await admin.auth.admin.getUserById(authId)
    const existing = authUser?.user?.email
    const synthetic = existing?.endsWith('@auth.guapd.internal')
    loginEmail = existing && !synthetic ? existing : syntheticEmail

    const payload: { password: string; email?: string } = { password }
    if (!existing || synthetic) payload.email = syntheticEmail

    const { error } = await admin.auth.admin.updateUserById(authId, payload)
    if (error) {
      console.error('[offer-otp] updateUserById failed:', error.message)
      return { status: 'error', message: 'Sign-in failed. Please try again.' }
    }
  } else {
    // Unclaimed stub, or a claimed row whose auth user is missing: create the
    // auth user. acceptOffer then creates the users row and claims the stub.
    const { error } = await admin.auth.admin.createUser({
      email: syntheticEmail,
      password,
      email_confirm: true,
    })
    if (error && !error.message.toLowerCase().includes('already')) {
      console.error('[offer-otp] createUser failed:', error.message)
      return { status: 'error', message: 'Sign-in failed. Please try again.' }
    }
    if (error) {
      // Already exists from an earlier attempt — reset its password instead.
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
      const found = list?.users.find((u) => u.email === syntheticEmail)
      if (!found) return { status: 'error', message: 'Sign-in failed. Please try again.' }
      await admin.auth.admin.updateUserById(found.id, { password })
    }
  }

  const supabase = createClient()
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: loginEmail,
    password,
  })

  if (signInErr) {
    console.error('[offer-otp] signInWithPassword failed:', signInErr.message)
    return { status: 'error', message: 'Sign-in failed. Please try again.' }
  }

  // ── Link the account to the creator profile ────────────────────────────────
  // This used to happen inside acceptOffer, which no longer runs here: the
  // creator now lands on their deal page and accepts, declines or counters
  // there. The identity work still has to happen, and this is the only moment
  // it can — possession of the number has just been proven.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Sign-in failed. Please try again.' }

  const { data: existing } = await admin
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()

  let userId = existing?.id
  if (!userId) {
    const { data: created, error } = await admin
      .from('users')
      .insert({ auth_id: user.id, phone, role: 'creator' })
      .select('id')
      .single()
    if (error || !created) {
      console.error('[offer-otp] users row failed:', error?.message)
      return { status: 'error', message: 'Sign-in failed. Please try again.' }
    }
    userId = created.id
  }

  // Claim the stub, guarded so a race cannot take one already claimed.
  if (!creator.user_id) {
    await admin
      .from('creators')
      .update({ user_id: userId })
      .eq('id', creator.id)
      .is('user_id', null)
  } else if (creator.user_id !== userId) {
    // Belongs to a different account. Cannot happen through this door, since
    // the code went to this creator's own number, but refusing beats guessing.
    return { status: 'error', message: 'This offer belongs to a different account.' }
  }

  return { status: 'ok', dealId: creator.dealId }
}
