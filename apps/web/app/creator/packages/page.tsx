import type { Metadata } from 'next'
import { verifyCreator } from '@/lib/creator-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import CreatorPageHeader from '@/components/creator/CreatorPageHeader'
import PackagesClient from './PackagesClient'

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
  const admin = createAdminClient()

  const [{ data: creator }, { data: products }, { data: addonRates }] = await Promise.all([
    admin.from('creators').select('social_accounts').eq('id', ctx.creatorId).maybeSingle(),
    admin
      .from('creator_products')
      .select('id, platform, handle, product_type, description, price_paise, price_mode, price_max_paise, display_price, revisions_enabled, included_revisions, price_per_extra_revision_paise')
      .eq('creator_id', ctx.creatorId)
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    admin
      .from('creator_addon_rates')
      .select('platform, handle, collab_rate_type, collab_rate_value, boosting_30day_paise')
      .eq('creator_id', ctx.creatorId),
  ])

  const channels = ((creator?.social_accounts ?? []) as Array<{ platform: string; handle: string }>)
    .filter((s) => s.platform?.trim() && s.handle?.trim())
    .map((s) => ({ platform: s.platform.trim().toLowerCase(), handle: s.handle.trim().replace(/^@/, '') }))

  return (
    <main style={{ position: 'relative', zIndex: 1 }}>
      <CreatorPageHeader title="Packages" backHref={backFrom(searchParams?.from)} />
      <PackagesClient
        channels={channels}
        packages={(products ?? []) as never}
        addonRates={(addonRates ?? []) as never}
      />
    </main>
  )
}
