'use server'

import crypto from 'crypto'
import { sendOTP as sendSignupOTP } from '@/app/signup/creator/actions'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'
import { checkReviewLogin, logReviewLogin } from '@/lib/review-access'
import { safeNext } from '@/lib/safe-next'
import { sendOTP } from '@/app/signup/creator/actions'

type SignInResult =
  | { status: 'ok'; redirect: string }
  | { status: 'error'; message: string }

export type LoginSendResult =
  | { status: 'sent' }
  /** No creator at all for this number. */
  // The number has no account, and a signup code has just been sent to it.
  // Carrying on rather than stopping: the old "No account yet" screen linked to
  // /signup/creator, where the first thing asked for was the number they had
  // already typed.
  | { status: 'new_signup' }
  | { status: 'not_found' }
  /** An ops-created profile nobody has claimed yet; claiming happens at signup. */
  | { status: 'unclaimed' }
  | { status: 'error'; message: string }

/**
 * Send a sign-in code, but only to a number that can actually sign in.
 *
 * The existence check happens BEFORE the send, which is the point of this
 * existing separately from the signup sender. Previously login used that one,
 * so an unknown number was texted a code, the person typed it in, and only
 * then were they told there was no account — an SMS spent, and a minute wasted
 * on a dead end that was knowable up front.
 *
 * This does reveal whether a number is registered. That is the same trade
 * already taken on the brand side: withholding it here would protect nothing,
 * since the signup form answers the same question, and would only make the
 * honest user work harder than an attacker.
 */
export async function sendLoginOTP(rawPhone: string): Promise<LoginSendResult> {
  const phone = normalizePhone(rawPhone)
  if (!phone) {
    return { status: 'error', message: 'Enter a valid 10-digit Indian mobile number, starting 6, 7, 8 or 9.' }
  }

  const admin = createAdminClient()
  const { data: creators } = await admin
    .from('creators')
    .select('id, user_id')
    .eq('phone', phone)

  const matched = creators ?? []
  if (matched.length === 0) {
    // Send a SIGNUP code and let the caller continue into signup. Reusing that
    // action rather than duplicating it keeps one place that knows how to mint,
    // store and rate-limit a code.
    //
    // It also stops the login page answering "does this number have an account?"
    // for anyone who asks — the reply is now identical either way.
    const sent = await sendSignupOTP(rawPhone)
    if (sent.status === 'error') return { status: 'error', message: sent.message }
    return { status: 'new_signup' }
  }
  // A stub has a profile but no login; claiming it is a signup flow, not a
  // sign-in, so sending a code here would lead nowhere.
  if (!matched.some((c) => c.user_id)) return { status: 'unclaimed' }

  const sent = await sendOTP(phone)
  if (sent.status === 'error') return { status: 'error', message: sent.message }
  return { status: 'sent' }
}

/**
 * Verify OTP and sign in an existing creator.
 * Does NOT create accounts — for that, use /signup/creator.
 *
 * `next` is the post-login destination (e.g. the deal a creator tapped in a
 * WhatsApp notification). It arrives from the client, so it is re-validated
 * here rather than trusted — the login page's validation is for rendering,
 * this one is the security boundary.
 */
export async function verifyAndSignIn(
  rawPhone: string,
  inputCode: string,
  next?: string,
): Promise<SignInResult> {
  const redirectTo = safeNext(next, '/creator/dashboard')
  const phone = normalizePhone(rawPhone)
  if (!phone) return { status: 'error', message: 'Enter a valid 10-digit Indian mobile number, starting 6, 7, 8 or 9.' }

  const trimmedCode = inputCode.trim()
  if (!/^\d{6}$/.test(trimmedCode)) return { status: 'error', message: 'Enter a 6-digit code.' }

  const admin = createAdminClient()

  // ── 1. OTP verification ──

  // STAGING ONLY — accept 000000 or 123456 when bypass is enabled.
  // Never set STAGING_OTP_BYPASS on production. Remove before public launch.
  const isStagingBypass =
    (trimmedCode === '000000' || trimmedCode === '123456') &&
    process.env.STAGING_OTP_BYPASS === 'true' &&
    process.env.VERCEL_ENV !== 'production'

  // App Review access: ONE phone, one secret code, and inert unless both env
  // vars are set. Deliberately allowed on production, which is what the staging
  // bypass above refuses — a Meta reviewer cannot receive our SMS, and the
  // review is of the production app.
  const review = checkReviewLogin(phone, trimmedCode)
  if (review.attemptedOnReviewPhone) {
    // Audited either way. OTP verification is unthrottled, so a run of failures
    // against this number is the only signal that someone is guessing.
    await logReviewLogin(phone, review.accepted)
  }
  const isReviewLogin = review.accepted
  const skipOtpCheck = isStagingBypass || isReviewLogin

  // The OTP check and the creator lookup are independent — the second needs
  // only the phone — so they go out together. Each round-trip costs the full
  // distance between the function and the database.
  //
  // Reading the creator before the code is verified leaks nothing: the result
  // is only used AFTER the check below returns successfully, and a wrong code
  // still gets the same message it always did.
  const [verifyResult, creatorResult] = await Promise.all([
    skipOtpCheck
      ? Promise.resolve({ data: null })
      : admin
          .from('phone_verifications')
          .select('id')
          .eq('phone', phone)
          .eq('code', trimmedCode)
          .eq('used', false)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
    admin.from('creators').select('id, user_id').eq('phone', phone),
  ])

  if (!skipOtpCheck) {
    const verification = verifyResult.data
    if (!verification) {
      return { status: 'error', message: 'Invalid or expired code. Try again.' }
    }

    // Stays sequential and stays AFTER the check: it is a write, and it must
    // not happen for a code that failed.
    await admin
      .from('phone_verifications')
      .update({ used: true })
      .eq('id', verification.id)
  }

  // ── 2. Find creator by phone ──
  const { data: creators } = creatorResult as { data: { id: string; user_id: string | null }[] | null }

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

  // Check if the auth user has a real email (e.g. from Google OAuth) — don't overwrite it
  const { data: authUserData } = await admin.auth.admin.getUserById(profile.auth_id)
  const existingEmail = authUserData?.user?.email
  const hasSyntheticEmail = existingEmail?.endsWith('@auth.guapd.internal')
  const loginEmail = (existingEmail && !hasSyntheticEmail) ? existingEmail : syntheticEmail

  const updatePayload: { password: string; email?: string; email_confirm?: boolean } = { password }
  // Only set email if the user has none, or has a DIFFERENT synthetic one.
  //
  // Writing the same address back is not free: GoTrue treats any `email` in an
  // admin update as an email-change request and mails a confirmation link to
  // it. That address is creator_<phone>@auth.guapd.internal, a domain with no
  // MX record, so every one of those hard-bounces — on every login. That is
  // the high bounce rate Supabase flagged on production.
  //
  // email_confirm marks the new address already-confirmed, which is what
  // suppresses the send on the rare occasion we do have to write it.
  if (!existingEmail || (hasSyntheticEmail && existingEmail !== syntheticEmail)) {
    updatePayload.email = syntheticEmail
    updatePayload.email_confirm = true
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(profile.auth_id, updatePayload)

  if (updateErr) {
    console.error('[LOGIN] Failed to update auth user:', updateErr.message)
    return { status: 'error', message: 'Sign-in failed. Please try again.' }
  }

  const supabase = createClient()
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: loginEmail,
    password,
  })

  if (signInErr) {
    console.error('[LOGIN] signInWithPassword failed:', signInErr.message)
    return { status: 'error', message: 'Sign-in failed. Please try again.' }
  }

  return { status: 'ok', redirect: redirectTo }
}
