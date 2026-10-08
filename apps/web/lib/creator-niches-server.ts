import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalNiches } from '@/lib/niches'

/** The most niches a creator can carry. The pickers stop at 5; this is the
 *  server's ceiling, matching the storefront's long-standing limit. */
export const MAX_NICHES = 10

/**
 * Set a creator's niches EVERYWHERE they are stored, in one call.
 *
 * Three places hold them: creators.niches (settings and ops), the legacy
 * singular creators.niche (still read by AI search), and
 * creator_storefronts.categories (what /browse and AI search filter on). Each
 * screen used to write only its own, so a niche changed in settings never
 * reached brands for a creator who had a storefront, and the screens showed
 * the creator three different answers. Every writer goes through this now.
 *
 * creators.niches is the source of truth; the other two are kept equal to it.
 * The storefront is updated only if one exists: creating one is the editor's
 * job, and it seeds its niches from creators.niches when it does.
 */
export async function setCreatorNiches(
  creatorId: string,
  raw: (string | null | undefined)[],
): Promise<{ niches: string[]; error?: string }> {
  const niches = canonicalNiches(raw).slice(0, MAX_NICHES)
  const admin = createAdminClient()

  const { error } = await admin
    .from('creators')
    .update({ niches, niche: niches[0] ?? null })
    .eq('id', creatorId)
  if (error) return { niches, error: error.message }

  const { error: sfErr } = await admin
    .from('creator_storefronts')
    .update({ categories: niches })
    .eq('creator_id', creatorId)
  if (sfErr) return { niches, error: `Niches saved, but the storefront copy did not update: ${sfErr.message}` }

  return { niches }
}
