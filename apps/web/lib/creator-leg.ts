import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Is this deal a Guapd Experience creator leg (Leg 2)?
 *
 * A creator leg is answered only through creator_leg_respond (accept /
 * decline). Every other creator deal action (counter, submit, upload, post,
 * invoice, shipping) refuses it. The database refuses session writes to a leg
 * by trigger (0534), but several of those actions write with the service role,
 * which a trigger keyed on the session role lets through; this check is what
 * stops them. Fails closed: an unreadable deal is treated as a leg.
 */
export async function isCreatorLeg(dealId: string): Promise<boolean> {
  if (typeof dealId !== 'string' || !dealId) return true
  const { data, error } = await createAdminClient()
    .from('deals').select('leg_role').eq('id', dealId).maybeSingle()
  if (error) return true
  return (data as { leg_role?: string | null } | null)?.leg_role === 'creator_leg'
}

export const CREATOR_LEG_REFUSAL = 'This deal is managed by Guapd. Accept or decline it on the deal page; Guapd handles the rest.'
