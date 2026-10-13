import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { compactNumber } from '@/lib/compact-number'

/**
 * The creator pool a brand adds to its own Experience roster from (0557): the
 * same bookable, non-house creators /browse lists to every brand, in the
 * Growth pool's card. Service role with the filters written out (as /browse and
 * the Growth pool). NO price of any kind: an Experience creator is paid a shoot
 * day rate, which never reaches a brand, so no creator_products row is read.
 *
 * CALLERS MUST HAVE PASSED THE BRAND GATE for this Experience first (the page
 * reads brand_experience, which refuses anyone else): the roster state below is
 * read with the service role.
 */
export interface BrandPoolCreator {
  id: string; name: string; handle: string; photo: string | null; niches: string[]; location: string | null
  platforms: string[]; followers: number | null; followersLabel: string | null; verified: boolean
  avgReachLabel: string | null; engagementLabel: string | null; interactionsLabel: string | null
  /** On this roster (shared with the brand): accepted / pending / on hold / rejected / locked; null = not on it. */
  rosterState: 'added' | 'accepted' | 'on_hold' | 'locked' | 'rejected' | null
}

export async function listBrandPoolCreators(experienceId: string): Promise<BrandPoolCreator[]> {
  const admin = createAdminClient()
  const [{ data: creators }, { data: roster }] = await Promise.all([
    admin.from('creators')
      .select('id, full_name, handle, profile_photo_url, niches, location, city, state, social_accounts')
      .eq('is_bookable', true)
      .eq('is_guapd', false)
      .order('full_name'),
    // Only rows the brand can already see (shared with it), never Guapd's private shortlist.
    admin.from('experience_roster')
      .select('creator_id, locked, brand_decision')
      .eq('experience_id', experienceId)
      .not('shared_with_brand_at', 'is', null),
  ])
  const ids = (creators ?? []).map((c) => c.id as string)
  const { data: connections } = ids.length
    ? await admin.from('creator_instagram_connections').select('creator_id, status, snapshot').in('creator_id', ids)
    : { data: [] as { creator_id: string; status: string; snapshot: unknown }[] }
  const snapOf = new Map<string, { followersCount?: number; reachLast30?: number; interactionsLast30?: number }>()
  for (const c of connections ?? []) if (c.status === 'connected' && c.snapshot) snapOf.set(c.creator_id as string, c.snapshot as Record<string, number>)
  const onRoster = new Map((roster ?? []).map((r) => [r.creator_id as string, r]))

  return (creators ?? []).map((c) => {
    const snap = snapOf.get(c.id as string)
    const social = Array.isArray(c.social_accounts) ? (c.social_accounts as { platform?: string; follower_count?: number }[]) : []
    const typed = social.map((s) => s.follower_count).filter((n): n is number => typeof n === 'number').sort((a, b) => b - a)[0]
    const followers = snap?.followersCount ?? typed ?? null
    // Engagement only when both figures came from the same snapshot.
    const engagement = snap?.interactionsLast30 != null && snap.followersCount
      ? Math.round((snap.interactionsLast30 / snap.followersCount) * 1000) / 10 : null
    const r = onRoster.get(c.id as string)
    const handle = (c.handle as string | null) ?? ''
    return {
      id: c.id as string,
      name: (c.full_name as string) ?? 'Creator',
      handle: handle ? (handle.startsWith('@') ? handle : `@${handle}`) : '',
      photo: (c.profile_photo_url as string | null) ?? null,
      niches: (c.niches as string[] | null) ?? [],
      location: [c.city, c.state].filter(Boolean).join(', ') || (c.location as string | null) || null,
      platforms: Array.from(new Set(social.map((s) => String(s.platform ?? '').toLowerCase()).filter(Boolean))),
      followers,
      followersLabel: followers != null ? compactNumber(followers) : null,
      verified: Boolean(snap),
      avgReachLabel: snap?.reachLast30 != null ? compactNumber(snap.reachLast30) : null,
      engagementLabel: engagement != null ? `${engagement}%` : null,
      interactionsLabel: snap?.interactionsLast30 != null ? compactNumber(snap.interactionsLast30) : null,
      rosterState: !r ? null : r.locked ? 'locked' : r.brand_decision === 'rejected' ? 'rejected' : r.brand_decision === 'accepted' ? 'accepted' : r.brand_decision === 'on_hold' ? 'on_hold' : 'added',
    }
  })
}
