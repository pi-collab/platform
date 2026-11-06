import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateFilters } from '@/lib/ai/creator-search-types'
import { brandForApi, jsonFail } from '@/lib/meta/api-auth'
import { metaMarketplaceEnabled } from '@/lib/meta/config'
import { inviteMessage, inviteUrl, instagramMessageUrl, instagramProfileUrl, newInviteToken } from '@/lib/meta/invites'

/**
 * POST /api/invites { searchId, igUsername }: the tracked invite link for one
 * creator on one search (created once, then returned again). Returns the link
 * and the message to send by hand; nothing is sent from here.
 */
const Body = z.object({ searchId: z.string().uuid(), igUsername: z.string().regex(/^@?[A-Za-z0-9._]{1,30}$/) }).strict()

export async function POST(request: NextRequest) {
  if (!metaMarketplaceEnabled()) return jsonFail(404, 'Not found.')
  const a = await brandForApi(request)
  if ('response' in a) return a.response
  const brand = a.brand
  let body: z.infer<typeof Body>
  try { const r = Body.safeParse(await request.json()); if (!r.success) return jsonFail(400, 'That request could not be read.'); body = r.data } catch { return jsonFail(400, 'That request could not be read.') }
  const username = body.igUsername.replace(/^@/, '').toLowerCase()

  const admin = createAdminClient()
  const { data: search } = await admin.from('brand_creator_searches').select('id, filters').eq('id', body.searchId).eq('brand_id', brand.brandId).maybeSingle()
  const filters = search ? validateFilters(search.filters) : null
  if (!search || !filters) return jsonFail(404, 'That search was not found.')

  // Per brand: at most 100 invites a day.
  const { count } = await admin.from('brand_creator_invites').select('id', { count: 'exact', head: true }).eq('brand_id', brand.brandId).gte('created_at', new Date(Date.now() - 24 * 3_600_000).toISOString())

  let { data: invite } = await admin.from('brand_creator_invites').select('id, token, sent_at, opened_at, signed_up_at, accepted_at').eq('brand_id', brand.brandId).eq('search_id', search.id).eq('ig_username', username).maybeSingle()
  if (!invite) {
    if ((count ?? 0) >= 100) return jsonFail(429, 'That is a lot of invites today. Try again tomorrow.')
    const { data, error } = await admin.from('brand_creator_invites').insert({
      brand_id: brand.brandId, search_id: search.id, created_by: brand.profileId, token: newInviteToken(), ig_username: username,
      summary: filters.summary, deliverables: filters.context.deliverables, timeline: filters.context.timeline,
    }).select('id, token, sent_at, opened_at, signed_up_at, accepted_at').single()
    if (error || !data) { console.error(`[invite] create failed brand=${brand.brandId}: ${error?.message}`); return jsonFail(500, 'Could not create the invite. Try again.') }
    invite = data
  }
  const link = inviteUrl(invite.token)
  return NextResponse.json({
    ok: true,
    invite: { id: invite.id, link, sentAt: invite.sent_at, openedAt: invite.opened_at, signedUpAt: invite.signed_up_at, acceptedAt: invite.accepted_at },
    message: inviteMessage(brand.brandName ?? 'A brand', username, link),
    instagram: { profile: instagramProfileUrl(username), message: instagramMessageUrl(username) },
    // Email invites wait for the provider and sending domain to be confirmed.
    emailAvailable: false,
  })
}
