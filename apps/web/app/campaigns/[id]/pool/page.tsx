import { notFound, redirect } from 'next/navigation'
import { verifyBrand } from '@/lib/brand-auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { compactNumber } from '@/lib/compact-number'
import { checkMinimum } from '@/lib/platform-settings'
import GrowthPoolClient, { type PoolCreator } from './GrowthPoolClient'

export const metadata = { title: 'Growth creator pool · Guapd' }

/**
 * The pool a brand picks a Growth campaign's roster from.
 *
 * Transcribed from "Growth Creator Pool".
 *
 * ── Its own page, not the Add creators modal ────────────────────────────────
 * The Deals modal is a list of names to tick, which is right when the brand is
 * about to price each one individually anyway. Growth is the opposite: the
 * price is the creator's and fixed, so choosing IS the decision, and it is made
 * on reach, engagement and rate. That needs a card with room for figures, and a
 * grid of them needs a page.
 *
 * ── "There is no separate offer step" ───────────────────────────────────────
 * Adding here puts the creator straight on the campaign, at their own rate.
 * The subtitle says so because it is the part that differs most from every
 * other way a brand has added a creator on this platform.
 */
export default async function GrowthPoolPage({ params }: { params: { id: string } }) {
  const brand = await verifyBrand()
  const supabase = createClient()

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, name, track, deliverable_mode, uniform_product_type, min_metric, min_creators, min_value_paise')
    .eq('id', params.id)
    .maybeSingle()

  if (!campaign) notFound()
  /* A Deals campaign keeps its modal. Sending one here would offer a pool of
     creators it cannot add, since the tracks never mix. */
  if (campaign.track !== 'growth') redirect(`/campaigns/${params.id}`)

  const uniformType = campaign.deliverable_mode === 'uniform'
    ? (campaign.uniform_product_type as string | null)
    : null

  const admin = createAdminClient()

  /* Growth creators only, and only those a brand may see. is_bookable covers
     both approved tracks, so the vetting_status filter is what narrows it to
     this one. */
  const [{ data: creators }, { data: drafts }] = await Promise.all([
    admin
      .from('creators')
      .select('id, full_name, handle, profile_photo_url, niches, location, social_accounts')
      .eq('is_bookable', true)
      .eq('vetting_status', 'growth')
      .order('full_name'),
    supabase
      .from('campaign_drafts')
      .select('id, creator_id, total_price_paise')
      .eq('campaign_id', params.id),
  ])

  const creatorIds = (creators ?? []).map((c) => c.id)

  const [{ data: products }, { data: connections }] = await Promise.all([
    creatorIds.length
      ? admin.from('creator_products')
          .select('creator_id, product_type, price_paise, platform')
          .in('creator_id', creatorIds)
          .eq('is_active', true)
      : Promise.resolve({ data: [] as { creator_id: string; product_type: string; price_paise: number; platform: string }[] }),
    creatorIds.length
      ? admin.from('creator_instagram_connections')
          .select('creator_id, status, snapshot')
          .in('creator_id', creatorIds)
      : Promise.resolve({ data: [] as { creator_id: string; status: string; snapshot: unknown }[] }),
  ])

  const draftByCreator = new Map((drafts ?? []).map((d) => [d.creator_id, d]))

  const snapshotOf = new Map<string, { followersCount?: number; reachLast30?: number; interactionsLast30?: number }>()
  for (const c of connections ?? []) {
    if (c.status === 'connected' && c.snapshot) {
      snapshotOf.set(c.creator_id, c.snapshot as Record<string, number>)
    }
  }

  const pool: PoolCreator[] = (creators ?? []).map((c) => {
    const mine = (products ?? []).filter((p) => p.creator_id === c.id)
    /* In a uniform campaign the only rate that matters is the one for THAT
       deliverable. Showing a cheaper package the campaign cannot buy would be
       a price the brand never gets. */
    const relevant = uniformType ? mine.filter((p) => p.product_type === uniformType) : mine
    const cheapest = relevant.length ? Math.min(...relevant.map((p) => p.price_paise)) : null

    const snap = snapshotOf.get(c.id)
    const typedFollowers = Array.isArray(c.social_accounts)
      ? (c.social_accounts as { follower_count?: number }[])
          .map((s) => s.follower_count).filter((n): n is number => typeof n === 'number')
          .sort((a, b) => b - a)[0]
      : undefined
    const followers = snap?.followersCount ?? typedFollowers ?? null

    /* Engagement against FOLLOWERS, and only when both came from the same
       snapshot. Mixing a verified interaction count with a typed follower
       count produces a percentage that is not a measurement of anything. */
    const engagement = snap?.interactionsLast30 != null && snap.followersCount
      ? Math.round((snap.interactionsLast30 / snap.followersCount) * 1000) / 10
      : null

    return {
      id: c.id,
      name: c.full_name,
      handle: c.handle ? (c.handle.startsWith('@') ? c.handle : `@${c.handle}`) : '',
      photo: c.profile_photo_url,
      niches: (c.niches as string[] | null) ?? [],
      location: (c.location as string | null) ?? null,
      platforms: Array.from(new Set(mine.map((p) => p.platform))),
      followers,
      followersLabel: followers != null ? compactNumber(followers) : null,
      /* Verified means it came from the connection, the same rule the
         storefront's badge follows. A typed number never earns the tick. */
      verified: Boolean(snap),
      ratePaise: cheapest,
      avgReachLabel: snap?.reachLast30 != null ? compactNumber(snap.reachLast30) : null,
      engagementLabel: engagement != null ? `${engagement}%` : null,
      interactionsLabel: snap?.interactionsLast30 != null ? compactNumber(snap.interactionsLast30) : null,
      added: draftByCreator.has(c.id),
      draftId: draftByCreator.get(c.id)?.id ?? null,
      /* Addable only if they sell what this campaign buys. The server refuses
         anyway; the card says so first. */
      sellsUniformType: uniformType ? relevant.length > 0 : true,
    }
  })

  const addedTotal = (drafts ?? []).reduce((sum, d) => sum + (d.total_price_paise ?? 0), 0)
  const minimum = {
    metric: (campaign.min_metric as 'creators' | 'value' | null) ?? 'creators',
    minCreators: campaign.min_creators as number | null,
    minValuePaise: campaign.min_value_paise as number | null,
  }
  const verdict = checkMinimum(minimum, { creators: (drafts ?? []).length, totalPaise: addedTotal })

  return (
    <GrowthPoolClient
      campaignId={campaign.id}
      campaignName={campaign.name}
      uniformType={uniformType}
      creators={pool}
      minimum={minimum}
      minimumMet={verdict.ok}
      brandId={brand.brandId}
    />
  )
}
