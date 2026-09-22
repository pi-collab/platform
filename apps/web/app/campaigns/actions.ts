'use server'

import { verifyBrand } from '@/lib/brand-auth'
import { createClient } from '@/lib/supabase/server'
import { hasEntitlement } from '@/lib/entitlements'
import { getGrowthMinimum } from '@/lib/platform-settings'
import type { Track } from '@/lib/track'
import { revalidatePath } from 'next/cache'

export interface CampaignSetup {
  /** 'deals' unless the brand explicitly chose Growth. */
  track?: Track
  /** uniform: one deliverable type for everyone. per_creator: pick each. */
  deliverableMode?: 'uniform' | 'per_creator'
  /** Required when deliverableMode is 'uniform'. */
  uniformProductType?: string
}

export async function createCampaign(
  name: string,
  description?: string,
  budgetPaise?: number,
  setup: CampaignSetup = {},
) {
  const brand = await verifyBrand()
  const supabase = createClient()

  if (!name.trim()) return { error: 'Campaign name is required' }

  const track: Track = setup.track === 'growth' ? 'growth' : 'deals'

  /* ── The entitlement gate ──────────────────────────────────────────────────
     Checked here, in the action, not only in the UI. The UI hides the Growth
     option, which stops an honest mistake; this stops a direct call. It asks
     hasEntitlement and never looks at HOW the brand got it — ops grant today,
     subscription later, same check. */
  if (track === 'growth' && !(await hasEntitlement(brand.brandId, 'growth_campaigns'))) {
    return { error: 'This account does not have Growth campaigns enabled. Talk to us and we will switch it on.' }
  }

  const mode = setup.deliverableMode === 'uniform' ? 'uniform' : 'per_creator'
  const uniformType = mode === 'uniform' ? (setup.uniformProductType ?? '').trim() : ''

  if (mode === 'uniform' && !uniformType) {
    return { error: 'Choose the deliverable for this campaign' }
  }

  /* ── The minimum, SNAPSHOT here ────────────────────────────────────────────
     Read once, at creation, and stored on the row. Ops can move the platform
     minimum tomorrow; this campaign is judged against the rule it started
     under. Same instinct as snapshotting the fee — a brand halfway through
     building a roster should not have the goalposts moved. */
  const min = track === 'growth' ? await getGrowthMinimum() : null

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      brand_id: brand.brandId,
      name: name.trim(),
      description: description?.trim() || null,
      budget_paise: budgetPaise ?? null,
      track,
      deliverable_mode: mode,
      uniform_product_type: mode === 'uniform' ? uniformType : null,
      min_metric: min?.metric ?? null,
      min_creators: min?.minCreators ?? null,
      min_value_paise: min?.minValuePaise ?? null,
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
  setup: CampaignSetup = {},
) {
  if (creatorIds.length === 0) return { error: 'Select at least one creator' }

  /* The same three fields the campaigns page collects. Starting a campaign
     from a shortlist used to take a name alone, so a campaign created that way
     opened with a brief and a budget the brand then had to go back and fill
     in. */
  const created = await createCampaign(name, description, budgetPaise, setup)
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
