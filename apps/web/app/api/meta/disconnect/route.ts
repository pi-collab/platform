import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { brandForApi } from '@/lib/meta/api-auth'

/** Remove the brand's Facebook connection (tokens deleted, not kept). */
export async function POST(request: NextRequest) {
  const a = await brandForApi(request)
  if ('response' in a) return a.response
  const { error } = await createAdminClient().from('brand_meta_connections').delete().eq('brand_id', a.brand.brandId)
  if (error) return NextResponse.json({ ok: false, message: 'Could not disconnect. Try again.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
