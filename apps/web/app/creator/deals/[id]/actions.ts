'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { calculateFee } from '@/lib/fee'
import { parsePaymentTermsDays } from '@/lib/invoice'
import { notifyDealParty, notifyOtherParty } from '@/lib/notifications'

export type DeliverableResult =
  | { status: 'success' }
  | { status: 'error'; message: string }

/**
 * Accept a deal offer — transitions negotiating → agreed.
 */
export async function acceptDeal(dealId: string): Promise<DeliverableResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Not authenticated.' }

  const [{ data: deal }, { data: items }] = await Promise.all([
    supabase
      .from('deals')
      .select('id, status, usage_rights, usage_rights_end_date')
      .eq('id', dealId)
      .maybeSingle(),
    supabase
      .from('deal_deliverable_items')
      .select('id, label, platform, handle, reel_type, boosting_rights, boosting_duration_months')
      .eq('deal_id', dealId),
  ])

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (deal.status !== 'negotiating') {
    return { status: 'error', message: `Cannot accept a deal that is "${deal.status}".` }
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // Check if there's a brand counter to apply
  const { data: brandCounterEvents } = await admin
    .from('events')
    .select('detail')
    .eq('deal_id', dealId)
    .eq('event_type', 'deal.brand_counter')
    .order('created_at', { ascending: false })
    .limit(1)

  const brandCounter = brandCounterEvents?.[0]?.detail as { counter_items?: { id: string; label: string; price_paise: number }[]; counter_total_paise?: number } | undefined

  // Update deal status + total price from brand counter if applicable
  const dealUpdate: Record<string, unknown> = { status: 'agreed', rights_confirmed_at: now }
  if (brandCounter?.counter_total_paise) {
    dealUpdate.price_paise = brandCounter.counter_total_paise
  }

  const { error: updateErr } = await supabase
    .from('deals')
    .update(dealUpdate)
    .eq('id', dealId)
    .eq('status', 'negotiating')

  if (updateErr) {
    return { status: 'error', message: `Failed to accept deal: ${updateErr.message}` }
  }

  // Update individual deliverable item prices from brand counter
  if (brandCounter?.counter_items) {
    for (const ci of brandCounter.counter_items) {
      await admin
        .from('deal_deliverable_items')
        .update({ price_paise: ci.price_paise })
        .eq('id', ci.id)
        .eq('deal_id', dealId)
    }
  }

  // Snapshot rights terms in an audit event — survives future edits (e.g. extensions)
  await admin.from('events').insert({
    deal_id: dealId,
    event_type: 'deal.rights_confirmed',
    detail: {
      confirmed_at: now,
      usage_rights: deal.usage_rights,
      usage_rights_end_date: deal.usage_rights_end_date,
      items: (items ?? [])
        .filter((i) => i.reel_type || i.boosting_rights != null)
        .map((i) => ({
          id: i.id, label: i.label, platform: i.platform, handle: i.handle,
          reel_type: i.reel_type,
          boosting_rights: i.boosting_rights,
          boosting_duration_months: i.boosting_duration_months,
        })),
    },
  })

  // Notify brand: deal agreed
  await notifyDealParty(dealId, 'brand', 'deal_agreed', (t) => `${t}: deal agreed`, {
    email: (ctx) => ({
      subject: `${ctx.creatorName} accepted your offer: ${ctx.dealLabel}`,
      heading: `${ctx.creatorName} accepted your offer`,
      body: `The terms are now agreed and the deal has moved forward. You can view the full terms and next steps on the deal.`,
      amountPaise: ctx.brandPaysPaise,
      amountLabel: 'Deal value',
    }),
  })

  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}

/**
 * Decline a deal offer — transitions negotiating → declined.
 */
export async function declineDeal(dealId: string, reason?: string): Promise<DeliverableResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Not authenticated.' }

  const { data: deal } = await supabase
    .from('deals')
    .select('id, status')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (deal.status !== 'negotiating') {
    return { status: 'error', message: `Cannot decline a deal that is "${deal.status}".` }
  }

  const { error: updateErr } = await supabase
    .from('deals')
    .update({ status: 'declined' })
    .eq('id', dealId)
    .eq('status', 'negotiating')

  if (updateErr) {
    return { status: 'error', message: `Failed to decline deal: ${updateErr.message}` }
  }

  // Log decline reason as a message if provided
  if (reason?.trim()) {
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (profile) {
      await supabase.from('messages').insert({
        deal_id: dealId,
        sender_id: profile.id,
        sender_party: 'creator',
        body: `Declined: ${reason.trim()}`,
      })
    }
  }

  // Notify brand: offer declined
  await notifyDealParty(dealId, 'brand', 'offer_declined', (t) => `Offer declined: ${t}`, {
    email: (ctx) => ({
      subject: `${ctx.creatorName} declined your offer: ${ctx.dealLabel}`,
      heading: `${ctx.creatorName} declined your offer`,
      body: `This deal will not go ahead. Any reason they gave is on the deal thread. You can re-engage them with revised terms at any time.`,
      // No amount: a price on a declined deal is noise.
    }),
  })

  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}

/**
 * Send a counter offer — creator proposes new per-item prices + optional note.
 * Deal stays in 'negotiating'; brand is notified.
 */
export async function counterOffer(
  dealId: string,
  counterItems: { id: string; label: string; price_paise: number }[],
  note?: string,
): Promise<DeliverableResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Not authenticated.' }

  const { data: deal } = await supabase
    .from('deals')
    .select('id, status')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (deal.status !== 'negotiating') {
    return { status: 'error', message: `Cannot counter a deal that is "${deal.status}".` }
  }

  const totalPaise = counterItems.reduce((sum, i) => sum + i.price_paise, 0)
  if (totalPaise <= 0) {
    return { status: 'error', message: 'Counter total must be greater than zero.' }
  }

  // Log the counter as an audit event
  const admin = createAdminClient()
  await admin.from('events').insert({
    deal_id: dealId,
    event_type: 'deal.counter_offer',
    detail: {
      counter_items: counterItems,
      counter_total_paise: totalPaise,
      note: note?.trim() || null,
    },
  })

  // Send a message summarizing the counter
  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (profile) {
    const lines = counterItems.map((i) => `${i.label}: \u20B9${(i.price_paise / 100).toLocaleString('en-IN')}`)
    const body = `Counter offer:\n${lines.join('\n')}\nTotal: \u20B9${(totalPaise / 100).toLocaleString('en-IN')}${note?.trim() ? `\n\nNote: ${note.trim()}` : ''}`
    await supabase.from('messages').insert({
      deal_id: dealId,
      sender_id: profile.id,
      sender_party: 'creator',
      body,
    })
  }

  // Notify brand
  await notifyDealParty(dealId, 'brand', 'counter_offer', (t) => `Counter offer received for "${t}"`, {
    email: (ctx) => ({
      subject: `${ctx.creatorName} sent a counter offer: ${ctx.dealLabel}`,
      heading: `${ctx.creatorName} sent a counter offer`,
      body: `They've proposed different terms. Review the counter and accept, revise, or decline it on the deal.`,
      // The countered total lives only in this action's scope — the deal row
      // still holds the original price — so apply the fee snapshot to it here.
      amountPaise: ctx.brandPaysFor(totalPaise),
      amountLabel: 'Countered total',
      ctaLabel: 'Review counter offer',
    }),
  })


  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}

function validateUrl(rawUrl: string): string | null {
  if (!rawUrl) return 'A delivery link is required.'
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Link must start with http:// or https://'
    }
    if (!parsed.hostname.includes('.')) {
      return 'Please enter a valid URL (e.g. https://drive.google.com/...)'
    }
  } catch {
    return 'Please enter a valid URL (e.g. https://drive.google.com/...)'
  }
  return null
}

/**
 * Submit a delivery link for a single deliverable item.
 * Item transitions: pending → submitted, or revision → submitted (version incremented).
 * Does NOT move the deal status — that requires explicit submitForReview.
 */
export async function submitItem(dealId: string, itemId: string, externalUrl: string): Promise<DeliverableResult> {
  const rawUrl = externalUrl.trim()
  const urlError = validateUrl(rawUrl)
  if (urlError) return { status: 'error', message: urlError }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Not authenticated.' }

  // Fetch deal (RLS restricts to creator's own deals)
  const { data: deal } = await supabase
    .from('deals')
    .select('id, status')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (deal.status !== 'agreed' && deal.status !== 'revision') {
    return { status: 'error', message: `Cannot submit when deal status is "${deal.status}".` }
  }

  // Fetch the item (RLS: creator can access their deal's items)
  const { data: item } = await supabase
    .from('deal_deliverable_items')
    .select('id, item_status, version')
    .eq('id', itemId)
    .eq('deal_id', dealId)
    .maybeSingle()

  if (!item) return { status: 'error', message: 'Item not found.' }
  if (item.item_status !== 'pending' && item.item_status !== 'revision') {
    return { status: 'error', message: `Cannot submit an item that is "${item.item_status}".` }
  }

  // Update item: set link, mark submitted, bump version if resubmitting after revision
  const nextVersion = item.item_status === 'revision' ? item.version + 1 : item.version
  const { error: updateErr } = await supabase
    .from('deal_deliverable_items')
    .update({
      item_status: 'submitted',
      external_url: rawUrl,
      storage_path: null,
      file_name: null,
      version: nextVersion,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)

  if (updateErr) {
    return { status: 'error', message: `Failed to update item: ${updateErr.message}` }
  }

  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}

/**
 * Explicit "Submit all for review" — moves deal agreed/revision → delivered.
 * Only allowed when ALL items are 'submitted' or 'approved' (none pending/revision).
 */
export async function submitForReview(dealId: string): Promise<DeliverableResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Not authenticated.' }

  const { data: deal } = await supabase
    .from('deals')
    .select('id, status')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (deal.status !== 'agreed' && deal.status !== 'revision') {
    return { status: 'error', message: `Cannot submit for review when deal status is "${deal.status}".` }
  }

  // Check all items are submitted or approved
  const { data: items } = await supabase
    .from('deal_deliverable_items')
    .select('id, item_status')
    .eq('deal_id', dealId)

  if (!items || items.length === 0) {
    return { status: 'error', message: 'No deliverable items found for this deal.' }
  }

  const notReady = items.filter((i) => i.item_status === 'pending' || i.item_status === 'revision')
  if (notReady.length > 0) {
    return { status: 'error', message: `${notReady.length} item${notReady.length !== 1 ? 's' : ''} still need a delivery link.` }
  }

  // Transition deal → delivered
  const { error: updateErr } = await supabase
    .from('deals')
    .update({ status: 'delivered' })
    .eq('id', dealId)
    .in('status', ['agreed', 'revision'])

  if (updateErr) {
    return { status: 'error', message: `Failed to update deal status: ${updateErr.message}` }
  }

  // Notify brand: deliverables submitted for review
  await notifyDealParty(dealId, 'brand', 'deliverable_submitted', (t) => `Deliverables submitted for ${t}`, {
    email: (ctx) => ({
      subject: `${ctx.creatorName} submitted deliverables: ${ctx.dealLabel}`,
      heading: `${ctx.creatorName} submitted deliverables for review`,
      body: `The work is ready for you to review. Approve it, or request a revision if something needs changing.`,
      // No amount: this is a review request, not a money event.
      ctaLabel: 'Review deliverables',
    }),
  })

  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}

/**
 * Legacy: submit a single deliverable link for deals WITHOUT structured items.
 * Kept for backwards compatibility with deals created before structured items.
 */
export async function submitDeliverable(dealId: string, formData: FormData): Promise<DeliverableResult> {
  const rawUrl = (formData.get('external_url') as string)?.trim()
  const note = (formData.get('note') as string)?.trim() || null

  const urlError = validateUrl(rawUrl ?? '')
  if (urlError) return { status: 'error', message: urlError }

  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (!profile) return { status: 'error', message: 'User profile not found.' }

  const { data: deal } = await supabase
    .from('deals')
    .select('id, status')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }

  if (deal.status !== 'agreed' && deal.status !== 'revision') {
    return { status: 'error', message: `Cannot submit a deliverable when deal status is "${deal.status}".` }
  }

  const { data: existing } = await supabase
    .from('deliverables')
    .select('version')
    .eq('deal_id', dealId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextVersion = (existing?.version ?? 0) + 1

  const { error: insertErr } = await supabase
    .from('deliverables')
    .insert({
      deal_id: dealId,
      uploaded_by: profile.id,
      version: nextVersion,
      external_url: rawUrl,
      storage_path: null,
      filename: null,
      note,
    })

  if (insertErr) {
    return { status: 'error', message: `Failed to save deliverable: ${insertErr.message}` }
  }

  const { error: updateErr } = await supabase
    .from('deals')
    .update({ status: 'delivered' })
    .eq('id', dealId)
    .in('status', ['agreed', 'revision'])

  if (updateErr) {
    return { status: 'error', message: `Deliverable saved but failed to update deal status: ${updateErr.message}` }
  }

  // Notify brand: deliverable submitted
  await notifyDealParty(dealId, 'brand', 'deliverable_submitted', (t) => `Deliverables submitted for ${t}`, {
    email: (ctx) => ({
      subject: `${ctx.creatorName} submitted deliverables: ${ctx.dealLabel}`,
      heading: `${ctx.creatorName} submitted deliverables for review`,
      body: `The work is ready for you to review. Approve it, or request a revision if something needs changing.`,
      // No amount: this is a review request, not a money event.
      ctaLabel: 'Review deliverables',
    }),
  })

  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}

/**
 * Generate an invoice for an approved deal (lazy-create by creator).
 * Creates the invoice in 'draft' status with snapshotted amounts.
 */
export async function generateInvoice(dealId: string): Promise<DeliverableResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Not authenticated.' }

  const { data: deal } = await supabase
    .from('deals')
    .select('id, status, is_posted, price_paise, revisions_used, revision_limit, price_per_extra_revision_paise, fee_percent, fee_mode, payment_terms')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (deal.status !== 'approved') {
    return { status: 'error', message: `Cannot generate invoice for a deal that is "${deal.status}".` }
  }
  if (!deal.is_posted) {
    return { status: 'error', message: 'Mark the content as posted before invoicing.' }
  }

  const { data: existing } = await supabase
    .from('invoices')
    .select('id')
    .eq('deal_id', dealId)
    .maybeSingle()

  if (existing) {
    return { status: 'error', message: 'Invoice already exists for this deal.' }
  }

  const fee = calculateFee(deal.price_paise, deal.fee_percent ?? 0, (deal.fee_mode as 'on_top' | 'deducted') ?? 'on_top')
  const extra = Math.max(0, (deal.revisions_used ?? 0) - (deal.revision_limit ?? 0))
  const overage = extra * (deal.price_per_extra_revision_paise ?? 0)
  const dueDays = parsePaymentTermsDays(deal.payment_terms)

  const { error: insertErr } = await supabase
    .from('invoices')
    .insert({
      deal_id: dealId,
      status: 'draft',
      base_paise: deal.price_paise,
      overage_paise: overage,
      fee_paise: fee.fee_paise,
      fee_percent: fee.fee_percent,
      fee_mode: fee.fee_mode,
      brand_pays_paise: fee.brand_pays_paise + overage,
      creator_receives_paise: fee.creator_receives_paise + overage,
      payment_terms: deal.payment_terms,
      payment_due_days: dueDays,
    })

  if (insertErr) {
    return { status: 'error', message: `Failed to create invoice: ${insertErr.message}` }
  }

  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}

/**
 * Issue an invoice to the brand (draft → issued).
 */
/**
 * Get campaign brief for a creator — returns ONLY safe fields (name, pitch, guidelines).
 * Uses admin client because creators have no direct RLS read on campaigns.
 * Access gated by deal ownership (creator must own the deal via RLS).
 */
export async function getCampaignBriefForCreator(dealId: string): Promise<{
  campaignName: string
  pitch: string | null
  guidelines: string | null
} | null> {
  const supabase = createClient()

  // Fetch deal — RLS enforces creator owns this deal
  const { data: deal } = await supabase
    .from('deals')
    .select('campaign_id')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal?.campaign_id) return null

  // Use admin client — creators have no SELECT on campaigns (by design)
  const admin = createAdminClient()
  const { data: campaign } = await admin
    .from('campaigns')
    .select('name, brief_pitch, brief_guidelines')
    .eq('id', deal.campaign_id)
    .maybeSingle()

  if (!campaign) return null
  if (!campaign.brief_pitch && !campaign.brief_guidelines) return null

  return {
    campaignName: campaign.name,
    pitch: campaign.brief_pitch,
    guidelines: campaign.brief_guidelines,
  }
}

/**
 * Submit shipping address for a deal's product shipment.
 * Creator-only action — RLS restricts to creator's own deals.
 */
export async function submitShippingAddress(dealId: string, address: string): Promise<DeliverableResult> {
  const trimmed = address.trim()
  if (!trimmed) return { status: 'error', message: 'Please enter your shipping address.' }
  if (trimmed.length < 10) return { status: 'error', message: 'Address seems too short. Please include your full address.' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Not authenticated.' }

  const { data: deal } = await supabase
    .from('deals')
    .select('id, requires_shipment, status')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (!deal.requires_shipment) return { status: 'error', message: 'This deal does not require a product shipment.' }
  if (['declined', 'cancelled'].includes(deal.status)) {
    return { status: 'error', message: 'Cannot submit address for this deal.' }
  }

  const { error } = await supabase
    .from('deals')
    .update({ shipping_address: trimmed })
    .eq('id', dealId)

  if (error) return { status: 'error', message: `Failed to save address: ${error.message}` }

  // Notify brand that the creator submitted their shipping address
  // No email by scope decision (informational). Awaited because notifyDealParty
  // now writes one row per brand member — leaving it floating risks losing the
  // existing in-app notification.
  await notifyDealParty(dealId, 'brand', 'shipping_address_submitted', (t) => `Shipping address received for ${t}`)

  revalidatePath(`/creator/deals/${dealId}`)
  revalidatePath(`/deals/${dealId}`)
  return { status: 'success' }
}

export async function issueInvoice(dealId: string): Promise<DeliverableResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Not authenticated.' }

  // Verify deal is posted before allowing invoice issue
  const { data: deal } = await supabase
    .from('deals')
    .select('is_posted')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (!deal.is_posted) {
    return { status: 'error', message: 'Mark the content as posted before invoicing.' }
  }

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('deal_id', dealId)
    .maybeSingle()

  if (!invoice) return { status: 'error', message: 'Invoice not found.' }
  if (invoice.status !== 'draft') {
    return { status: 'error', message: `Cannot issue an invoice that is "${invoice.status}".` }
  }

  const { error: updateErr } = await supabase
    .from('invoices')
    .update({
      status: 'issued',
      issued_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice.id)

  if (updateErr) {
    return { status: 'error', message: `Failed to issue invoice: ${updateErr.message}` }
  }

  // Notify brand: invoice issued
  await notifyDealParty(dealId, 'brand', 'invoice_issued', (t) => `Invoice received for ${t}`, {
    email: (ctx) => ({
      subject: `Invoice from ${ctx.creatorName}: ${ctx.dealLabel}`,
      heading: `${ctx.creatorName} sent you an invoice`,
      body: `An invoice has been issued for this deal. Review and accept it to move to payment.`,
      amountPaise: ctx.brandPaysPaise,
      amountLabel: 'Amount due',
      ctaLabel: 'View invoice',
    }),
  })

  revalidatePath(`/creator/deals/${dealId}`)
  revalidatePath(`/deals/${dealId}`)
  return { status: 'success' }
}

/**
 * Submit or update a creator's review for a completed deal.
 * Rating is private — not shared directly with the brand.
 */
export async function submitCreatorReview(dealId: string, rating: number, note: string | null): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated.' }

  if (rating < 1 || rating > 5) return { success: false, error: 'Rating must be 1-5.' }

  // Verify the deal is in a completed state
  const { data: deal } = await supabase
    .from('deals')
    .select('id, status')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { success: false, error: 'Deal not found.' }
  if (!['paid', 'complete'].includes(deal.status)) return { success: false, error: 'Deal must be completed to leave a review.' }

  // Upsert the review (unique on deal_id + reviewer_role)
  const { error } = await supabase
    .from('deal_reviews')
    .upsert(
      { deal_id: dealId, reviewer_role: 'creator', rating, note, updated_at: new Date().toISOString() },
      { onConflict: 'deal_id,reviewer_role' }
    )

  if (error) return { success: false, error: error.message }

  revalidatePath(`/creator/deals/${dealId}`)
  return { success: true }
}
