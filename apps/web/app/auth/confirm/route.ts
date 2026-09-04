import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { safeNext } from '@/lib/safe-next'
import { RECOVERY_COOKIE, RECOVERY_COOKIE_MAX_AGE } from '@/lib/recovery-cookie'
import { ensureBrandUserRow } from '@/lib/ensure-brand-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateWorkEmail } from '@/lib/work-email'
import { opsRoutingEmails } from '@/lib/ops-capabilities'

/**
 * Email-link confirmation handler (token_hash flow).
 *
 * Handles PASSWORD RECOVERY and SIGNUP CONFIRMATION. Distinct from
 * /auth/callback on purpose:
 *
 *   /auth/callback  — PKCE `code` + exchangeCodeForSession. Requires the
 *                     code_verifier cookie set in the browser that STARTED
 *                     the flow, so it only works same-device. Correct for
 *                     OAuth (the user is mid-flow in one browser).
 *   /auth/confirm   — `token_hash` + verifyOtp. Carries no browser-bound
 *                     verifier, so it works when the link is requested on a
 *                     laptop and opened on a phone.
 *
 * Signup confirmation moved here after it was reproduced failing on staging:
 * the email was confirmed by GoTrue upstream, then exchangeCodeForSession
 * failed for want of the verifier cookie, leaving an account that was
 * confirmed but had never been signed in and had no `users` row. The user saw
 * a bare login error and no indication their password already worked. Reading
 * email on a different device from the one you signed up on is ordinary
 * behaviour, not an edge case.
 *
 * OAuth still goes through /auth/callback and MUST keep doing so — Google
 * hands back a PKCE code and there is no token_hash to verify.
 *
 * ── Requires TWO Supabase dashboard settings ────────────────────────────────
 *   1. /auth/confirm on the redirect allowlist.
 *   2. Both the "Reset Password" AND "Confirm signup" email templates sending
 *      {{ .TokenHash }} rather than {{ .ConfirmationURL }}.
 *
 * Until (2) is done for signup, links still arrive here carrying `?code=`
 * instead of a token_hash. That is handled below by falling back to the PKCE
 * exchange, so deploying this ahead of the template change is safe and simply
 * preserves the old same-device-only behaviour rather than breaking signup.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const code = searchParams.get('code')
  // No `type` arrives on the legacy ConfirmationURL form, which only ever
  // means signup here — recovery links are already on token_hash.
  const type = searchParams.get('type') ?? (code ? 'signup' : null)

  // Only these two. Anything else is refused so this route can never become a
  // general-purpose way to mint a session from an arbitrary email link.
  if (type !== 'recovery' && type !== 'signup') {
    return NextResponse.redirect(`${origin}/login/brand?error=unsupported_link_type`)
  }

  const isRecovery = type === 'recovery'
  const failureTarget = isRecovery ? '/reset-password' : '/login/brand'
  const next = safeNext(searchParams.get('next'), isRecovery ? '/reset-password' : '/onboarding')

  if (!tokenHash && !code) {
    return NextResponse.redirect(`${origin}${failureTarget}?error=invalid_link`)
  }

  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  // token_hash is preferred and is the whole point of this route. The `code`
  // branch exists only for signup links still rendered from the old template.
  if (tokenHash) {
    // Consumes the token: single-use and expiry are enforced by Supabase.
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (error) {
      console.error(`[auth/confirm] verifyOtp failed (${type}):`, error.message)
      return NextResponse.redirect(`${origin}${failureTarget}?error=invalid_link`)
    }

    // No error is NOT the same as a session. verifyOtp only stores one when the
    // response carries an access_token, so a shape it doesn't recognise returns
    // {session: null, error: null} and would sail past the check above. Both
    // destinations require a live session, so without this the user is sent to
    // a page that silently bounces them and neither of us learns why.
    //
    // Tokens minted under PKCE arrive prefixed `pkce_`, and those are the ones
    // most likely to come back this way, since the exchange they expect is not
    // the one verifyOtp performs. Logged with the prefix so the cause is
    // visible in the server log rather than inferred.
    if (!data.session) {
      console.error(
        `[auth/confirm] verifyOtp returned no session (type=${type}, ` +
        `token_prefix=${tokenHash.slice(0, 5)})`,
      )
      return NextResponse.redirect(`${origin}${failureTarget}?error=link_not_usable`)
    }
  } else {
    if (isRecovery) {
      // A recovery link should never reach us as a bare code. Refuse rather
      // than silently signing someone in without the recovery marker below.
      return NextResponse.redirect(`${origin}/reset-password?error=invalid_link`)
    }
    const { error } = await supabase.auth.exchangeCodeForSession(code!)
    if (error) {
      console.error('[auth/confirm] exchangeCodeForSession failed:', error.message)
      return NextResponse.redirect(`${origin}/login/brand?error=exchange_failed`)
    }
  }

  if (isRecovery) {
    const response = NextResponse.redirect(`${origin}${next}`)

    // Mark this session as arriving from a genuine recovery link.
    // /reset-password requires it, so an ordinary logged-in session cannot be
    // used to change the password without knowing the current one
    // (shared-computer lockout risk).
    response.cookies.set(RECOVERY_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: RECOVERY_COOKIE_MAX_AGE,
    })

    return response
  }

  // ── Signup: establish the brand user row, same as /auth/callback ───────────
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // The work-email rule is enforced in the signUp server action, but the
    // anon key lets anyone call supabase.auth.signUp directly and skip it.
    // Re-checked here, where the account first becomes usable. Mirrors the
    // identical guard in /auth/callback.
    //
    // Only NEW accounts are checked. Existing brand accounts on free providers
    // must keep working. Admin client because RLS does not let a fresh session
    // read other users rows.
    const admin = createAdminClient()
    const { data: byAuthId } = await admin
      .from('users').select('id').eq('auth_id', user.id).maybeSingle()
    const { data: byEmail } = user.email
      ? await admin.from('users').select('id').eq('email', user.email).maybeSingle()
      : { data: null }

    if (!byAuthId && !byEmail) {
      const check = validateWorkEmail(user.email ?? '', opsRoutingEmails())
      if (!check.ok) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/signup/brand?error=work_email_required`)
      }
    }

    await ensureBrandUserRow(supabase, user.id, user.email)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
