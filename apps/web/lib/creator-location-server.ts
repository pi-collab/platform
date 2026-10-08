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

export type CreatorPlace = { city: string | null; state: string | null; age_bracket: string | null }

/**
 * City, state and age for many creators at once, for a list page. Keyed by id.
 * Empty on error (e.g. 0515 not applied), so the list renders without the
 * column's contents instead of failing.
 */
export async function readCreatorPlaces(ids: string[]): Promise<Map<string, CreatorPlace>> {
  const out = new Map<string, CreatorPlace>()
  if (ids.length === 0) return out
  const { data, error } = await createAdminClient()
    .from('creators')
    .select('id, city, state, age_bracket')
    .in('id', ids)
  if (error) {
    console.error(`[creator-location] list read failed: ${error.message}`)
    return out
  }
  for (const r of (data ?? []) as (CreatorPlace & { id: string })[]) {
    out.set(r.id, { city: r.city, state: r.state, age_bracket: r.age_bracket })
  }
  return out
}

/**
 * Ids of creators matching an ops place filter, resolved up front like the
 * shopfront and Instagram filters so the main list query never names a 0515
 * column. `state` may be NOT_ANSWERED for creators with no state on file.
 * Returns null when the filter could not run, which the caller shows as such
 * rather than as "no matches".
 */
export const PLACE_NOT_ANSWERED = '__none__'

export async function creatorIdsByPlace(state: string, ages: string[]): Promise<string[] | null> {
  let q = createAdminClient().from('creators').select('id')
  if (state === PLACE_NOT_ANSWERED) q = q.is('state', null)
  else if (state) q = q.eq('state', state)
  if (ages.length) q = q.in('age_bracket', ages)
  const { data, error } = await q
  if (error) {
    console.error(`[creator-location] filter failed: ${error.message}`)
    return null
  }
  return (data ?? []).map((r: { id: string }) => r.id)
}
