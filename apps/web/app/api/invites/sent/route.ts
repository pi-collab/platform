import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { brandForApi, jsonFail } from '@/lib/meta/api-auth'

/** POST { inviteId, via }: the brand used a route (copy, Instagram, WhatsApp).
 *  The first use is recorded as sent; the phone for WhatsApp is never sent here. */
const Body = z.object({ inviteId: z.string().uuid(), via: z.enum(['copy', 'instagram', 'whatsapp']) }).strict()

export async function POST(request: NextRequest) {
  const a = await brandForApi(request)
  if ('response' in a) return a.response
  let body: z.infer<typeof Body>
  try { const r = Body.safeParse(await request.json()); if (!r.success) return jsonFail(400, 'That request could not be read.'); body = r.data } catch { return jsonFail(400, 'That request could not be read.') }
  await createAdminClient().from('brand_creator_invites').update({ sent_at: new Date().toISOString(), sent_via: body.via })
    .eq('id', body.inviteId).eq('brand_id', a.brand.brandId).is('sent_at', null)
  return NextResponse.json({ ok: true })
}
