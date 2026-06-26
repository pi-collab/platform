import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Creator OAuth callback.
 *
 * Separate from /auth/callback (brand path) so creators get role='creator'
 * in the users table. Accepts a `next` query param to redirect back to
 * the offer page after auth.
 *
 * NOTE: The users row may also be created by the accept/decline server
 * action (via service-role) if the user didn't exist yet. This callback
 * only creates the row if the action hasn't already — the action is the
 * authoritative creator-row creator because it also handles the stub claim.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const next = searchParams.get('next') || '/'

  if (error) {
    return NextResponse.redirect(`${origin}${next}?auth_error=${encodeURIComponent(error)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}${next}?auth_error=no_code`)
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
    console.error('[auth/creator/callback] exchangeCodeForSession failed:', exchangeError.message)
    return NextResponse.redirect(`${origin}${next}?auth_error=exchange_failed`)
  }

  // Redirect back to the offer page — the accept/decline action will
  // handle creating the users row and claiming the stub.
  return NextResponse.redirect(`${origin}${next}`)
}
