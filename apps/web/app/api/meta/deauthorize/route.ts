import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseSignedRequest } from '@/lib/instagram'

/**
 * Facebook Login (brand app) deauthorize callback: the brand removed Guapd in
 * Facebook. Signed with META_APP_SECRET; the connection and its tokens are
 * deleted. Always 200, so Meta does not retry a request we cannot act on.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const signed = form?.get('signed_request')
  if (typeof signed !== 'string') return NextResponse.json({ ok: true })
  const parsed = parseSignedRequest(signed, 'META_APP_SECRET')
  if (!parsed) {
    console.error('[meta] deauthorize: signature verification failed')
    return NextResponse.json({ ok: true })
  }
  const { data } = await createAdminClient().from('brand_meta_connections').delete().eq('fb_user_id', parsed.userId).select('brand_id')
  for (const r of data ?? []) console.info(`[meta] deauthorized brand=${r.brand_id}`)
  return NextResponse.json({ ok: true })
}
