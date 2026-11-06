import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseSignedRequest } from '@/lib/instagram'

/**
 * Facebook Login (brand app) data deletion request. Deletes the brand's
 * Facebook connection (the only Meta-user data held; Creator Marketplace
 * results are never stored) and returns Meta's expected url + code.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const signed = form?.get('signed_request')
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')
  if (typeof signed !== 'string') return NextResponse.json({ error: 'signed_request missing' }, { status: 400 })
  const parsed = parseSignedRequest(signed, 'META_APP_SECRET')
  if (!parsed) {
    console.error('[meta] data-deletion: signature verification failed')
    return NextResponse.json({ error: 'invalid signed_request' }, { status: 400 })
  }
  const code = createHash('sha256').update(`fb-deletion:${parsed.userId}`).digest('hex').slice(0, 16)
  await createAdminClient().from('brand_meta_connections').delete().eq('fb_user_id', parsed.userId)
  console.info(`[meta] data deletion completed code=${code}`)
  return NextResponse.json({ url: `${base}/instagram/data-deletion?code=${code}`, confirmation_code: code })
}
