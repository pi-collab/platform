import { NextRequest, NextResponse } from 'next/server'
import { isRedirectError } from 'next/dist/client/components/redirect'
import { verifyCreator } from '@/lib/creator-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { creatorInvitesEnabled } from '@/lib/meta/config'
import { INVITE_TOKEN } from '@/lib/meta/invites'

/**
 * POST { token }: a signed-in creator accepts an invite. Only the creator the
 * invite was for: their connected Instagram username must be the invited one.
 * The brand's members are told in-app, to send an offer.
 */
export async function POST(request: NextRequest) {
  if (!creatorInvitesEnabled()) return NextResponse.json({ ok: false }, { status: 404 })
  const origin = request.headers.get('origin')
  if (origin && new URL(origin).host !== request.nextUrl.host) return NextResponse.json({ ok: false, message: 'Not allowed.' }, { status: 403 })
  let ctx: Awaited<ReturnType<typeof verifyCreator>>
  try { ctx = await verifyCreator() } catch (err) {
    if (isRedirectError(err)) return NextResponse.json({ ok: false, message: 'Sign in to accept.' }, { status: 401 })
    throw err
  }
  const body = await request.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token : ''
  if (!INVITE_TOKEN.test(token)) return NextResponse.json({ ok: false, message: 'That invite was not found.' }, { status: 404 })

  const admin = createAdminClient()
  const { data: invite } = await admin.from('brand_creator_invites').select('id, brand_id, ig_username, accepted_at, creator_id, signed_up_at').eq('token', token).maybeSingle()
  if (!invite) return NextResponse.json({ ok: false, message: 'That invite was not found.' }, { status: 404 })
  if (invite.accepted_at) return NextResponse.json({ ok: true, already: true })

  const { data: ig } = await admin.from('creator_instagram_connections').select('username, status').eq('creator_id', ctx.creatorId).maybeSingle()
  if (!ig || ig.status !== 'connected') return NextResponse.json({ ok: false, kind: 'connect', message: 'Connect your Instagram first.' }, { status: 409 })
  if ((ig.username ?? '').toLowerCase() !== invite.ig_username) {
    return NextResponse.json({ ok: false, kind: 'mismatch', message: `This invite was sent to @${invite.ig_username}. Connect that Instagram account to accept it.` }, { status: 403 })
  }

  const now = new Date().toISOString()
  const { error } = await admin.from('brand_creator_invites').update({ accepted_at: now, creator_id: ctx.creatorId, signed_up_at: invite.signed_up_at ?? now }).eq('id', invite.id).is('accepted_at', null)
  if (error) return NextResponse.json({ ok: false, message: 'Could not accept just now. Try again.' }, { status: 500 })

  const { data: members } = await admin.from('brand_members').select('user_id').eq('brand_id', invite.brand_id)
  for (const m of members ?? []) {
    await createNotification({ userId: m.user_id, dealId: null, type: 'creator_invite_accepted', body: `@${invite.ig_username} accepted your Guapd invite. Send them an offer.` })
  }
  return NextResponse.json({ ok: true })
}
