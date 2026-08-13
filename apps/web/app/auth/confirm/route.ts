import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { safeNext } from '@/lib/safe-next'
import { RECOVERY_COOKIE, RECOVERY_COOKIE_MAX_AGE } from '@/lib/recovery-cookie'

/**
 * Email-link confirmation handler (token_hash flow).
 *
 * Used by PASSWORD RECOVERY. Distinct from /auth/callback on purpose:
 *
 *   /auth/callback  — PKCE `code` + exchangeCodeForSession. Requires the
 *                     code_verifier cookie set in the browser that STARTED
 *                     the flow, so it only works same-device. Correct for
 *                     OAuth (the user is mid-flow in one browser).
 *   /auth/confirm   — `token_hash` + verifyOtp. Carries no browser-bound
 *                     verifier, so it works when the reset is requested on a
 *                     laptop and the email opened on a phone — the common
 *                     case for password reset, not an edge case.
 *
 * DO NOT reroute OAuth or signup confirmation through here without testing;
 * /auth/callback is load-bearing for Google login and the creator offer flow.
 *
 * Requires the Supabase "Reset Password" email template to send
 * {{ .TokenHash }} rather than {{ .ConfirmationURL }}.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = safeNext(searchParams.get('next'), '/reset-password')

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/reset-password?error=invalid_link`)
  }

  // Only recovery is handled here. Anything else keeps using /auth/callback,
  // so this route can never become an alternative way to establish a session.
  if (type !== 'recovery') {
    return NextResponse.redirect(`${origin}/login?error=unsupported_link_type`)
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

  // Consumes the token: single-use and expiry are enforced by Supabase.
  const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })

  if (error) {
    console.error('[auth/confirm] verifyOtp failed:', error.message)
    return NextResponse.redirect(`${origin}/reset-password?error=invalid_link`)
  }

  const response = NextResponse.redirect(`${origin}${next}`)

  // Mark this session as arriving from a genuine recovery link. /reset-password
  // requires it, so an ordinary logged-in session cannot be used to change the
  // password without knowing the current one (shared-computer lockout risk).
  response.cookies.set(RECOVERY_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: RECOVERY_COOKIE_MAX_AGE,
  })

  return response
}
