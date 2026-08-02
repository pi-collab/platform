'use server'

import { createClient } from '@/lib/supabase/server'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import { revalidatePath } from 'next/cache'

export async function updateDealTitle(dealId: string, title: string) {
  const brand = await verifyApprovedBrand()
  if (!brand) return { status: 'error' as const, message: 'Not authorised' }

  const trimmed = title.trim()
  if (!trimmed) return { status: 'error' as const, message: 'Title cannot be empty' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('deals')
    .update({ title: trimmed })
    .eq('id', dealId)
    .eq('brand_id', brand.brandId)

  if (error) return { status: 'error' as const, message: error.message }

  revalidatePath(`/deals/${dealId}`)
  return { status: 'ok' as const }
}
