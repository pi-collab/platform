import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { verifyCreator } from '@/lib/creator-auth'
import { authorizeUrl } from '@/lib/instagram'
import { instagramRedirectUri, isReturnTarget } from '@/lib/instagram-config'

/**
 * Start the Instagram connection.
 *
 * A DATA connection, not a sign-in. The creator is already authenticated by
 * phone OTP; verifyCreator runs first so an unauthenticated request cannot even
 * begin a flow that would later attach a token to somebody.
 *
 * The `state` nonce is stored in an httpOnly cookie and compared on the way
 * back. Without it, an attacker can hand a creator a crafted callback URL
 * carrying their OWN authorisation code and have the creator's account bound to
 * the attacker's Instagram — a login CSRF that silently mislabels whose
 * audience the storefront is showing.
 */
export async function GET(request: NextRequest) {
  await verifyCreator()

  const state = randomBytes(24).toString('base64url')

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,   // must survive the top-level redirect back from Instagram
    path: '/api/instagram',
    maxAge: 10 * 60,            // the code is valid an hour; the flow is not
  }

  cookies().set('ig_oauth_state', state, cookieOptions)

  // Which screen started this, so the creator is put back where they were
  // rather than always on settings. Carried in a cookie rather than round
  // tripped through Instagram, because `state` has to come back byte-identical
  // and anything appended to it would break the comparison.
  //
  // Validated on the way IN as well as on the way out: an unrecognised value is
  // never stored, so the callback cannot be handed one it then has to trust.
  const requested = request.nextUrl.searchParams.get('return')
  cookies().set('ig_return', isReturnTarget(requested) ? requested : 'settings', cookieOptions)

  return NextResponse.redirect(authorizeUrl(instagramRedirectUri(), state))
}
