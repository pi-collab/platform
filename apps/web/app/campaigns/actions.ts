'use server'

import { verifyApprovedBrand } from '@/lib/brand-auth'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createCampaign(name: string, description?: string) {
  const brand = await verifyApprovedBrand()
  const supabase = createClient()

  if (!name.trim()) return { error: 'Campaign name is required' }

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      brand_id: brand.brandId,
      name: name.trim(),
      description: description?.trim() || null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/campaigns')
  return { success: true, campaignId: data.id }
}

export async function updateCampaign(
  campaignId: string,
  updates: { name?: string; description?: string; status?: 'active' | 'completed' | 'archived' }
) {
  await verifyApprovedBrand()
  const supabase = createClient()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (updates.name !== undefined) patch.name = updates.name.trim()
  if (updates.description !== undefined) patch.description = updates.description.trim() || null
  if (updates.status !== undefined) patch.status = updates.status

  const { error } = await supabase
    .from('campaigns')
    .update(patch)
    .eq('id', campaignId)

  if (error) return { error: error.message }

  revalidatePath('/campaigns')
  revalidatePath(`/campaigns/${campaignId}`)
  return { success: true }
}

export async function assignDealToCampaign(dealId: string, campaignId: string | null) {
  const brand = await verifyApprovedBrand()
  const supabase = createClient()

  // Validate brand owns the deal (RLS enforces, but be explicit)
  const { data: deal } = await supabase
    .from('deals')
    .select('id')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { error: 'Deal not found.' }

  // If assigning (not unassigning), validate brand owns the campaign
  if (campaignId) {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .maybeSingle()

    if (!campaign) return { error: 'Campaign not found.' }
  }

  const { error } = await supabase
    .from('deals')
    .update({ campaign_id: campaignId })
    .eq('id', dealId)

  if (error) return { error: error.message }

  revalidatePath('/deals')
  revalidatePath(`/deals/${dealId}`)
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`)
  return { success: true }
}
