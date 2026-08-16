import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export const CREATOR_APPROVAL_ACK = 'creator.approval_acknowledged'

/**
 * Should this creator be shown the "You're approved" screen?
 *
 * Once, on their first visit after vetting clears. Same shape as the brand
 * notice: an event records the acknowledgement, so it survives a new device
 * and cannot be re-triggered by clearing storage.
 *
 * Gated on creator.pending_review_notified existing, NOT merely on being
 * vetted. Every creator already on the roster was vetted before that event
 * existed, so without the guard all thirteen would be congratulated on an
 * approval they got weeks ago the next time they logged in.
 */
export async function shouldShowCreatorApproved(creatorId: string): Promise<boolean> {
  const admin = createAdminClient()

  const [wentThroughVetting, acknowledged] = await Promise.all([
    admin.from('events').select('id')
      .eq('event_type', 'creator.pending_review_notified')
      .contains('detail', { creator_id: creatorId })
      .limit(1).maybeSingle(),
    admin.from('events').select('id')
      .eq('event_type', CREATOR_APPROVAL_ACK)
      .contains('detail', { creator_id: creatorId })
      .limit(1).maybeSingle(),
  ])

  return Boolean(wentThroughVetting.data) && !acknowledged.data
}
