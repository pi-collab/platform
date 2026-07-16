'use server'

import { verifyApprovedBrand } from '@/lib/brand-auth'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { calculateFee } from '@/lib/fee'

export interface DraftPlacement {
  label: string
  platform: string
  handle: string
  price_paise: number
  product_id?: string
  reel_type?: 'collab' | 'non_collab'
  boosting_rights?: boolean
  boosting_duration_months?: number
}

/**
 * Add creators to a campaign roster (pre-send drafts).
 * Only vetted creators allowed. Fee snapshot is for PREVIEW only —
 * Phase 2b re-snapshots the brand's CURRENT fee at send time.
 */
export async function addCreatorsToCampaign(campaignId: string, creatorIds: string[]) {
  const brand = await verifyApprovedBrand()
  const supabase = createClient()

  if (creatorIds.length === 0) return { error: 'No creators selected' }

  // Validate brand owns the campaign
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .maybeSingle()

  if (!campaign) return { error: 'Campaign not found' }

  // Validate all creators are vetted
  const { data: vetted } = await supabase
    .from('creators')
    .select('id')
    .in('id', creatorIds)

  const vettedIds = new Set((vetted ?? []).map((c) => c.id))
  const unvetted = creatorIds.filter((id) => !vettedIds.has(id))
  if (unvetted.length > 0) return { error: 'Some creators are not vetted or do not exist' }

  // Get brand's current fee settings for preview snapshot
  const { data: brandRow } = await supabase
    .from('brands')
    .select('platform_fee_percent, fee_mode')
    .eq('id', brand.brandId)
    .single()

  const feePercent = brandRow?.platform_fee_percent ?? 0
  const feeMode = (brandRow?.fee_mode as 'on_top' | 'deducted') ?? 'on_top'

  // Insert drafts — skip duplicates (ON CONFLICT DO NOTHING via upsert)
  const rows = creatorIds.map((creatorId) => ({
    campaign_id: campaignId,
    creator_id: creatorId,
    placements: JSON.stringify([]),
    total_price_paise: 0,
    fee_percent: feePercent,
    fee_mode: feeMode,
    total_brand_paise: 0,
  }))

  const { error } = await supabase
    .from('campaign_drafts')
    .upsert(rows, { onConflict: 'campaign_id,creator_id', ignoreDuplicates: true })

  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}`)
  return { success: true, added: creatorIds.length }
}

/**
 * Update a campaign draft's placements + pricing.
 * Recomputes total_price_paise and total_brand_paise from placements.
 * Fee snapshot is refreshed from brand's CURRENT settings on each save
 * (keeps preview accurate; Phase 2b still re-snapshots at send).
 */
export async function updateCampaignDraft(
  draftId: string,
  placements: DraftPlacement[],
  note?: string
) {
  const brand = await verifyApprovedBrand()
  const supabase = createClient()

  // Compute totals from placements
  const totalPricePaise = placements.reduce((s, p) => s + (p.price_paise ?? 0), 0)

  // Refresh fee from brand's CURRENT settings (not stale draft snapshot)
  const { data: brandRow } = await supabase
    .from('brands')
    .select('platform_fee_percent, fee_mode')
    .eq('id', brand.brandId)
    .single()

  const feePercent = brandRow?.platform_fee_percent ?? 0
  const feeMode = (brandRow?.fee_mode as 'on_top' | 'deducted') ?? 'on_top'
  const fee = calculateFee(totalPricePaise, feePercent, feeMode)

  const { error } = await supabase
    .from('campaign_drafts')
    .update({
      placements: JSON.stringify(placements),
      total_price_paise: totalPricePaise,
      fee_percent: feePercent,
      fee_mode: feeMode,
      total_brand_paise: fee.brand_pays_paise,
      ...(note !== undefined ? { note } : {}),
    })
    .eq('id', draftId)

  if (error) return { error: error.message }

  // Get campaign_id for revalidation
  const { data: draft } = await supabase
    .from('campaign_drafts')
    .select('campaign_id')
    .eq('id', draftId)
    .maybeSingle()

  if (draft) revalidatePath(`/campaigns/${draft.campaign_id}`)
  return { success: true }
}

/**
 * Remove a creator from the campaign roster (delete draft).
 */
export async function removeCampaignDraft(draftId: string, campaignId: string) {
  await verifyApprovedBrand()
  const supabase = createClient()

  const { error } = await supabase
    .from('campaign_drafts')
    .delete()
    .eq('id', draftId)

  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}`)
  return { success: true }
}
