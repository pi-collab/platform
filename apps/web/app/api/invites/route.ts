import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateFilters } from '@/lib/ai/creator-search-types'
import { brandForApi, jsonFail } from '@/lib/meta/api-auth'
import { metaMarketplaceEnabled } from '@/lib/meta/config'
import { inviteMessage, inviteUrl, instagramMessageUrl, instagramProfileUrl, newInviteToken } from '@/lib/meta/invites'
import { NOT_APPROVED_MESSAGE, brandMayInvite, inviteSummary } from '@/lib/meta/invite-gate'

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
  // Same approval rule as a first deal, server-side. Unapproved: no link at all.
  if (!(await brandMayInvite(brand.brandId))) {
    return NextResponse.json({ ok: false, kind: 'not_approved', message: NOT_APPROVED_MESSAGE }, { status: 403 })
  }

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
      summary: inviteSummary(filters), deliverables: filters.context.deliverables.filter((d) => d !== 'ugc' && d !== 'live'), timeline: null,
    }).select('id, token, sent_at, opened_at, signed_up_at, accepted_at').single()
    if (error || !data) { console.error(`[invite] create failed brand=${brand.brandId}: ${error?.message}`); return jsonFail(500, 'Could not create the invite. Try again.') }
    invite = data
    await alertOnInviteBurst(admin, brand.brandId)
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

/** Log only: a brand creating many invites quickly (brand id and counts). */
async function alertOnInviteBurst(admin: ReturnType<typeof createAdminClient>, brandId: string) {
  try {
    const now = Date.now()
    const [{ count: m10 }, { count: d1 }] = await Promise.all([
      admin.from('brand_creator_invites').select('id', { count: 'exact', head: true }).eq('brand_id', brandId).gte('created_at', new Date(now - 10 * 60_000).toISOString()),
      admin.from('brand_creator_invites').select('id', { count: 'exact', head: true }).eq('brand_id', brandId).gte('created_at', new Date(now - 24 * 3_600_000).toISOString()),
    ])
    if ((m10 ?? 0) >= 10 || (d1 ?? 0) >= 50) console.warn(`[abuse-alert] invites many created brand=${brandId} invites_10m=${m10 ?? 0} invites_24h=${d1 ?? 0}`)
  } catch { /* alerting never fails an invite */ }
}
