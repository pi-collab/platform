'use server'

import { createClient } from '@/lib/supabase/server'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import { revalidatePath } from 'next/cache'

type ReviewResult =
  | { status: 'success' }
  | { status: 'error'; message: string }

/**
 * Approve a single deliverable item.
 * If all items are now approved → deal transitions delivered → approved.
 */
export async function approveItem(dealId: string, itemId: string): Promise<ReviewResult> {
  await verifyApprovedBrand()
  const supabase = createClient()

  // Fetch item (RLS: brand can only see their own deal's items)
  const { data: item } = await supabase
    .from('deal_deliverable_items')
    .select('id, item_status')
    .eq('id', itemId)
    .eq('deal_id', dealId)
    .maybeSingle()

  if (!item) return { status: 'error', message: 'Item not found.' }
  if (item.item_status !== 'submitted') {
    return { status: 'error', message: `Cannot approve an item that is "${item.item_status}".` }
  }

  // Update item → approved
  const { error: updateErr } = await supabase
    .from('deal_deliverable_items')
    .update({
      item_status: 'approved',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)

  if (updateErr) {
    return { status: 'error', message: `Failed to approve item: ${updateErr.message}` }
  }

  // Check rollup: are ALL items now approved?
  const { data: allItems } = await supabase
    .from('deal_deliverable_items')
    .select('id, item_status')
    .eq('deal_id', dealId)

  const allApproved = allItems && allItems.length > 0 && allItems.every((i) => i.item_status === 'approved')

  if (allApproved) {
    await supabase
      .from('deals')
      .update({ status: 'approved' })
      .eq('id', dealId)
      .in('status', ['delivered', 'revision'])
  }

  revalidatePath(`/deals/${dealId}`)
  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}

/**
 * Request revision on a single deliverable item.
 * Item → 'revision'. Deal → 'revision' if coming from 'delivered' (one round = one increment).
 */
export async function requestItemRevision(dealId: string, itemId: string, note?: string): Promise<ReviewResult> {
  await verifyApprovedBrand()
  const supabase = createClient()

  // Fetch deal (need status + revision tracking)
  const { data: deal } = await supabase
    .from('deals')
    .select('id, status, revisions_used, revision_limit')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (deal.status !== 'delivered' && deal.status !== 'revision') {
    return { status: 'error', message: `Cannot request revision when deal status is "${deal.status}".` }
  }

  // Fetch item
  const { data: item } = await supabase
    .from('deal_deliverable_items')
    .select('id, item_status')
    .eq('id', itemId)
    .eq('deal_id', dealId)
    .maybeSingle()

  if (!item) return { status: 'error', message: 'Item not found.' }
  if (item.item_status !== 'submitted') {
    return { status: 'error', message: `Cannot request revision on an item that is "${item.item_status}".` }
  }

  // Update item → revision (with optional feedback note)
  const { error: itemErr } = await supabase
    .from('deal_deliverable_items')
    .update({
      item_status: 'revision',
      revision_note: note?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)

  if (itemErr) {
    return { status: 'error', message: `Failed to update item: ${itemErr.message}` }
  }

  // Transition deal to 'revision' + increment revisions_used (only from 'delivered')
  if (deal.status === 'delivered') {
    const { error: dealErr } = await supabase
      .from('deals')
      .update({
        status: 'revision',
        revisions_used: (deal.revisions_used ?? 0) + 1,
      })
      .eq('id', dealId)
      .eq('status', 'delivered')

    if (dealErr) {
      return { status: 'error', message: `Item marked for revision but deal status failed to update: ${dealErr.message}` }
    }
  }

  revalidatePath(`/deals/${dealId}`)
  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}
