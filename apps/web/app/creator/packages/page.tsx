import type { Metadata } from 'next'
import { verifyCreator } from '@/lib/creator-auth'
import { creatorGrowthState } from '@/lib/creator-growth-state'
import { createAdminClient } from '@/lib/supabase/admin'
import CreatorPageHeader from '@/components/creator/CreatorPageHeader'
import PackagesClient from './PackagesClient'
import { platformPctForTrack } from '@/lib/experience-money'

export const metadata: Metadata = { title: 'Packages · Guapd Creator' }

/**
 * Where the back arrow goes — same rule as notifications and payments. Reached
 * from the profile menu, the dashboard checklist and the shopfront editor, so
 * the caller says where it came from.
 */
function backFrom(from: string | undefined) {
  if (from === 'profile') return '/creator/profile'
  if (from === 'shopfront') return '/creator/storefront'
  return '/creator/dashboard'
}

export default async function CreatorPackagesPage(
  { searchParams }: { searchParams?: { from?: string } },
) {
  const ctx = await verifyCreator()
  /* The fee shown beside the price is 30% for Growth and the standard Deals
     rate otherwise, so the note has to know which this creator is. */
  const growth = await creatorGrowthState(ctx.creatorId)
  const admin = createAdminClient()

  const [{ data: creator }, { data: products }, { data: addonRates }, { data: dayRate }] = await Promise.all([
    admin.from('creators')
      .select('social_accounts, revisions_enabled, included_revisions, price_per_extra_revision_paise')
      .eq('id', ctx.creatorId).maybeSingle(),
    admin
      .from('creator_products')
      .select('id, platform, handle, product_type, description, price_paise, price_mode, price_max_paise, display_price, revisions_enabled, included_revisions, price_per_extra_revision_paise')
      .eq('pricing_type', 'per_deliverable')
      .eq('creator_id', ctx.creatorId)
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    admin
      .from('creator_addon_rates')
      .select('platform, handle, collab_rate_type, collab_rate_value, boosting_30day_paise')
      .eq('creator_id', ctx.creatorId),
    // The shoot day rate: the active one, else the most recent paused one so
    // the screen can offer to switch it back on at the same figure.
    admin
      .from('creator_products')
      .select('price_paise, is_active')
      .eq('creator_id', ctx.creatorId)
      .eq('pricing_type', 'per_day')
      .order('is_active', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const channels = ((creator?.social_accounts ?? []) as Array<{ platform: string; handle: string }>)
    .filter((s) => s.platform?.trim() && s.handle?.trim())
    .map((s) => ({ platform: s.platform.trim().toLowerCase(), handle: s.handle.trim().replace(/^@/, '') }))

  return (
    <main style={{ position: 'relative', zIndex: 1 }}>
      {/* 720/20 matches .pk-wrap's desktop column (max-width 720, padding 24)
          minus the row's own 4px, so "Packages" starts exactly where the copy
          under it does. */}
      <CreatorPageHeader title="Packages" backHref={backFrom(searchParams?.from)} columnWidth={720} columnInset={20} />
      <PackagesClient
        isGrowth={growth.isGrowth}
        dayRate={dayRate ? { paise: Number(dayRate.price_paise), active: dayRate.is_active === true } : null}
        dayRateFeePct={platformPctForTrack(growth.isGrowth ? 'growth' : 'deals')}
        channels={channels}
        packages={(products ?? []) as never}
        addonRates={(addonRates ?? []) as never}
        revisionPolicy={{
          enabled: (creator as Record<string, unknown>)?.revisions_enabled === true,
          included: Number((creator as Record<string, unknown>)?.included_revisions ?? 0),
          perExtraPaise: Number((creator as Record<string, unknown>)?.price_per_extra_revision_paise ?? 0),
        }}
      />
    </main>
  )
}
