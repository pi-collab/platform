import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorInvitesEnabled } from '@/lib/meta/config'
import { INVITE_COOKIE, INVITE_COOKIE_MAX_AGE, INVITE_TOKEN } from '@/lib/meta/invites'

/** POST { token }: the invite page was opened. Public (the creator has no
 *  account yet). Records the first open and remembers the invite in a cookie
 *  so it is still found after they sign up. */
export async function POST(request: NextRequest) {
  if (!creatorInvitesEnabled()) return NextResponse.json({ ok: false }, { status: 404 })
  const body = await request.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token : ''
  if (!INVITE_TOKEN.test(token)) return NextResponse.json({ ok: false }, { status: 400 })
  await createAdminClient().from('brand_creator_invites').update({ opened_at: new Date().toISOString() }).eq('token', token).is('opened_at', null)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(INVITE_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: INVITE_COOKIE_MAX_AGE })
  return res
}
