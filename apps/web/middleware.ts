import { createServerClient } from '@supabase/ssr'
import { ORIGIN_COOKIE, ORIGIN_COOKIE_MAX_AGE } from '@/lib/attribution'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware: Basic Auth gate (opt-in) + Supabase session refresh.
 *
 * 1. If STAGING_BASIC_AUTH_USER and STAGING_BASIC_AUTH_PASSWORD are set,
 *    every request must pass HTTP Basic Auth before anything else runs.
 * 2. Once past the gate (or if the vars are unset), the existing Supabase
 *    session-refresh logic runs unchanged.
 */
export async function middleware(request: NextRequest) {
  // ── 1. Basic Auth gate (opt-in) ──────────────────────────────────
  const authUser = process.env.STAGING_BASIC_AUTH_USER
  const authPass = process.env.STAGING_BASIC_AUTH_PASSWORD

  if (authUser && authPass) {
    const authorization = request.headers.get('authorization')
    if (authorization) {
      const [scheme, encoded] = authorization.split(' ')
      if (scheme === 'Basic' && encoded) {
        const decoded = atob(encoded)
        const [user, ...passParts] = decoded.split(':')
        const pass = passParts.join(':') // passwords may contain colons
        if (user === authUser && pass === authPass) {
          // credentials valid — fall through to session refresh
        } else {
          return basicAuthChallenge()
        }
      } else {
        return basicAuthChallenge()
      }
    } else {
      return basicAuthChallenge()
    }
  }

  // ── 2. Supabase session refresh (unchanged) ─────────────────────
  //
  // `x-pathname` is added to the REQUEST headers so server components can see
  // the path they are rendering (Next gives layouts no other way to know it).
  // The creator layout uses it to build a `next` on its login redirect, so a
  // creator tapping a deal link in WhatsApp — where the in-app browser has its
  // own cookie jar, so logged-out is the norm — returns to that deal after
  // signing in. Read via `headers().get('x-pathname')`.
  const withPathname = () => {
    const headers = new Headers(request.headers)
    headers.set('x-pathname', request.nextUrl.pathname + request.nextUrl.search)
    return headers
  }

  let supabaseResponse = NextResponse.next({ request: { headers: withPathname() } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Must set on both request AND response for the refresh to persist
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Re-derive headers AFTER the cookie writes so both the refreshed
          // auth cookies and x-pathname survive onto the new response.
          supabaseResponse = NextResponse.next({ request: { headers: withPathname() } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // This call is what actually refreshes the token.
  // Do NOT remove it or short-circuit before it runs.
  await supabase.auth.getUser()

  // ── Storefront attribution (FUNCTIONAL cookie, not analytics) ──────────────
  // Records which creator's storefront a visitor arrived through, so a brand
  // that later signs up is attributed to them. Set here because a Server
  // Component cannot write cookies and this has to happen on a plain page view.
  //
  // FIRST-TOUCH: written only when absent. The creator who introduced the brand
  // keeps the attribution; a later storefront view cannot displace it.
  //
  // NOT gated on analytics consent — see lib/attribution.ts. It carries a
  // public slug, no identifiers, and a brand declining analytics must not
  // silently strip their referring creator of credit.
  const slugMatch = request.nextUrl.pathname.match(/^\/c\/([a-z0-9][a-z0-9-]{1,28}[a-z0-9])$/i)
  if (slugMatch && !request.cookies.get(ORIGIN_COOKIE)) {
    supabaseResponse.cookies.set(ORIGIN_COOKIE, slugMatch[1].toLowerCase(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ORIGIN_COOKIE_MAX_AGE,
    })
  }

  return supabaseResponse
}

function basicAuthChallenge() {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Staging"' },
  })
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
