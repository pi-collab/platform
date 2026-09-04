import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { ensureBrandUserRow } from '@/lib/ensure-brand-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateWorkEmail } from '@/lib/work-email'
import { opsRoutingEmails, isOpsRoutingEmail } from '@/lib/ops-capabilities'

/**
 * OAuth callback handler.
 * Supabase redirects here after Google login with a one-time `code`.
 * We exchange it for a session, then create or fetch the user's row in
 * our `users` table.
 *
 * BRAND LOGIN PATH ONLY — role is hardcoded to 'brand_member'.
 * When creator auth is built, use a separate callback route (e.g.
 * /auth/creator/callback) or pass an intended role via the OAuth `state`
 * param — never route creators through here or they will be labelled
 * brand_member in the users table.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${origin}/login/brand?error=${encodeURIComponent(error)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login/brand?error=no_code`)
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

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    console.error('[auth/callback] exchangeCodeForSession failed:', exchangeError.message)
    return NextResponse.redirect(`${origin}/login/brand?error=exchange_failed`)
  }

  // Get the authenticated user
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Google is a SIGNUP path too, so the work-email rule has to be enforced
    // here as well — otherwise "Continue with Google" is an open door for the
    // exact free-inbox signups the rule exists to stop.
    //
    // Only NEW accounts are checked. Every existing brand account is on a free
    // provider and must keep signing in. Admin client because RLS does not let
    // a fresh session read other users rows.
    const admin = createAdminClient()
    const { data: byAuthId } = await admin
      .from('users').select('id').eq('auth_id', user.id).maybeSingle()
    const { data: byEmail } = user.email
      ? await admin.from('users').select('id').eq('email', user.email).maybeSingle()
      : { data: null }

    if (!byAuthId && !byEmail) {
      const check = validateWorkEmail(user.email ?? '', opsRoutingEmails())
      if (!check.ok) {
        // Undo the sign-in: no users row was created, so nothing to clean up
        // beyond the session itself.
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/signup/brand?error=work_email_required`)
      }
    }

    // Ensure users row exists — shared with email+password login path
    await ensureBrandUserRow(supabase, user.id, user.email)
  }

  // Support `next` param for post-login redirects (e.g. invite accept flow).
  // Validate: must start with `/` to prevent open-redirect attacks.
  const next = searchParams.get('next')
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null

  // Ops people go straight to /ops — skip brand onboarding entirely
  // (unless they have an explicit next param, e.g. accepting an invite).
  // Covers the scoped outreach role too: routing, not authorisation.
  if (!safeNext && user?.email && isOpsRoutingEmail(user.email)) {
    return NextResponse.redirect(`${origin}/ops`)
  }

  return NextResponse.redirect(`${origin}${safeNext || '/dashboard'}`)
}
