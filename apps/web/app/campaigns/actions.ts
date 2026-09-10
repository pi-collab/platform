'use server'

import { verifyBrand } from '@/lib/brand-auth'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createCampaign(name: string, description?: string, budgetPaise?: number) {
  const brand = await verifyBrand()
  const supabase = createClient()

  if (!name.trim()) return { error: 'Campaign name is required' }

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      brand_id: brand.brandId,
      name: name.trim(),
      description: description?.trim() || null,
      budget_paise: budgetPaise ?? null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/campaigns')
  return { success: true, campaignId: data.id }
}

export async function updateCampaign(
  campaignId: string,
  updates: { name?: string; description?: string; status?: 'active' | 'completed' | 'archived'; budget_paise?: number | null }
) {
  await verifyBrand()
  const supabase = createClient()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (updates.name !== undefined) patch.name = updates.name.trim()
  if (updates.description !== undefined) patch.description = updates.description.trim() || null
  if (updates.status !== undefined) patch.status = updates.status
  if (updates.budget_paise !== undefined) patch.budget_paise = updates.budget_paise

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
  const brand = await verifyBrand()
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

/**
 * Start a campaign from a set of creators picked on the browse or saved list.
 *
 * Composed from the two actions that already exist rather than a third path
 * into campaigns: createCampaign writes the row, addCreatorsToCampaign builds
 * the drafts, and both keep their own brand checks. A creator who is not vetted
 * or is already on the campaign is rejected there, not here.
 *
 * The campaign is created even if adding some creators fails, and the caller is
 * sent to it either way: a half-populated campaign the brand can see and fix
 * beats an error with nothing behind it and a name they have to type again.
 */
export async function startCampaignWithCreators(
  name: string,
  creatorIds: string[],
  description?: string,
  budgetPaise?: number,
) {
  if (creatorIds.length === 0) return { error: 'Select at least one creator' }

  /* The same three fields the campaigns page collects. Starting a campaign
     from a shortlist used to take a name alone, so a campaign created that way
     opened with a brief and a budget the brand then had to go back and fill
     in. */
  const created = await createCampaign(name, description, budgetPaise)
  if ('error' in created && created.error) return { error: created.error }
  const campaignId = (created as { campaignId: string }).campaignId

  const { addCreatorsToCampaign } = await import('./[id]/draft-actions')
  const added = await addCreatorsToCampaign(campaignId, creatorIds)

  return {
    success: true,
    campaignId,
    warning: 'error' in added && added.error ? added.error : undefined,
  }
}
