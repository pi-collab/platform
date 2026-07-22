'use server'

import { verifyApprovedBrand } from '@/lib/brand-auth'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notifyDealParty } from '@/lib/notifications'

interface DeliverableItem {
  label: string
  platform: string
  handle: string
  price_paise?: number
  reel_type?: 'collab' | 'non_collab'
  boosting_rights?: boolean
  boosting_duration_months?: number
}

interface CreateDealInput {
  creator_id: string
  title: string
  deliverables: string
  price_paise: number
  timeline_date?: string
  revision_limit: number
  price_per_extra_revision_paise?: number
  usage_rights?: string
  payment_terms?: string
  message?: string // stored later when send/notification is built
  items?: DeliverableItem[]
  reengaged_from?: string
  requires_shipment?: boolean
  usage_rights_end_date?: string
  campaign_id?: string
  internal_note?: string
  source?: string
}

export async function createDeal(input: CreateDealInput) {
  const brand = await verifyApprovedBrand()

  const { creator_id, title, deliverables, price_paise, timeline_date, revision_limit, price_per_extra_revision_paise, usage_rights, payment_terms, items, reengaged_from, requires_shipment, usage_rights_end_date, campaign_id, internal_note, source } = input

  // Validation
  if (!title.trim()) return { error: 'Title is required' }
  if (!deliverables.trim()) return { error: 'Deliverables are required (select at least one product)' }
  if (!Number.isInteger(price_paise) || price_paise <= 0) return { error: 'Price must be greater than ₹0' }
  if (!Number.isInteger(revision_limit) || revision_limit < 0) return { error: 'Revision limit must be 0 or more' }

  // Fetch brand's fee defaults for snapshot
  const supabase = createClient()
  const { data: brandFee } = await supabase
    .from('brands')
    .select('platform_fee_percent, fee_mode')
    .eq('id', brand.brandId)
    .single()

  // Insert via anon client (session-based) — RLS deals_insert_brand enforces brand_id = my_brand_id()
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
      price_per_extra_revision_paise: price_per_extra_revision_paise ?? 0,
      usage_rights: usage_rights?.trim() || null,
      payment_terms: payment_terms?.trim() || null,
      last_offer_by: 'brand',
      fee_percent: brandFee?.platform_fee_percent ?? 0,
      fee_mode: brandFee?.fee_mode ?? 'on_top',
      reengaged_from: reengaged_from || null,
      requires_shipment: requires_shipment ?? false,
      shipment_status: requires_shipment ? 'pending' : null,
      usage_rights_end_date: usage_rights_end_date || null,
      campaign_id: campaign_id || null,
      internal_note: internal_note?.trim() || null,
      source: source || 'platform',
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  // Insert structured deliverable items — atomic with the deal.
  // If items insert fails, delete the deal so we don't leave a deal with missing items.
  if (items && items.length > 0) {
    const rows = items.map((item) => ({
      deal_id: data.id,
      label: item.label,
      platform: item.platform,
      handle: item.handle,
      price_paise: item.price_paise ?? null,
      reel_type: item.reel_type ?? null,
      boosting_rights: item.boosting_rights ?? null,
      boosting_duration_months: item.boosting_rights && item.boosting_duration_months ? item.boosting_duration_months : null,
    }))
    const { error: itemsErr } = await supabase
      .from('deal_deliverable_items')
      .insert(rows)

    if (itemsErr) {
      // Roll back: cancel the deal we just created (no DELETE RLS policy, so use UPDATE)
      await supabase.from('deals').update({ status: 'cancelled' }).eq('id', data.id)
      return { error: `Failed to create deliverable items: ${itemsErr.message}` }
    }
  }

  // TODO: Insert input.message as first message in the deal thread (messages table)
  // when the send/notification piece is built.

  // Notify creator: new offer
  notifyDealParty(data.id, 'creator', 'offer_sent', (t) => `New offer: ${t}`)

  revalidatePath('/deals')
  return { success: true, dealId: data.id }
}
