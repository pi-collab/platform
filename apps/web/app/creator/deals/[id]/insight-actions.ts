'use server'

import { revalidatePath } from 'next/cache'
import { verifyCreator } from '@/lib/creator-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { storePostInsights } from '@/lib/post-insights-store'

/** Resolve a delivered post to verified numbers, and store the outcome (lib/post-insights-store). */
export async function resolveAndStorePostInsights(itemId: string, postedUrl: string): Promise<void> {
  await storePostInsights(itemId, postedUrl)
}

/**
 * Try again, on demand.
 *
 * The common reasons a first attempt fails are recoverable: the creator had not
 * connected Instagram yet, or pasted the wrong link. Without this they would
 * have to un-post and re-post a deliverable to get another attempt.
 */
export async function recheckPostInsights(
  dealId: string,
  itemId: string,
): Promise<{ ok: boolean; status?: string; message?: string }> {
  // Allowed on an Experience creator leg too (0576): it only re-reads the
  // numbers of the creator's own post; the link itself changes through Guapd.
  const ctx = await verifyCreator()
  const admin = createAdminClient()

  // Scoped to this creator's own deal. A server action is its own entry point,
  // so the item id alone is not authority to touch it.
  const { data: item } = await admin
    .from('deal_deliverable_items')
    .select('id, posted_url, deal_id, deals(creator_id)')
    .eq('id', itemId)
    .eq('deal_id', dealId)
    .maybeSingle()

  const row = item as { posted_url?: string | null; deals?: { creator_id?: string } } | null
  if (!row || row.deals?.creator_id !== ctx.creatorId) {
    return { ok: false, message: 'Not found.' }
  }
  if (!row.posted_url) return { ok: false, message: 'Nothing has been posted for this item yet.' }

  await resolveAndStorePostInsights(itemId, row.posted_url)

  const { data: after } = await admin
    .from('deal_deliverable_items')
    .select('ig_match_status')
    .eq('id', itemId)
    .maybeSingle()

  const status = (after as { ig_match_status?: string } | null)?.ig_match_status

  revalidatePath(`/creator/deals/${dealId}`)
  revalidatePath(`/deals/${dealId}`)
  revalidatePath(`/deals/${dealId}/analytics`)

  return { ok: status === 'resolved', status, message: EXPLAIN[status ?? ''] ?? undefined }
}

/** Said to the CREATOR, who is the only one who can fix any of these. */
const EXPLAIN: Record<string, string> = {
  resolved: 'Found it. The performance numbers are on the deal now.',
  not_found:
    'We could not find that post on your connected Instagram account. Check the link is right, and that it was posted from the account you connected.',
  not_connected:
    'Connect Instagram in Settings and try again, and the brand will see verified numbers for this post.',
  unsupported:
    'Verified numbers are only available for Instagram posts and reels. The link is still shown to the brand.',
}
