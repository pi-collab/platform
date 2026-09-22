'use server'

import { randomUUID } from 'crypto'

import { verifyBrand } from '@/lib/brand-auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { calculateFee } from '@/lib/fee'
import { createDeal } from '@/app/deals/actions'
import { netTerms } from '@/lib/payment-terms'
import { requiredVettingStatus, type Track } from '@/lib/track'
import { checkMinimum } from '@/lib/platform-settings'
import { recordUsage } from '@/lib/usage'

export interface DraftPlacement {
  label: string
  platform: string
  handle: string
  price_paise: number
  /* Priced add-ons, carried so a draft that becomes a deal keeps them. Absent
     on every placement written before 0484 and on any the editor does not set,
     which is why every read below coalesces to 0. */
  collab_charge_paise?: number | null
  collab_rate_type?: 'fixed' | 'percent' | null
  collab_rate_value?: number | null
  boosting_days?: number | null
  boosting_charge_paise?: number | null
  boosting_30day_paise?: number | null
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
  const brand = await verifyBrand()
  const supabase = createClient()

  if (creatorIds.length === 0) return { error: 'No creators selected' }

  // Validate brand owns the campaign, and learn its track and mode
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, track, deliverable_mode, uniform_product_type')
    .eq('id', campaignId)
    .maybeSingle()

  if (!campaign) return { error: 'Campaign not found' }

  const track = (campaign.track as Track) ?? 'deals'
  const needStatus = requiredVettingStatus(track)

  /* ── A campaign never mixes tracks ─────────────────────────────────────────
     Checked at ADD time as well as at send, because the roster is where a
     brand would otherwise spend ten minutes building something that cannot be
     sent. RLS already limits this to bookable creators; this narrows it to the
     one track the campaign bills as, which is what keeps "one growth campaign
     = one billable unit" meaning anything. */
  const { data: eligible } = await supabase
    .from('creators')
    .select('id, vetting_status')
    .in('id', creatorIds)

  const okIds = new Set((eligible ?? []).filter((c) => c.vetting_status === needStatus).map((c) => c.id))
  const wrongTrack = creatorIds.filter((id) => !okIds.has(id))
  if (wrongTrack.length > 0) {
    return {
      error: track === 'growth'
        ? 'Some of those creators are not Growth creators. A Growth campaign can only hold Growth creators.'
        : 'Some of those creators are not available for deals.',
    }
  }

  /* ── Uniform mode: only creators who offer that deliverable ────────────────
     Added here rather than filtered silently in the picker, because a creator a
     brand deliberately chose and who then vanishes without explanation is
     worse than being told why. */
  if (campaign.deliverable_mode === 'uniform' && campaign.uniform_product_type) {
    const { data: offering } = await supabase
      .from('creator_products')
      .select('creator_id')
      .in('creator_id', creatorIds)
      .eq('product_type', campaign.uniform_product_type)
      .eq('is_active', true)

    const offeringIds = new Set((offering ?? []).map((r) => r.creator_id))
    const missing = creatorIds.filter((id) => !offeringIds.has(id))
    if (missing.length > 0) {
      return { error: `Some of those creators do not offer ${campaign.uniform_product_type}. This campaign is set to one deliverable for everyone.` }
    }
  }

  // Get brand's current fee settings for preview snapshot
  const { data: brandRow } = await supabase
    .from('brands')
    .select('platform_fee_percent, fee_mode')
    .eq('id', brand.brandId)
    .single()

  const brandFeePercent = brandRow?.platform_fee_percent ?? 0
  const feeMode = (brandRow?.fee_mode as 'on_top' | 'deducted') ?? 'deducted'

  // Fetch pair rates for all these creators (service-role needed — RLS denies all)
  const admin = createAdminClient()
  const { data: pairRates } = await admin
    .from('brand_creator_rates')
    .select('creator_id, fee_pct')
    .eq('brand_id', brand.brandId)
    .in('creator_id', creatorIds)

  const pairRateMap = new Map((pairRates ?? []).map((pr) => [pr.creator_id, pr.fee_pct]))

  /* The storefront first-deal exemption applies here too. A campaign is just
     another door onto the same deal; resolving the fee differently by route
     would mean the same creator pays 0% or 15% depending on how the brand
     happened to start it. */
  const { resolveDealFee } = await import('@/lib/deal-fee')
  const resolvedFees = new Map<string, number>()
  /* Growth forces 'deducted' regardless of the brand's setting, so the preview
     has to carry the resolved mode rather than the brand's. */
  const resolvedModes = new Map<string, 'on_top' | 'deducted'>()
  for (const cid of creatorIds) {
    const r = await resolveDealFee(admin, brand.brandId, cid, brandFeePercent, feeMode, track)
    resolvedFees.set(cid, r.feePercent)
    resolvedModes.set(cid, r.feeMode)
  }

  // Insert drafts — skip duplicates (ON CONFLICT DO NOTHING via upsert)
  const rows = creatorIds.map((creatorId) => ({
    campaign_id: campaignId,
    creator_id: creatorId,
    placements: [] as DraftPlacement[],
    total_price_paise: 0,
    fee_percent: resolvedFees.get(creatorId) ?? pairRateMap.get(creatorId) ?? brandFeePercent,
    fee_mode: resolvedModes.get(creatorId) ?? feeMode,
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
  const brand = await verifyBrand()
  const supabase = createClient()

  // Compute totals from placements
  /* The SAME definition of a total the deal side uses: a line's price plus the
     add-ons stored on it, summed. Dropping the add-ons here would let a campaign
     draft quote one number and the deal it becomes charge another. */
  const totalPricePaise = placements.reduce(
    (s, p) => s + (p.price_paise ?? 0) + (p.collab_charge_paise ?? 0) + (p.boosting_charge_paise ?? 0),
    0,
  )

  // Refresh fee from brand's CURRENT settings (not stale draft snapshot)
  const { data: brandRow } = await supabase
    .from('brands')
    .select('platform_fee_percent, fee_mode')
    .eq('id', brand.brandId)
    .single()

  const brandFeePercent = brandRow?.platform_fee_percent ?? 0
  const feeMode = (brandRow?.fee_mode as 'on_top' | 'deducted') ?? 'deducted'

  const { data: draftRow } = await supabase
    .from('campaign_drafts')
    .select('creator_id')
    .eq('id', draftId)
    .maybeSingle()

  /* The SAME ladder the deal will be created with, not just the pair-rate rung.
     This used to read brand standard → pair rate, which skipped the storefront
     exemption entirely: a draft that was added at 0% jumped back to 15% the
     moment the brand edited its placements, which they must do to price it.
     The deal itself still came out right — bulkSendCampaignDrafts goes through
     createDeal, which resolves properly — so the effect was a campaign quoting
     one number and the deal it becomes charging another. That is the exact
     mismatch the totals comment above this function exists to prevent. */
  let feePercent = brandFeePercent
  if (draftRow?.creator_id) {
    const admin = createAdminClient()
    const { resolveDealFee } = await import('@/lib/deal-fee')
    const resolved = await resolveDealFee(
      admin,
      brand.brandId,
      draftRow.creator_id,
      brandFeePercent,
      feeMode,
    )
    feePercent = resolved.feePercent
  }

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
  await verifyBrand()
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
  await verifyBrand()
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
  await verifyBrand()
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
  const brand = await verifyBrand()
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

  // 2. Campaign name for deal titles — and its track, which decides everything
  //    below: which creators are eligible, what fee applies, and whether this
  //    send is one billable unit or N.
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('name, track, min_metric, min_creators, min_value_paise')
    .eq('id', campaignId)
    .single()

  if (!campaign) return { results: [] }

  const track = (campaign.track as Track) ?? 'deals'

  /* ── The Growth minimum, enforced against the SNAPSHOT ─────────────────────
     Judged by the rule this campaign was created under, not the live platform
     setting — ops can move the threshold at any time and a brand mid-build must
     not have it moved under them.

     Re-checked HERE and not only in the builder, and specifically AFTER the
     draft refetch above: drafts can be removed between the page rendering a
     happy "5 of 5" and this running. */
  if (track === 'growth') {
    const roster = drafts.reduce(
      (acc, d) => ({ creators: acc.creators + 1, totalPaise: acc.totalPaise + (d.total_price_paise ?? 0) }),
      { creators: 0, totalPaise: 0 },
    )
    const verdict = checkMinimum(
      {
        metric: (campaign.min_metric as 'creators' | 'value' | null) ?? 'creators',
        minCreators: campaign.min_creators,
        minValuePaise: campaign.min_value_paise,
      },
      roster,
    )
    if (!verdict.ok) {
      return { results: [{ creatorName: '', success: false, error: verdict.message ?? 'Below the campaign minimum' }] }
    }
  }

  // 3. Existing-deal check — skip drafts whose creator already has a deal in this campaign
  const draftCreatorIds = drafts.map((d) => d.creator_id)
  const { data: existingDeals } = await supabase
    .from('deals')
    .select('creator_id')
    .eq('campaign_id', campaignId)
    .in('creator_id', draftCreatorIds)

  const creatorsWithDeals = new Set((existingDeals ?? []).map((d) => d.creator_id))

  /* 4. Eligibility re-check, by TRACK rather than by is_vetted.
        A deals campaign needs deals_approved creators; a growth campaign needs
        growth creators. is_vetted is true only for the first of those, so
        reading it here would have refused every Growth creator at the last
        step — after the brand had built the roster and pressed send. */
  const { data: eligibleCreators } = await supabase
    .from('creators')
    .select('id, full_name')
    .in('id', draftCreatorIds)
    .eq('vetting_status', requiredVettingStatus(track))

  const vettedMap = new Map((eligibleCreators ?? []).map((c) => [c.id, c.full_name]))

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

    // Eligibility gate
    if (!vettedMap.has(draft.creator_id)) {
      results.push({
        creatorName: 'Unknown creator',
        success: false,
        error: track === 'growth'
          ? 'Creator is no longer on the Growth track'
          : 'Creator is no longer vetted',
      })
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
      title: `${campaign.name} · ${creatorName}`,
      deliverables: placementSummaryText(placements),
      price_paise: draft.total_price_paise,
      revision_limit: 2,
      items,
      campaign_id: campaignId,
      /* Denormalised onto the deal so the deals list can filter and tag
         without a join, and so the deal keeps the track it was SENT as even if
         the campaign is edited later. */
      track,
      message: message?.trim() || undefined,
      internal_note: (draft as Record<string, unknown>).note as string | undefined,
      /* Campaigns have no payment-terms field yet, and createDeal now REQUIRES
         one - a creator should never be sent an offer that does not say when
         they are paid. Until the campaign builder collects it, every campaign
         deal carries the platform standard explicitly, rather than the null it
         used to carry silently. Stated here, not defaulted inside createDeal,
         so this stays visible as a gap to close and not a rule that quietly
         applies everywhere. */
      payment_terms: netTerms(30),
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

    /* Deals-track units are recorded inside createDeal, which every route to a
       deal goes through — standalone offers included. Doing it here as well
       would double-count nothing (the unique index holds) but would put the
       rule in two places. */
  }

  /* ── The billing ledger, growth track ─────────────────────────────────────
     ONE unit for the whole campaign, however many creators are in it. That
     asymmetry is the entire commercial difference between the two tracks.

     Written after the loop and only if something actually went out: a send
     where every creator failed has incurred nothing. The unique index on
     (unit_type, ref_id) makes a second send of the same campaign a no-op
     rather than a second charge.

     ⚠ ONE UNIT IS COUNTING, NOT ONE PAYMENT. Each creator still has their own
     deal and their own invoice, and the brand pays each of them directly.
     Guapd pools and splits nothing — that would be Route / RBI
     payment-aggregator territory. See migration 0506. */
  const sentCount = results.filter((r) => r.success && r.dealId).length
  if (track === 'growth' && sentCount > 0) {
    await recordUsage(brand.brandId, 'growth_campaign', campaignId, {
      campaign_name: campaign.name,
      creators: sentCount,
      total_price_paise: drafts.reduce((sum, d) => sum + (d.total_price_paise ?? 0), 0),
      fee_basis: 'growth_standard',
    })
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
  guidelines: string,
  avoid?: string,
  attachments?: { name: string; storage_path: string; size_bytes: number; content_type: string }[]
) {
  await verifyBrand()
  const supabase = createClient()

  const update: Record<string, unknown> = {
    brief_pitch: pitch.trim() || null,
    brief_guidelines: guidelines.trim() || null,
  }
  if (avoid !== undefined) update.brief_avoid = avoid.trim() || null
  if (attachments !== undefined) update.brief_attachments = attachments

  const { error } = await supabase
    .from('campaigns')
    .update(update)
    .eq('id', campaignId)

  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}`)
  return { success: true }
}

const CAMPAIGN_ATTACHMENT_MAX = 50 * 1024 * 1024 // 50 MB, the limit everywhere but deliverables

/**
 * A file on a campaign brief.
 *
 * ADMIN CLIENT, matching the deal brief upload next door. This went through the
 * RLS client, and storage policies on deal-files are written around a DEAL: a
 * key under campaign-briefs/ belongs to no deal, so every upload came back
 * "new row violates row-level security policy". Authorisation is verifyBrand
 * plus the campaign ownership check below, not the storage policy.
 *
 * The key is a uuid rather than the file's own name. A raw name carrying a
 * space, a hash or a non-ASCII character makes a key that is awkward at best
 * and unreachable at worst; the display name is kept on the attachment record
 * where it belongs.
 */
export async function uploadCampaignBriefAttachment(campaignId: string, formData: FormData) {
  const brand = await verifyBrand()

  const file = formData.get('file') as File | null
  if (!file) return { error: 'No file provided.' }

  if (file.size > CAMPAIGN_ATTACHMENT_MAX) {
    return { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 50 MB, so please pick a smaller one and try again.` }
  }

  const admin = createAdminClient()

  /* The admin client bypasses RLS, so the campaign has to be checked here
     rather than left to a policy: without this, any signed-in brand could
     write into another brand's campaign folder. */
  const { data: campaign } = await admin
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('brand_id', brand.brandId)
    .maybeSingle()
  if (!campaign) return { error: 'Campaign not found.' }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `campaign-briefs/${campaignId}/${randomUUID()}.${ext}`

  const { error: uploadErr } = await admin.storage
    .from('deal-files')
    .upload(storagePath, file, { contentType: file.type })

  if (uploadErr) {
    console.error('[campaign-brief] Upload failed:', uploadErr.message)
    return { error: 'That upload did not go through. Please try again.' }
  }

  return {
    attachment: {
      name: safeFileName,
      storage_path: storagePath,
      size_bytes: file.size,
      content_type: file.type,
    },
  }
}

/**
 * Remove one.
 *
 * The editor dropped the attachment from its list and left the file in the
 * bucket for good. Deleting the object is the point of removing it.
 */
export async function removeCampaignBriefAttachment(campaignId: string, storagePath: string) {
  const brand = await verifyBrand()
  const admin = createAdminClient()

  // Same reason as above, and additionally: the path arrives from the client.
  if (!storagePath.startsWith(`campaign-briefs/${campaignId}/`)) {
    return { error: 'Invalid attachment.' }
  }
  const { data: campaign } = await admin
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('brand_id', brand.brandId)
    .maybeSingle()
  if (!campaign) return { error: 'Campaign not found.' }

  await admin.storage.from('deal-files').remove([storagePath])
  return { success: true }
}

