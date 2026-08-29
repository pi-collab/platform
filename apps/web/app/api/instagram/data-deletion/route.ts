import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseSignedRequest } from '@/lib/instagram'
import { removeConnection } from '@/lib/instagram-sync'

/**
 * Data deletion request callback.
 *
 * Meta POSTs here when a creator asks for their data to be deleted. Required by
 * Meta and checked at App Review.
 *
 * Must respond with { url, confirmation_code } — a page the person can visit to
 * see the state of their request, and a code identifying it.
 *
 * ── What is deleted, and what is not ────────────────────────────────────────
 * This deletes everything WE hold that came from Instagram: the access token
 * and the snapshot of their profile and audience.
 *
 * It does NOT delete their Guapd account, their deals, or the figures they
 * typed themselves. Those are not Instagram data, and a creator asking Instagram
 * to disconnect has not asked to erase their business history. Deleting deal
 * records would also break the other side of agreements they made with brands.
 * A full account deletion is a separate request to us.
 *
 * Same signature reasoning as the deauthorize route: public, unauthenticated,
 * destructive, so the signature is the only gate.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const signed = form?.get('signed_request')

  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')

  if (typeof signed !== 'string') {
    return NextResponse.json({ error: 'signed_request missing' }, { status: 400 })
  }

  const parsed = parseSignedRequest(signed)
  if (!parsed) {
    console.error('[instagram] data-deletion: signature verification failed')
    return NextResponse.json({ error: 'invalid signed_request' }, { status: 400 })
  }

  // Derived from the id rather than random, so the same request always yields
  // the same code and the status page can be revisited. Hashed so the code does
  // not itself leak an Instagram id to anyone who sees the URL.
  const confirmationCode = createHash('sha256')
    .update(`ig-deletion:${parsed.userId}`)
    .digest('hex')
    .slice(0, 16)

  const { data } = await createAdminClient()
    .from('creator_instagram_connections')
    .select('creator_id')
    .eq('ig_app_scoped_id', parsed.userId)
    .maybeSingle()

  if (data?.creator_id) {
    await removeConnection(data.creator_id)
    console.info(`[instagram] data deletion completed creator=${data.creator_id} code=${confirmationCode}`)
  } else {
    // Nothing held. Still a successful outcome, and reported as one: the
    // requester's desired state is already true.
    console.info(`[instagram] data deletion: nothing held code=${confirmationCode}`)
  }

  return NextResponse.json({
    url: `${base}/instagram/data-deletion?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  })
}
