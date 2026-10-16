import { notFound } from 'next/navigation'
import { experienceStaffGate } from '@/lib/experience-staff-auth'
import { getConsoleExperience, getConsoleReconcile, listConsoleCreatorPoolPage, listConsoleRoster, type PoolPageFilters } from '@/lib/experience-console-server'
import { LIST_PAGE_SIZE } from '@/lib/list-page'
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
 *
 * 0569: the whole directory is searched (name or handle) and filtered in the
 * database and comes back one page at a time; `?q=&niche=&band=&location=
 * &platform=&track=&rate=&page=` are real URLs.
 */
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null
function poolFilters(sp: Record<string, string | string[] | undefined>): PoolPageFilters {
  const pick = <T extends string>(v: string | null, ok: readonly T[]) => (v && (ok as readonly string[]).includes(v) ? v as T : null)
  return {
    q: one(sp.q)?.slice(0, 100) ?? null,
    niche: one(sp.niche), location: one(sp.location), platform: pick(one(sp.platform), ['instagram', 'youtube'] as const),
    track: pick(one(sp.track), ['growth', 'deals'] as const), band: pick(one(sp.band), ['u50', '50-150', '150+'] as const),
    rate: pick(one(sp.rate), ['set', 'unset'] as const),
  }
}
export default async function ExperiencePoolPage({ params, searchParams }: {
  params: { id: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const gate = await experienceStaffGate()
  if (!gate.ok) return <NoAccess reason={gate.reason} />
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound()

  const filters = poolFilters(searchParams)
  const pageNo = Math.max(1, Number.parseInt(one(searchParams.page) ?? '1', 10) || 1)
  const [exp, roster, pool, reconcile] = await Promise.all([
    getConsoleExperience(params.id), listConsoleRoster(params.id),
    listConsoleCreatorPoolPage(params.id, filters, LIST_PAGE_SIZE, (pageNo - 1) * LIST_PAGE_SIZE), getConsoleReconcile(params.id),
  ])
  if (!exp.ok || !exp.data) notFound()
  if (!roster.ok || !pool.ok) throw new Error((!roster.ok && roster.error) || (!pool.ok && pool.error) || 'Could not load the pool')
  const e = exp.data

  const onRoster = new Map(roster.data.map((r) => [r.creator_id, r]))
  const creators: ExperiencePoolCreator[] = pool.data.rows.map((c) => {
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
      editable={e.status === 'rostering' || e.status === 'confirmed' || e.status === 'shoot_scheduled'}
      creatorsPlanned={e.agreed_plan?.creator_count ?? e.request_creator_count ?? null}
      videosSold={reconcile.ok ? reconcile.data.videos_sold ?? null : null}
      creators={creators}
      initialMode={one(searchParams.as) === 'brand' ? 'brand' : 'guapd'}
      initialChannel={one(searchParams.via) ?? ''}
      filters={filters}
      page={pageNo}
      total={pool.data.total}
      niches={pool.data.niches}
      locations={pool.data.locations}
      rosterSummary={pool.data.roster}
    />
  )
}
