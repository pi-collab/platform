import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { trackOfVettingStatus, type Track } from '@/lib/track'

/**
 * Which track a deal with THIS creator belongs on.
 *
 * ── Why the creator decides, and not the caller ─────────────────────────────
 * The track was a caller-supplied argument defaulting to 'deals'. Campaigns
 * passed it; the one-to-one offer builder never did. So a Growth creator
 * booked directly from /browse produced a DEALS deal: the fee ladder never
 * reached the growth rung, the creator paid the brand's standard fee instead
 * of the Growth 30%, and the deal consumed a Deals billing unit.
 *
 * That is an arbitrage against our own pricing. The same creator cost a brand
 * a different amount depending on which door they were booked through, and the
 * cheaper door is the one a brand reaches first.
 *
 * Reading it from the creator closes that, and it cannot conflict with
 * campaigns: a campaign roster is already filtered to
 * requiredVettingStatus(track), so a Growth campaign only ever holds Growth
 * creators and a Deals campaign only ever holds deals_approved ones. The
 * creator and the campaign always agree; this settles the third case, where
 * nobody was asked.
 *
 * ── Server only ─────────────────────────────────────────────────────────────
 * Lives here rather than in lib/track.ts because that file is imported by
 * TrackTag, a client component. And it is resolved server-side on purpose: a
 * track posted from a browser is a price a brand could pick for themselves.
 */
export async function trackForCreator(
  admin: SupabaseClient,
  creatorId: string,
): Promise<Track> {
  const { data } = await admin
    .from('creators')
    .select('vetting_status')
    .eq('id', creatorId)
    .maybeSingle()

  /* Anything not explicitly Growth is Deals, including an unvetted or missing
     creator: neither can be booked at all, and defaulting an unknown to the
     track with the higher creator-side fee would be the same arbitrage in
     reverse. */
  const status = (data as { vetting_status?: string | null } | null)?.vetting_status
  return trackOfVettingStatus(status) === 'growth' ? 'growth' : 'deals'
}
