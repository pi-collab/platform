import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { safeNext } from '@/lib/safe-next'

/**
 * Creator OAuth callback.
 *
 * Two entry points land here:
 * 1. OFFER FLOW: /offer/[token] triggers sign-in with next=/offer/[token].
 *    The offer page handles its own auth state — we just redirect back.
 * 2. RETURNING CREATOR: /login/creator triggers sign-in with next=/creator/deals.
 *    We verify the user has a claimed creator profile before redirecting.
 *
 * This callback NEVER creates users or brand_member rows — that's the
 * brand callback's job (/auth/callback). Creator users rows are created
 * by the offer accept/decline action (which also handles stub claiming).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  // `next` is attacker-reachable (it rides in the OAuth redirect URL), so it
  // is validated as a same-origin path before being concatenated onto origin.
  const next = safeNext(searchParams.get('next'), '/creator/deals')

  if (error) {
    return NextResponse.redirect(`${origin}/login/creator?error=${encodeURIComponent(error)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login/creator?error=no_code`)
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
    return NextResponse.redirect(`${origin}/login/creator?error=exchange_failed`)
  }

  // Offer flow: redirect straight to the offer page (it handles its own auth)
  if (next.startsWith('/offer/')) {
    return NextResponse.redirect(`${origin}${next}`)
  }

  // Returning creator: verify they have a claimed creator profile
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login/creator?error=no_session`)
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (!profile) {
    return NextResponse.redirect(`${origin}/login/creator?error=no_account`)
  }

  const { data: creator } = await supabase
    .from('creators')
    .select('id')
    .eq('user_id', profile.id)
    .maybeSingle()

  if (!creator) {
    return NextResponse.redirect(`${origin}/login/creator?error=no_account`)
  }

  // Verified creator — send to /creator/deals (or whatever next was)
  return NextResponse.redirect(`${origin}${next}`)
}
