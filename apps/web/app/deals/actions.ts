'use server'

import { verifyBrand } from '@/lib/brand-auth'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notifyDealParty } from '@/lib/notifications'
import { generateOfferToken } from '@/lib/offer-token'
import { calculateFee } from '@/lib/fee'
import { collabCharge, boostingCharge } from '@/lib/addons'
import { formatAmountForMessage } from '@/lib/money'
import { resolveSendMode, registerHeldSend } from '@/lib/send-gate'
import { ensurePairOrigin } from '@/lib/attribution'

/**
 * Recompute each add-on from the rate that came with it, and store the result.
 *
 * The client already did this arithmetic; doing it again is not redundancy for
 * its own sake. A server action is directly callable, so `collab_charge_paise`
 * arriving in the request is a number someone sent us, and this is a payments
 * path. Recomputing from (price, rate) means a tampered amount is simply
 * replaced by the correct one rather than trusted.
 *
 * It also guarantees the invariant the whole feature rests on: the stored line
 * amounts are what lib/addons produces, so the deal total — which is the sum of
 * those lines — cannot disagree with the invoice that re-reads them.
 */
function addonColumnsFor(item: DeliverableItem): Record<string, number | string | null> {
  const price = item.price_paise ?? 0
  const out: Record<string, number | string | null> = {}

  if (item.collab_rate_type && item.collab_rate_value != null) {
    out.collab_charge_paise = collabCharge(price, {
      collabRateType: item.collab_rate_type,
      collabRateValue: item.collab_rate_value,
      boostingThirtyDayPaise: null,
    })
    out.collab_rate_type = item.collab_rate_type
    out.collab_rate_value = item.collab_rate_value
  }

  if (item.boosting_days != null && item.boosting_days > 0 && item.boosting_30day_paise != null) {
    out.boosting_charge_paise = boostingCharge(item.boosting_days, {
      collabRateType: null,
      collabRateValue: null,
      boostingThirtyDayPaise: item.boosting_30day_paise,
    })
    out.boosting_days = item.boosting_days
    out.boosting_30day_paise = item.boosting_30day_paise
  }

  return out
}

interface DeliverableItem {
  label: string
  platform: string
  handle: string
  price_paise?: number
  reel_type?: 'collab' | 'non_collab'
  boosting_rights?: boolean
  boosting_duration_months?: number
  /* Priced add-ons, resolved and rounded by lib/addons on the client and
     RE-VERIFIED here. A server action is directly callable, so an amount that
     arrives with the request is a claim, not a fact. */
  collab_charge_paise?: number
  collab_rate_type?: 'fixed' | 'percent' | null
  collab_rate_value?: number | null
  boosting_days?: number
  boosting_charge_paise?: number
  boosting_30day_paise?: number
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
  fee_pct_override?: number
  brief_pitch?: string
  brief_guidelines?: string
  brief_avoid?: string
  brief_attachments?: { name: string; storage_path: string; size_bytes: number; content_type: string }[]
}

export async function createDeal(input: CreateDealInput) {
  const brand = await verifyBrand()

  const { creator_id, title, deliverables, price_paise, timeline_date, revision_limit, price_per_extra_revision_paise, usage_rights, payment_terms, items, reengaged_from, requires_shipment, usage_rights_end_date, campaign_id, internal_note, source, fee_pct_override, brief_pitch, brief_guidelines, brief_avoid, brief_attachments } = input

  // Validation
  if (!title.trim()) return { error: 'Title is required' }
  if (!deliverables.trim()) return { error: 'Deliverables are required (select at least one product)' }
  if (!Number.isInteger(price_paise) || price_paise <= 0) return { error: 'Price must be greater than ₹0' }
  if (!Number.isInteger(revision_limit) || revision_limit < 0) return { error: 'Revision limit must be 0 or more' }

  // SEND GATE — server-side, before the deal exists and long before any
  // notification. A rejected brand gets nothing written at all.
  const sendMode = await resolveSendMode(brand.brandId)
  if (sendMode.mode === 'block') return { error: sendMode.message }
  const isHeld = sendMode.mode === 'hold'

  // Fetch brand's fee defaults for snapshot
  const supabase = createClient()
  const { data: brandFee } = await supabase
    .from('brands')
    .select('platform_fee_percent, fee_mode')
    .eq('id', brand.brandId)
    .single()

  // Resolve fee (in order): per-deal override → brand-creator pair rate → brand standard rate
  let resolvedFeePercent: number
  if (fee_pct_override != null) {
    resolvedFeePercent = fee_pct_override
  } else {
    // Check for a brand-creator pair rate (service-role needed — RLS denies all)
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data: pairRate } = await admin
      .from('brand_creator_rates')
      .select('fee_pct')
      .eq('brand_id', brand.brandId)
      .eq('creator_id', creator_id)
      .maybeSingle()

    resolvedFeePercent = pairRate?.fee_pct ?? brandFee?.platform_fee_percent ?? 0
  }

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
      fee_percent: resolvedFeePercent,
      fee_mode: brandFee?.fee_mode ?? 'on_top',
      fee_pct_override: fee_pct_override ?? null,
      reengaged_from: reengaged_from || null,
      requires_shipment: requires_shipment ?? false,
      shipment_status: requires_shipment ? 'pending' : null,
      usage_rights_end_date: usage_rights_end_date || null,
      campaign_id: campaign_id || null,
      internal_note: internal_note?.trim() || null,
      source: source || 'platform',
      brief_pitch: brief_pitch?.trim() || null,
      brief_guidelines: brief_guidelines?.trim() || null,
      brief_avoid: brief_avoid?.trim() || null,
      brief_attachments: brief_attachments && brief_attachments.length > 0 ? brief_attachments : [],
      // Withheld from the creator until ops approves the brand. RLS makes this
      // invisible to them; nothing here relies on app-level filtering.
      held_at: isHeld ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  // Stamp pair origin if this relationship has none. ignoreDuplicates means an
  // existing storefront origin always wins — a pair that began through a
  // creator's link is never rewritten to 'guapd' by a later browse-sourced deal.
  await ensurePairOrigin(brand.brandId, creator_id, source || 'platform')

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
      ...addonColumnsFor(item),
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

  // Held: open/refresh the review, and return WITHOUT notifying. This is the
  // line that keeps a held deal off the creator's phone.
  if (isHeld) {
    await registerHeldSend(brand.brandId, data.id)
    revalidatePath('/deals')
    return { success: true, dealId: data.id, held: true, dealCount: null, pairCount: null, pricePaise: price_paise }
  }

  // Notify creator: new offer (in-app + WhatsApp).
  // The creator sees what they will RECEIVE, net of any deducted fee — the
  // same number as the accept-page, not the gross price.
  const feeMode = (brandFee?.fee_mode as 'on_top' | 'deducted') ?? 'on_top'
  const { creator_receives_paise } = calculateFee(price_paise, resolvedFeePercent, feeMode)

  await notifyDealParty(data.id, 'creator', 'offer_sent', (t) => `New offer: ${t}`, {
    whatsapp: (ctx) => ({
      template: 'new_offer_received',
      bodyVars: [ctx.creatorName, ctx.brandName, formatAmountForMessage(creator_receives_paise)],
      // Offer page is token-authorised — a deal UUID here would NOT open it.
      buttonValue: generateOfferToken(data.id),
    }),
  })

  // Counts for the retention signal. Returned to the client so IT can fire the
  // analytics event — analytics must stay client-side, because consent lives in
  // the browser and the server has no way to know whether it was granted.
  //
  // dealCount  = this brand's deals overall ("second deal" retention signal)
  // pairCount  = deals with THIS creator — the recurring-relationship wedge the
  //              strategy is built on (docs/build-plan.md §0)
  const [{ count: dealCount }, { count: pairCount }] = await Promise.all([
    supabase.from('deals').select('id', { count: 'exact', head: true }).eq('brand_id', brand.brandId),
    supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.brandId)
      .eq('creator_id', creator_id),
  ])

  revalidatePath('/deals')
  return {
    success: true,
    dealId: data.id,
    dealCount: dealCount ?? null,
    pairCount: pairCount ?? null,
    pricePaise: price_paise,
  }
}
