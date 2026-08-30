import type { Metadata } from 'next'
import { verifyCreator } from '@/lib/creator-auth'
import { createClient } from '@/lib/supabase/server'
import { getConnection } from '@/lib/instagram-sync'
import { getMyStorefront } from './actions'
import StorefrontManager from './StorefrontManager'

export const metadata: Metadata = { title: 'My Storefront · Guapd Creator' }

export default async function StorefrontPage() {
  const ctx = await verifyCreator()
  const storefront = await getMyStorefront()

  // Fetch creator data for the preview
  const supabase = createClient()
  const [{ data: creator }, { data: products }, { data: addonRates }, { data: revPolicy }] = await Promise.all([
    supabase
      .from('creators')
      .select('id, full_name, handle, bio, niches, profile_photo_url, social_accounts, worked_with, is_vetted')
      .eq('id', ctx.creatorId)
      .single(),
    supabase
      .from('creator_products')
      .select('id, platform, handle, product_type, description, price_paise, price_mode, price_max_paise, display_price, is_active')
      .eq('creator_id', ctx.creatorId)
      .eq('is_active', true),
    // The same per-channel add-on rates and per-creator revision policy the
    // packages screen edits — so the rate card step here is the whole rate
    // card, not the part of it that happens to be packages.
    supabase
      .from('creator_addon_rates')
      .select('platform, handle, collab_rate_type, collab_rate_value, boosting_30day_paise')
      .eq('creator_id', ctx.creatorId),
    supabase
      .from('creators')
      .select('revisions_enabled, included_revisions, price_per_extra_revision_paise')
      .eq('id', ctx.creatorId).maybeSingle(),
  ])

  // Selected through the same helper the settings screen uses, which reads
  // explicit non-token columns. The editor never sees the access token.
  const instagramConnection = await getConnection(ctx.creatorId)

  return (
    <StorefrontManager
      storefront={storefront}
      creator={creator}
      instagramConnection={instagramConnection}
      products={products ?? []}
      creatorName={ctx.creatorName}
      addonRates={(addonRates ?? []) as never}
      revisionPolicy={{
        enabled: (revPolicy as Record<string, unknown>)?.revisions_enabled === true,
        included: Number((revPolicy as Record<string, unknown>)?.included_revisions ?? 0),
        perExtraPaise: Number((revPolicy as Record<string, unknown>)?.price_per_extra_revision_paise ?? 0),
      }}
    />
  )
}
