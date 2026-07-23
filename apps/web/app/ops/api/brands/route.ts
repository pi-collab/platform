import { verifyOpsAccess } from '@/lib/ops-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const user = await verifyOpsAccess()
  if (!user) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('brands')
    .select('id, name, platform_fee_percent')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ brands: data })
}
