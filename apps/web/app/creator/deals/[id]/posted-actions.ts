'use server'

import { verifyCreator } from '@/lib/creator-auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { notifyDealParty } from '@/lib/notifications'

type Result =
  | { status: 'success' }
  | { status: 'error'; message: string }

/**
 * Mark a deal's content as posted with the live URL.
 * Creator-only action — verifyCreator() is the guard.
 * Allowed from approved onward (approved, paid, complete).
 */
export async function markPosted(dealId: string, postedUrl: string): Promise<Result> {
  await verifyCreator()
  const supabase = createClient()

  // Server-side URL validation — posted_url is rendered as a clickable link
  const rawUrl = postedUrl.trim()
  if (!rawUrl) return { status: 'error', message: 'Please enter the live post URL.' }
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { status: 'error', message: 'URL must start with http:// or https://' }
    }
    if (!parsed.hostname.includes('.')) {
      return { status: 'error', message: 'Please enter a valid URL (e.g. https://instagram.com/reel/...)' }
    }
  } catch {
    return { status: 'error', message: 'Please enter a valid URL (e.g. https://instagram.com/reel/...)' }
  }

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

  // Write an explicit event — the audit trigger only captures status changes, not is_posted
  const admin = createAdminClient()
  await admin.from('events').insert({
    deal_id: dealId,
    event_type: 'deal.posted',
    detail: { posted_url: rawUrl },
  })

  notifyDealParty(dealId, 'brand', 'content_posted', (t) => `Content posted for ${t}`)

  revalidatePath(`/deals/${dealId}`)
  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}
