import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Whether this creator has told us their city, state and age bracket.
 *
 * Its own query, never folded into a wider creators select: if migration 0515
 * has not reached a database, a select naming these columns fails outright, and
 * on the dashboard that would take the whole page with it (see 0513). Here an
 * error reads as "answered", so the prompt hides rather than asking for
 * something that could not be saved anyway.
 */
export async function hasCreatorLocation(creatorId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('creators')
    .select('city, state, age_bracket')
    .eq('id', creatorId)
    .maybeSingle()
  if (error) {
    console.error(`[creator-location] read failed creator=${creatorId}: ${error.message}`)
    return true
  }
  const row = data as { city: string | null; state: string | null; age_bracket: string | null } | null
  return Boolean(row?.city && row?.state && row?.age_bracket)
}

/** The three fields for a form to start from; blanks when unset or unreadable. */
export async function readCreatorLocation(creatorId: string): Promise<{ city: string; state: string; ageBracket: string }> {
  const { data, error } = await createAdminClient()
    .from('creators')
    .select('city, state, age_bracket')
    .eq('id', creatorId)
    .maybeSingle()
  if (error || !data) return { city: '', state: '', ageBracket: '' }
  const row = data as { city: string | null; state: string | null; age_bracket: string | null }
  return { city: row.city ?? '', state: row.state ?? '', ageBracket: row.age_bracket ?? '' }
}
