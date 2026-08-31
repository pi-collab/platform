import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseSignedRequest } from '@/lib/instagram'
import { removeConnection } from '@/lib/instagram-sync'

/**
 * Deauthorize callback.
 *
 * Meta POSTs here when a creator removes our app from their Instagram. The
 * token is dead from that moment, so the connection is deleted rather than
 * marked stale: keeping a row would leave the storefront showing "verified"
 * figures sourced from an authorisation that no longer exists.
 *
 * PUBLIC and UNAUTHENTICATED by necessity — Meta calls it, not a signed-in
 * user. The signature is therefore the only thing standing between this
 * endpoint and anyone who can guess an app-scoped id, which is why
 * parseSignedRequest verifies rather than merely decodes.
 *
 * Always 200. Meta retries on failure, and there is nothing for it to retry:
 * an unknown user is already in the desired state.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const signed = form?.get('signed_request')

  if (typeof signed !== 'string') {
    return NextResponse.json({ ok: true })
  }

  const parsed = parseSignedRequest(signed)
  if (!parsed) {
    console.error('[instagram] deauthorize: signature verification failed')
    return NextResponse.json({ ok: true })
  }

  // Keyed on the APP-SCOPED id, which is what Meta sends here and is not the
  // professional account id insights use.
  const { data } = await createAdminClient()
    .from('creator_instagram_connections')
    .select('creator_id')
    .eq('ig_app_scoped_id', parsed.userId)
    .maybeSingle()

  if (data?.creator_id) {
    await removeConnection(data.creator_id)
    console.info(`[instagram] deauthorized creator=${data.creator_id}`)
  }

  return NextResponse.json({ ok: true })
}
