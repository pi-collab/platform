import { createClient } from '@/lib/supabase/server'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import DealForm from './DealForm'

interface SocialAccount {
  platform: string
  handle: string
  url: string | null
  follower_count: number | null
  verified: boolean
}

export default async function NewDealPage({ searchParams }: { searchParams: { creator?: string } }) {
  const brand = await verifyApprovedBrand()

  const creatorId = searchParams.creator
  if (!creatorId) redirect('/browse')

  const supabase = createClient()

  const [{ data: creator, error }, { data: products }, { data: brandRow }] = await Promise.all([
    supabase
      .from('creators')
      .select('id, full_name, niches, handle, profile_photo_url, social_accounts')
      .eq('id', creatorId)
      .maybeSingle(),
    supabase
      .from('creator_products')
      .select('id, platform, handle, product_type, description, price_paise, display_price, is_active, included_revisions, price_per_extra_revision_paise')
      .eq('creator_id', creatorId),
    supabase
      .from('brands')
      .select('platform_fee_percent, fee_mode')
      .eq('id', brand.brandId)
      .single(),
  ])

  if (error || !creator) notFound()

  const activeProducts = (products ?? []).filter((p) => p.is_active)

  return (
    <section style={{ padding: '2.5rem var(--container-pad)', maxWidth: 'var(--container-width)', margin: '0 auto' }}>
      <Link href={`/browse/${creatorId}`} style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
        &larr; Back to {creator.full_name}
      </Link>

      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-heading)', margin: '0 0 2rem' }}>
        Create an offer for {creator.full_name}
      </h1>

      <DealForm
        creator={creator}
        products={activeProducts}
        platformFeePercent={brandRow?.platform_fee_percent ?? 0}
        feeMode={(brandRow?.fee_mode as 'on_top' | 'deducted') ?? 'on_top'}
      />
    </section>
  )
}
