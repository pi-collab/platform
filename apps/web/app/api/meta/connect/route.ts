import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { verifyBrand } from '@/lib/brand-auth'
import { metaAppConfigured, metaMarketplaceEnabled } from '@/lib/meta/config'
import { facebookAuthorizeUrl } from '@/lib/meta/graph'

/**
 * Start a brand's Facebook Login for Instagram Creator Marketplace. A data
 * connection for the brand, not a sign-in: the brand is already signed in.
 * `state` in an httpOnly cookie, compared on the way back (login CSRF).
 * ?s=<saved search id> returns the brand to that search afterwards.
 */
export async function GET(request: NextRequest) {
  if (!metaMarketplaceEnabled() || !metaAppConfigured()) return NextResponse.json({ ok: false, message: 'Not found.' }, { status: 404 })
  await verifyBrand()
  const state = randomBytes(24).toString('base64url')
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api/meta', maxAge: 10 * 60 }
  cookies().set('meta_oauth_state', state, opts)
  const s = request.nextUrl.searchParams.get('s')
  cookies().set('meta_return', s && /^[0-9a-f-]{36}$/i.test(s) ? s : '', opts)
  return NextResponse.redirect(facebookAuthorizeUrl(state))
}
