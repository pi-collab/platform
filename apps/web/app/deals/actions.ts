'use server'

import { verifyApprovedBrand } from '@/lib/brand-auth'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface CreateDealInput {
  creator_id: string
  title: string
  deliverables: string
  price_paise: number
  timeline_date?: string
  revision_limit: number
  usage_rights?: string
  payment_terms?: string
  message?: string // stored later when send/notification is built
}

export async function createDeal(input: CreateDealInput) {
  const brand = await verifyApprovedBrand()

  const { creator_id, title, deliverables, price_paise, timeline_date, revision_limit, usage_rights, payment_terms } = input

  // Validation
  if (!title.trim()) return { error: 'Title is required' }
  if (!deliverables.trim()) return { error: 'Deliverables are required (select at least one product)' }
  if (!Number.isInteger(price_paise) || price_paise <= 0) return { error: 'Price must be greater than ₹0' }
  if (!Number.isInteger(revision_limit) || revision_limit < 0) return { error: 'Revision limit must be 0 or more' }

  // Insert via anon client (session-based) — RLS deals_insert_brand enforces brand_id = my_brand_id()
  const supabase = createClient()
  const { data, error } = await supabase
    .from('deals')
    .insert({
      brand_id: brand.brandId,
      creator_id,
      created_by: brand.profileId,
      status: 'negotiating',
      title: title.trim(),
      deliverables: deliverables.trim(),
      price_paise,
      timeline_date: timeline_date || null,
      revision_limit,
      usage_rights: usage_rights?.trim() || null,
      payment_terms: payment_terms?.trim() || null,
      last_offer_by: 'brand',
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  // TODO: Insert input.message as first message in the deal thread (messages table)
  // when the send/notification piece is built.

  revalidatePath('/deals')
  return { success: true, dealId: data.id }
}
