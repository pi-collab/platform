'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { calculateFee } from '@/lib/fee'
import { parsePaymentTermsDays } from '@/lib/invoice'

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

  const { data: deal } = await supabase
    .from('deals')
    .select('id, status')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (deal.status !== 'negotiating') {
    return { status: 'error', message: `Cannot accept a deal that is "${deal.status}".` }
  }

  const { error: updateErr } = await supabase
    .from('deals')
    .update({ status: 'agreed' })
    .eq('id', dealId)
    .eq('status', 'negotiating')

  if (updateErr) {
    return { status: 'error', message: `Failed to accept deal: ${updateErr.message}` }
  }

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
      version: nextVersion,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      revision_note: null,
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
    .select('id, status, price_paise, revisions_used, revision_limit, price_per_extra_revision_paise, fee_percent, fee_mode, payment_terms')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (deal.status !== 'approved') {
    return { status: 'error', message: `Cannot generate invoice for a deal that is "${deal.status}".` }
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
export async function issueInvoice(dealId: string): Promise<DeliverableResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Not authenticated.' }

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

  revalidatePath(`/creator/deals/${dealId}`)
  revalidatePath(`/deals/${dealId}`)
  return { status: 'success' }
}
