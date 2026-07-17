'use server'

import { verifyApprovedBrand } from '@/lib/brand-auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { calculateFee } from '@/lib/fee'
import { createDeal } from '@/app/deals/actions'

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
    placements: [] as DraftPlacement[],
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
      placements: placements as unknown as string,
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
 * Update just the internal note on a campaign draft (brand-only, never sent to creator).
 */
export async function updateCampaignDraftNote(draftId: string, note: string) {
  await verifyApprovedBrand()
  const supabase = createClient()

  const { error } = await supabase
    .from('campaign_drafts')
    .update({ note: note.trim() || null })
    .eq('id', draftId)

  if (error) return { error: error.message }

  const { data: draft } = await supabase
    .from('campaign_drafts')
    .select('campaign_id')
    .eq('id', draftId)
    .maybeSingle()

  if (draft) revalidatePath(`/campaigns/${draft.campaign_id}`)
  return { success: true }
}

/**
 * Update the internal note on a deal (brand-only, never shown to creator).
 */
export async function updateDealInternalNote(dealId: string, note: string) {
  await verifyApprovedBrand()
  const supabase = createClient()

  const { error } = await supabase
    .from('deals')
    .update({ internal_note: note.trim() || null })
    .eq('id', dealId)

  if (error) return { error: error.message }

  revalidatePath(`/deals/${dealId}`)
  revalidatePath('/deals')
  // Revalidate campaign pages (we don't know which one, but it's fine)
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

// ── Phase 2b: Bulk Send ──────────────────────────────────────

interface BulkSendResult {
  creatorName: string
  success: boolean
  dealId?: string
  error?: string
}

function placementSummaryText(placements: DraftPlacement[]): string {
  if (placements.length === 0) return 'No placements set'
  const counts = new Map<string, number>()
  for (const p of placements) {
    const h = p.handle ?? ''
    const key = `${p.label} (${p.platform} ${h.startsWith('@') ? h : `@${h}`})`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([k, n]) => (n > 1 ? `${n}× ${k}` : k))
    .join(' + ')
}

/**
 * Convert Ready campaign drafts into real deals.
 * Each draft is processed independently — partial failure supported.
 * Reuses createDeal for fee freshness, items, and notifications.
 */
export async function bulkSendCampaignDrafts(
  campaignId: string,
  draftIds: string[],
  message?: string
): Promise<{ results: BulkSendResult[] }> {
  const brand = await verifyApprovedBrand()
  const supabase = createClient()
  const admin = createAdminClient()

  if (draftIds.length === 0) return { results: [] }

  // 1. Re-fetch drafts that still exist in this campaign (double-submit guard)
  const { data: drafts } = await supabase
    .from('campaign_drafts')
    .select('id, creator_id, placements, total_price_paise, note')
    .eq('campaign_id', campaignId)
    .in('id', draftIds)

  if (!drafts || drafts.length === 0) return { results: [] }

  // 2. Fetch campaign name for deal titles
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('name')
    .eq('id', campaignId)
    .single()

  if (!campaign) return { results: [] }

  // 3. Existing-deal check — skip drafts whose creator already has a deal in this campaign
  const draftCreatorIds = drafts.map((d) => d.creator_id)
  const { data: existingDeals } = await supabase
    .from('deals')
    .select('creator_id')
    .eq('campaign_id', campaignId)
    .in('creator_id', draftCreatorIds)

  const creatorsWithDeals = new Set((existingDeals ?? []).map((d) => d.creator_id))

  // 4. Vetted re-check — batch query all creators with is_vetted = true
  const { data: vettedCreators } = await supabase
    .from('creators')
    .select('id, full_name')
    .in('id', draftCreatorIds)
    .eq('is_vetted', true)

  const vettedMap = new Map((vettedCreators ?? []).map((c) => [c.id, c.full_name]))

  // 5. Process each draft
  const results: BulkSendResult[] = []

  for (const draft of drafts) {
    const creatorName = vettedMap.get(draft.creator_id) ?? 'Unknown'

    // Skip if creator already has a deal in this campaign
    if (creatorsWithDeals.has(draft.creator_id)) {
      results.push({ creatorName, success: true, error: 'Already sent (skipped)' })
      // Clean up the lingering draft
      await supabase.from('campaign_drafts').delete().eq('id', draft.id)
      continue
    }

    // Vetted gate
    if (!vettedMap.has(draft.creator_id)) {
      results.push({ creatorName: 'Unknown creator', success: false, error: 'Creator is no longer vetted' })
      continue
    }

    // Ready gate — placements must be non-empty and price > 0
    const placements = (typeof draft.placements === 'string' ? JSON.parse(draft.placements) : draft.placements ?? []) as DraftPlacement[]
    if (placements.length === 0 || draft.total_price_paise <= 0) {
      results.push({ creatorName, success: false, error: 'Draft is not ready (missing placements or price)' })
      continue
    }

    // Build deal input
    const items = placements.map((p) => ({
      label: p.label,
      platform: p.platform,
      handle: p.handle,
      price_paise: p.price_paise,
      reel_type: p.reel_type,
      boosting_rights: p.boosting_rights,
      boosting_duration_months: p.boosting_duration_months,
    }))

    const dealResult = await createDeal({
      creator_id: draft.creator_id,
      title: `${campaign.name} — ${creatorName}`,
      deliverables: placementSummaryText(placements),
      price_paise: draft.total_price_paise,
      revision_limit: 2,
      items,
      campaign_id: campaignId,
      message: message?.trim() || undefined,
      internal_note: (draft as Record<string, unknown>).note as string | undefined,
    })

    if (dealResult.error || !dealResult.dealId) {
      results.push({ creatorName, success: false, error: dealResult.error ?? 'Deal creation failed' })
      continue
    }

    // Persist opening message in the deal thread
    if (message?.trim()) {
      await admin.from('messages').insert({
        deal_id: dealResult.dealId,
        sender_id: brand.profileId,
        sender_party: 'brand',
        body: message.trim(),
      })
    }

    // Delete the draft (deal stands even if this fails — existing-deal check prevents double-send)
    await supabase.from('campaign_drafts').delete().eq('id', draft.id)

    results.push({ creatorName, success: true, dealId: dealResult.dealId })
  }

  revalidatePath(`/campaigns/${campaignId}`)
  revalidatePath('/deals')
  return { results }
}

// ── Campaign Brief ───────────────────────────────────────────

/**
 * Update the campaign brief (pitch + creative guidelines).
 * Brand-only — RLS enforces brand owns the campaign.
 */
export async function updateCampaignBrief(
  campaignId: string,
  pitch: string,
  guidelines: string
) {
  await verifyApprovedBrand()
  const supabase = createClient()

  const { error } = await supabase
    .from('campaigns')
    .update({
      brief_pitch: pitch.trim() || null,
      brief_guidelines: guidelines.trim() || null,
    })
    .eq('id', campaignId)

  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}`)
  return { success: true }
}

