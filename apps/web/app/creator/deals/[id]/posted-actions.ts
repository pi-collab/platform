'use server'

import { verifyCreator } from '@/lib/creator-auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAndStorePostInsights } from './insight-actions'
import { revalidatePath } from 'next/cache'
import { notifyDealParty } from '@/lib/notifications'

type Result =
  | { status: 'success' }
  | { status: 'error'; message: string }

function validateUrl(raw: string): { ok: true; url: string } | { ok: false; message: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, message: 'Please enter the live post URL.' }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, message: 'URL must start with http:// or https://' }
    }
    if (!parsed.hostname.includes('.')) {
      return { ok: false, message: 'Please enter a valid URL (e.g. https://instagram.com/reel/...)' }
    }
  } catch {
    return { ok: false, message: 'Please enter a valid URL (e.g. https://instagram.com/reel/...)' }
  }
  return { ok: true, url: trimmed }
}

/**
 * Mark a single deliverable item as posted with its live URL.
 * When all items are posted, the deal-level is_posted is also set.
 */
export async function markItemPosted(dealId: string, itemId: string, postedUrl: string): Promise<Result> {
  await verifyCreator()

  const v = validateUrl(postedUrl)
  if (!v.ok) return { status: 'error', message: v.message }
  const rawUrl = v.url

  const supabase = createClient()

  const { data: deal } = await supabase
    .from('deals')
    .select('id, status')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  const ALLOWED = new Set(['approved', 'paid', 'complete'])
  if (!ALLOWED.has(deal.status)) {
    return { status: 'error', message: `Cannot mark as posted when deal status is "${deal.status}".` }
  }

  // Verify item belongs to this deal and is approved
  const { data: item } = await supabase
    .from('deal_deliverable_items')
    .select('id, item_status, posted_url')
    .eq('id', itemId)
    .eq('deal_id', dealId)
    .maybeSingle()

  if (!item) return { status: 'error', message: 'Item not found.' }
  if (item.item_status !== 'approved') {
    return { status: 'error', message: 'Item must be approved before marking as posted.' }
  }
  if (item.posted_url) {
    return { status: 'error', message: 'This item is already marked as posted.' }
  }

  const now = new Date().toISOString()

  // Update the item
  const { error: itemErr } = await supabase
    .from('deal_deliverable_items')
    .update({ posted_url: rawUrl, posted_at: now, updated_at: now })
    .eq('id', itemId)

  if (itemErr) return { status: 'error', message: `Failed to update item: ${itemErr.message}` }

  // Resolve the post to the creator's own Instagram media, so a brand can see
  // what it actually did. Deliberately AFTER the item is saved and deliberately
  // not awaited for its outcome: marking a deliverable posted is the creator's
  // action and must not fail because Instagram was slow or refused. Every
  // outcome, including "no match", is recorded as a status the brand screen can
  // explain — never as a zero.
  await resolveAndStorePostInsights(itemId, rawUrl).catch((err) => {
    console.error(`[posted] insight resolve failed item=${itemId}: ${err instanceof Error ? err.message : String(err)}`)
  })

  // Check if ALL items in this deal are now posted
  const { data: allItems } = await supabase
    .from('deal_deliverable_items')
    .select('id, posted_url')
    .eq('deal_id', dealId)

  const allPosted = allItems && allItems.length > 0 && allItems.every((i) => !!i.posted_url)

  if (allPosted) {
    // Mark deal-level as posted (first item's URL for backwards compat)
    await supabase
      .from('deals')
      .update({ is_posted: true, posted_url: rawUrl, posted_at: now })
      .eq('id', dealId)
  }

  // Write event
  const admin = createAdminClient()
  await admin.from('events').insert({
    deal_id: dealId,
    event_type: 'deal.item_posted',
    detail: { item_id: itemId, posted_url: rawUrl },
  })

  if (allPosted) {
    await notifyDealParty(dealId, 'brand', 'content_posted', (t) => `Content posted for ${t}`, {
    email: (ctx) => ({
      subject: `${ctx.creatorName} posted the content: ${ctx.dealLabel}`,
      heading: `${ctx.creatorName} posted the content`,
      body: `The content is now live. The live link is on the deal.`,
      // No amount: posting is a delivery milestone, not a money event.
      ctaLabel: 'View live post',
    }),
  })
  }

  revalidatePath(`/deals/${dealId}`)
  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}

/**
 * Legacy: Mark a deal's content as posted with a single URL.
 * Used for deals without structured items.
 */
export async function markPosted(dealId: string, postedUrl: string): Promise<Result> {
  await verifyCreator()

  const v = validateUrl(postedUrl)
  if (!v.ok) return { status: 'error', message: v.message }
  const rawUrl = v.url

  const supabase = createClient()

  const { data: deal } = await supabase
    .from('deals')
    .select('id, status, is_posted')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  const ALLOWED = new Set(['approved', 'paid', 'complete'])
  if (!ALLOWED.has(deal.status)) {
    return { status: 'error', message: `Cannot mark as posted when deal status is "${deal.status}".` }
  }
  if (deal.is_posted) {
    return { status: 'error', message: 'This deal is already marked as posted.' }
  }

  const { error } = await supabase
    .from('deals')
    .update({
      is_posted: true,
      posted_url: rawUrl,
      posted_at: new Date().toISOString(),
    })
    .eq('id', dealId)

  if (error) return { status: 'error', message: `Failed to update: ${error.message}` }

  const admin = createAdminClient()
  await admin.from('events').insert({
    deal_id: dealId,
    event_type: 'deal.posted',
    detail: { posted_url: rawUrl },
  })

  await notifyDealParty(dealId, 'brand', 'content_posted', (t) => `Content posted for ${t}`, {
    email: (ctx) => ({
      subject: `${ctx.creatorName} posted the content: ${ctx.dealLabel}`,
      heading: `${ctx.creatorName} posted the content`,
      body: `The content is now live. The live link is on the deal.`,
      // No amount: posting is a delivery milestone, not a money event.
      ctaLabel: 'View live post',
    }),
  })

  revalidatePath(`/deals/${dealId}`)
  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}
