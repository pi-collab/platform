import { createAdminClient } from '@/lib/supabase/admin'

/** Longest bio we store. The storefront editor has always capped at 500. */
export const BIO_MAX = 500
/** Shortest bio the dashboard task counts as done: about one real sentence.
 *  "Hi" is not something a brand, or AI search, can find anyone by. */
export const BIO_MIN_FOR_TASK = 40

/**
 * Set a creator's bio EVERYWHERE it is stored, in one call.
 *
 * Two places held it: creators.bio (settings, ops) and creator_storefronts.bio
 * (the storefront editor). Every page that shows a bio reads the storefront's
 * first, so a bio edited in settings never reached brands for a creator with a
 * storefront. Same fix as niches (setCreatorNiches): creators.bio is the
 * source of truth and the storefront copy is kept equal to it.
 */
export async function setCreatorBio(creatorId: string, raw: string | null | undefined): Promise<{ bio: string | null; error?: string }> {
  const bio = (raw ?? '').trim().slice(0, BIO_MAX) || null
  const admin = createAdminClient()

  const { error } = await admin.from('creators').update({ bio }).eq('id', creatorId)
  if (error) return { bio, error: error.message }

  const { error: sfErr } = await admin.from('creator_storefronts').update({ bio }).eq('creator_id', creatorId)
  if (sfErr) return { bio, error: `Bio saved, but the storefront copy did not update: ${sfErr.message}` }

  return { bio }
}

export async function hasCreatorBio(creatorId: string): Promise<boolean> {
  const { data } = await createAdminClient().from('creators').select('bio').eq('id', creatorId).maybeSingle()
  return ((data?.bio as string | null) ?? '').trim().length >= BIO_MIN_FOR_TASK
}
