import { notFound } from 'next/navigation'
import { experienceStaffGate } from '@/lib/experience-staff-auth'
import { getConsoleExperience, getConsoleReconcile, listConsoleCreatorPool, listConsoleRoster } from '@/lib/experience-console-server'
import { compactNumber } from '@/lib/compact-number'
import NoAccess from '../../NoAccess'
import ExperiencePoolClient, { type ExperiencePoolCreator } from './ExperiencePoolClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Creator pool · Guapd Experiences' }

/**
 * The creator pool for one Experience's roster (staff console): the Growth
 * campaign pool's layout, with each card leading on the creator's SHOOT DAY
 * RATE instead of a deliverable price, because that is what a creator on an
 * Experience is paid from.
 *
 * Staff only: experienceStaffGate here, and every read is a database function
 * that checks operational access again (0532, 0536). The day rate never
 * reaches a brand; this page is not reachable by one.
 *
 * `?as=brand&via=<channel>` adds the brand's picks (recorded with the channel)
 * instead of Guapd's.
 */
export default async function ExperiencePoolPage({ params, searchParams }: {
  params: { id: string }
  searchParams: { as?: string; via?: string }
}) {
  const gate = await experienceStaffGate()
  if (!gate.ok) return <NoAccess reason={gate.reason} />
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound()

  const [exp, roster, pool, reconcile] = await Promise.all([
    getConsoleExperience(params.id), listConsoleRoster(params.id), listConsoleCreatorPool(), getConsoleReconcile(params.id),
  ])
  if (!exp.ok || !exp.data) notFound()
  if (!roster.ok || !pool.ok) throw new Error((!roster.ok && roster.error) || (!pool.ok && pool.error) || 'Could not load the pool')
  const e = exp.data

  const onRoster = new Map(roster.data.map((r) => [r.creator_id, r]))
  const creators: ExperiencePoolCreator[] = pool.data.map((c) => {
    const typedFollowers = Array.isArray(c.social_accounts)
      ? (c.social_accounts as { follower_count?: number }[])
          .map((s) => s.follower_count).filter((n): n is number => typeof n === 'number').sort((a, b) => b - a)[0]
      : undefined
    const followers = c.ig_followers ?? typedFollowers ?? null
    /* Engagement only when both figures came from the same snapshot: a
       verified interaction count over a typed follower count measures nothing. */
    const engagement = c.ig_interactions_30 != null && c.ig_followers
      ? Math.round((c.ig_interactions_30 / c.ig_followers) * 1000) / 10 : null
    const r = onRoster.get(c.id)
    return {
      id: c.id,
      name: c.full_name,
      handle: c.handle ? (c.handle.startsWith('@') ? c.handle : `@${c.handle}`) : '',
      photo: c.profile_photo_url,
      niches: c.niches ?? [],
      location: [c.city, c.state].filter(Boolean).join(', ') || c.location || null,
      platforms: Array.isArray(c.social_accounts)
        ? Array.from(new Set((c.social_accounts as { platform?: string }[]).map((s) => String(s.platform ?? '').toLowerCase()).filter(Boolean)))
        : [],
      followers,
      followersLabel: followers != null ? compactNumber(followers) : null,
      verified: !!c.ig_connected,
      track: c.track,
      dayRatePaise: c.day_rate_paise,
      avgReachLabel: c.ig_reach_30 != null ? compactNumber(c.ig_reach_30) : null,
      engagementLabel: engagement != null ? `${engagement}%` : null,
      interactionsLabel: c.ig_interactions_30 != null ? compactNumber(c.ig_interactions_30) : null,
      rosterId: r?.id ?? null,
      rosterState: !r ? null : r.locked ? 'locked' : r.brand_decision === 'rejected' ? 'rejected' : 'on',
    }
  })

  return (
    <ExperiencePoolClient
      experienceId={e.id}
      title={e.title}
      brandName={e.brand_name}
      editable={e.status === 'rostering' || e.status === 'confirmed'}
      creatorsPlanned={e.agreed_plan?.creator_count ?? e.request_creator_count ?? null}
      videosSold={reconcile.ok ? reconcile.data.videos_sold ?? null : null}
      creators={creators}
      initialMode={searchParams.as === 'brand' ? 'brand' : 'guapd'}
      initialChannel={typeof searchParams.via === 'string' ? searchParams.via : ''}
    />
  )
}
