import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { growthCta, type GrowthCta } from '@/lib/growth-cta'

/**
 * Is this creator on the Growth track, and what should they press next?
 *
 * Resolved in one place because five separate screens need the same answer and
 * each computing its own is how two of them come to disagree about whether a
 * creator has packages. Admin client: this reads the creator's own row and
 * their own products, and the pages calling it have already authenticated them.
 */
export interface CreatorGrowthState {
  isGrowth: boolean
  /** Null for a Deals creator, and for a Growth creator with nothing left. */
  cta: GrowthCta | null
}

export async function creatorGrowthState(creatorId: string): Promise<CreatorGrowthState> {
  const admin = createAdminClient()

  const { data: creator } = await admin
    .from('creators').select('vetting_status').eq('id', creatorId).maybeSingle()

  if (creator?.vetting_status !== 'growth') return { isGrowth: false, cta: null }

  const [{ count: packageCount }, { data: connection }] = await Promise.all([
    admin.from('creator_products')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', creatorId).eq('is_active', true),
    admin.from('creator_instagram_connections')
      .select('status').eq('creator_id', creatorId).maybeSingle(),
  ])

  return {
    isGrowth: true,
    cta: growthCta({
      hasPackages: (packageCount ?? 0) > 0,
      /* A broken connection still counts as connected. Reconnecting is a fault
         the banner already handles, and asking for it here too would put the
         same request in two places — the duplication the task card exists to
         end. */
      hasInstagram: Boolean(connection && connection.status !== 'not_connected'),
    }),
  }
}
