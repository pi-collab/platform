import type { Metadata } from 'next'
import { verifyCreator } from '@/lib/creator-auth'
import { createClient } from '@/lib/supabase/server'
import { getMyStorefront } from './actions'
import StorefrontManager from './StorefrontManager'

export const metadata: Metadata = { title: 'My Storefront · Guapd Creator' }

export default async function StorefrontPage() {
  const ctx = await verifyCreator()
  const storefront = await getMyStorefront()

  // Fetch creator data for the preview
  const supabase = createClient()
  const [{ data: creator }, { data: products }] = await Promise.all([
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
  ])

  return (
    <StorefrontManager
      storefront={storefront}
      creator={creator}
      products={products ?? []}
      creatorName={ctx.creatorName}
    />
  )
}
