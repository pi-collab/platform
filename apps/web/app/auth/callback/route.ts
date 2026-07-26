import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { ensureBrandUserRow } from '@/lib/ensure-brand-user'

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
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
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
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`)
  }

  // Get the authenticated user
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Ensure users row exists — shared with email+password login path
    await ensureBrandUserRow(supabase, user.id, user.email)
  }

  // Support `next` param for post-login redirects (e.g. invite accept flow).
  // Validate: must start with `/` to prevent open-redirect attacks.
  const next = searchParams.get('next')
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null

  // Founders go straight to /ops — skip brand onboarding entirely
  // (unless they have an explicit next param, e.g. accepting an invite)
  if (!safeNext && user?.email) {
    const allowedRaw = process.env.OPS_ALLOWED_EMAILS
    if (allowedRaw) {
      const allowed = new Set(allowedRaw.split(',').map(e => e.trim().toLowerCase()))
      if (allowed.has(user.email.toLowerCase())) {
        return NextResponse.redirect(`${origin}/ops`)
      }
    }
  }

  return NextResponse.redirect(`${origin}${safeNext || '/deals'}`)
}
