'use server'

import crypto from 'crypto'
import { sendWelcomeEmail } from '@/lib/welcome-email'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'
import { isSmsConfigured, sendOtpSms } from '@/lib/sms'
import { maskPhone } from '@/lib/whatsapp'

// ── Types ──────────────────────────────────────────────────────────

type OTPResult =
  | { status: 'sent' }
  | { status: 'error'; message: string }

type VerifyResult =
  | { status: 'ok'; redirect: string }
  | { status: 'multi_stub'; message: string }
  | { status: 'error'; message: string }

// ── Staging bypass helper ────────────────────────────────────────────
// STAGING ONLY — OTP bypass for demo/testing when no SMS provider is configured.
// Never set STAGING_OTP_BYPASS on production. Remove before public launch.
function isStagingEnv(): boolean {
  return (
    process.env.STAGING_OTP_BYPASS === 'true' &&
    process.env.VERCEL_ENV !== 'production'
  )
}

// ── Send OTP ───────────────────────────────────────────────────────

export async function sendOTP(rawPhone: string): Promise<OTPResult> {
  const phone = normalizePhone(rawPhone)
  if (!phone) return { status: 'error', message: 'Enter a valid 10-digit Indian mobile number, starting 6, 7, 8 or 9.' }

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

  const { data: inserted, error } = await admin
    .from('phone_verifications')
    .insert({
      phone,
      code,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
    })
    .select('id')
    .single()

  if (error) {
    // On staging with bypass enabled, let user proceed to code entry even if insert fails
    if (isStagingEnv()) return { status: 'sent' }
    return { status: 'error', message: 'Failed to send code. Please try again.' }
  }

  // ── Delivery ────────────────────────────────────────────────────────────
  //
  // The code is already generated, stored and rate-limited above; all that
  // happens here is getting it to the phone. Generation and verification stay
  // ours — MSG91 only carries the digits.
  //
  // Ordered so delivery comes AFTER the insert: a code that was texted but not
  // stored would be a code that cannot be verified, which is worse than one
  // stored but not sent.
  const result = await deliver(phone, code)

  // Give the rate-limit slot back when nothing was delivered.
  //
  // The limit counts unused, unexpired codes, so an undelivered one holds a
  // slot for ten minutes. Three failed sends and the person is told "too many
  // codes sent" having received none — and fixing SMS does not release them,
  // they simply wait it out. That is the exact shape of the next few days:
  // sends can fail until the DLT PE-TM chain is fully Active, and the people
  // hitting it would be locked out of a working login.
  //
  // Marked used rather than deleted so the attempt still shows in the table;
  // it is only made unusable, which is already true of a code nobody received.
  if (result.status === 'error' && inserted?.id) {
    await admin.from('phone_verifications').update({ used: true }).eq('id', inserted.id)
  }

  return result
}

/**
 * Get the code to the phone, and decide what the caller is told.
 *
 * DELIVERY AND THE STAGING BYPASS ARE INDEPENDENT. The bypass is a
 * *verification* affordance — it makes 000000/123456 acceptable at the verify
 * step — and it deliberately does NOT suppress the send. It used to: staging
 * short-circuited here and no SMS went out, which meant staging could never
 * test the thing it exists to test. Now the real code is sent whenever SMS is
 * configured, and the bypass codes keep working alongside it, so the delivery
 * path can be exercised on staging without giving up the shortcut.
 *
 * The trade is real and deliberate: every OTP request on a staging deployment
 * with SMS enabled now costs a DLT-metered message. Unset MSG91_SMS_ENABLED
 * there to stop sending; the bypass is unaffected either way.
 *
 * Three modes, in priority order:
 *
 *   1. SMS configured     → really send, in every environment. A definitive
 *      failure is reported to the caller rather than swallowed: for a
 *      notification, never-block is right, but here the SMS IS the flow.
 *      Saying "code sent" when it wasn't leaves someone watching an empty
 *      inbox with no way forward.
 *
 *   2. Not configured, on production → loud failure. An unconfigured switch
 *      there means no creator can log in, and silently logging codes nobody
 *      reads would hide that behind a "code sent" screen.
 *
 *   3. Not configured, anywhere else → log the code and report success. This
 *      is what makes the feature deployable dark, and what keeps local dev
 *      working with no MSG91 account at all.
 *
 * Never throws — sendOtpSms upholds that, and nothing here adds a throw path.
 */
async function deliver(phone: string, code: string): Promise<OTPResult> {
  // The code is a credential. It is only ever logged where no real message is
  // going out and the environment is not production, and never with the full
  // number attached.
  const logCode = () =>
    console.log(`[OTP] no SMS sent — code for ${maskPhone(phone)}: ${code}`)

  if (!isSmsConfigured()) {
    if (process.env.VERCEL_ENV === 'production') {
      console.error(
        '[OTP] SMS is not configured on production — no code can reach anyone. ' +
        'Set MSG91_SMS_ENABLED/MSG91_SMS_TEMPLATE_ID/MSG91_SMS_VAR_NAME.'
      )
      return { status: 'error', message: 'We could not send the code just now. Please try again shortly.' }
    }
    logCode()
    return { status: 'sent' }
  }

  const sent = await sendOtpSms({ toPhone: phone, code })
  if (!sent.ok) {
    // Already logged and recorded to `events` by the sender; this only decides
    // what the person staring at the form is told.
    //
    // On staging the bypass codes still work, so a delivery failure must not
    // strand the tester on the phone step — that would make a broken MSG91
    // config also break the shortcut that exists to work around it. Let them
    // through to code entry; the failure is in the logs and in `events`.
    if (isStagingEnv()) {
      console.warn('[OTP] send failed on staging — continuing, bypass codes still accepted')
      return { status: 'sent' }
    }
    return { status: 'error', message: 'We could not send the code just now. Please try again shortly.' }
  }

  return { status: 'sent' }
}

// ── Verify OTP + Stub-Match + Session ──────────────────────────────

export async function verifyAndMatch(rawPhone: string, inputCode: string): Promise<VerifyResult> {
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
    isStagingEnv()

  // The OTP check and the stub lookup are independent — the second needs only
  // the phone number — so they go out together rather than one after the other.
  // Each round-trip here costs the full distance between the function and the
  // database, and this action makes a lot of them.
  //
  // Reading stubs before the code is verified leaks nothing: the result is only
  // ever used AFTER the check below returns successfully, and a wrong code
  // still returns the same message it always did.
  const [verifyResult, stubResult] = await Promise.all([
    isStagingBypass
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
    admin.from('creators').select('id, user_id, full_name, is_vetted').eq('phone', phone),
  ])

  let markUsed: PromiseLike<unknown> | null = null

  if (!isStagingBypass) {
    const verification = verifyResult.data
    if (!verification) {
      return { status: 'error', message: 'Invalid or expired code. Try again.' }
    }

    // Mark as used, to prevent replay. Started here but awaited at the end: it
    // must not happen for a code that failed, which is why it stays after the
    // check — but nothing below reads it, so blocking the rest of signup on
    // the round trip only adds latency to every successful verification.
    markUsed = admin
      .from('phone_verifications')
      .update({ used: true })
      .eq('id', verification.id)
  }

  // ── 2. Stub-match ──

  const { data: stubs } = stubResult as {
    data: { id: string; user_id: string | null; is_vetted: boolean; full_name: string | null }[] | null
  }

  const matchedStubs = stubs ?? []
  const unclaimed = matchedStubs.filter((s) => !s.user_id)

  // Case 2c: the number already has a claimed account.
  //
  // This used to bounce to /login/creator?error=account_exists — asking
  // someone who had JUST proved possession of the number to type it again and
  // wait for a second code. With OTP there is no difference between signing up
  // and signing in; the code is the whole proof. It falls through and signs
  // them in below instead.
  const alreadyClaimed = matchedStubs.length > 0 && unclaimed.length === 0

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
    // Auth user already exists — a previous attempt with this number got as far
    // as creating one. Find it and reset the password so we can sign in below.
    //
    // Looked up BOTH ways on purpose. normalizePhone produces E.164 with a
    // leading plus (+917384928410), but GoTrue stores auth.users.phone without
    // it (917384928410). Querying only the plus form matches nothing, this
    // branch returns "Failed to create account", and the number is then stuck
    // for good: every retry hits the same dead end, because the auth user the
    // lookup cannot find is the very thing stopping createUser from succeeding.
    const withoutPlus = phone.replace(/^\+/, '')
    let existingAuthId: string | null = null
    for (const form of [withoutPlus, phone]) {
      const { data } = await admin.rpc('get_auth_id_by_phone', { p_phone: form })
      if (data) { existingAuthId = data as string; break }
    }

    if (!existingAuthId) {
      console.error(
        '[SIGNUP] createUser failed and no existing auth user found.',
        'phone:', phone, 'createUser error:', createAuthErr?.message,
      )
      return { status: 'error', message: 'Failed to create account. Please try again. (E1)' }
    }

    authId = existingAuthId

    // Update password so we can sign in below
    const { error: updateErr } = await admin.auth.admin.updateUserById(authId, { password })
    if (updateErr) {
      console.error('[SIGNUP] Failed to update auth user password:', updateErr.message)
      return { status: 'error', message: 'Failed to create account. Please try again. (E2)' }
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
      console.error('[SIGNUP] users insert failed:', profileErr?.message)
      return { status: 'error', message: 'Failed to create profile. Please try again. (E3)' }
    }
    userId = newProfile.id
  }

  // ── 5. Claim stub or create new creator ──

  let redirect: string

  if (alreadyClaimed) {
    // Nothing to create or claim. The dashboard is the right destination
    // whatever their state: the creator layout sends an unvetted creator to
    // the review screen and shows a rejected one their own screen.
    redirect = '/creator/dashboard'
  } else if (unclaimed.length === 1) {
    // Case 2b: claim the unclaimed stub
    const stub = unclaimed[0]

    const { error: claimErr } = await admin
      .from('creators')
      .update({ user_id: userId })
      .eq('id', stub.id)
      .is('user_id', null) // guard: only if still unclaimed (race protection)

    if (claimErr) {
      console.error('[SIGNUP] stub claim failed:', claimErr.message)
      return { status: 'error', message: 'Failed to link your account. Please try again. (E4)' }
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
      // The trigger derives is_vetted/is_rejected from this; writing them
      // directly is what the status column exists to stop.
      vetting_status: 'pending',
    })

    if (createErr) {
      console.error('[SIGNUP] creators insert failed:', createErr.message)
      return { status: 'error', message: 'Failed to create creator profile. Please try again. (E5)' }
    }

    redirect = '/signup/creator/onboarding'
  }

  // ── Write terms acceptance on the users row ──
  await admin.from('users').update({
    terms_accepted_at: new Date().toISOString(),
    terms_version: '2026-07-23',
  }).eq('id', userId)

  // Welcome them in. Creators sign up by phone, so there is usually no address
  // yet — sendWelcomeEmail returns quietly when there is none, and its
  // once-only guard means a later completion can still send it once there is.
  // Never awaited for a result it acts on: the account exists, and a failed
  // email must not fail signup.
  // No getUserById here. It spent a round trip reading an address we already
  // know: the synthetic one this action generates, creator_<phone>@
  // auth.guapd.internal — not a real domain, and unable to receive mail.
  // sendWelcomeEmail returns quietly without an address, and its once-only
  // guard means it still sends later, once onboarding supplies a real one.
  void sendWelcomeEmail({ userId, audience: 'creator' })

  // ── 6. Establish browser session ──
  // Sign in via the server-side Supabase client (writes session cookies).
  // This is a server action, so cookies().set() works.

  const supabase = createClient()
  const [{ error: signInErr }] = await Promise.all([
    supabase.auth.signInWithPassword({ email: syntheticEmail, password }),
    markUsed ?? Promise.resolve(),
  ])

  if (signInErr) {
    console.error('[SIGNUP] signInWithPassword failed:', signInErr.message)
    // Account was created but session failed — send to login as fallback
    return { status: 'ok', redirect: '/login/creator' }
  }

  return { status: 'ok', redirect }
}
