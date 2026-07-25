import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

export interface DealPrefill {
  title: string
  deliverables: string
  price_paise: number
  revision_limit: number
  price_per_extra_revision_paise: number
  usage_rights: string | null
  payment_terms: string | null
  reengaged_from: string
  items: { label: string; platform: string; handle: string; price_paise: number; reel_type: string | null; boosting_rights: boolean | null; boosting_duration_months: number | null }[]
  usage_rights_end_date: string | null
  brief_pitch?: string | null
  brief_guidelines?: string | null
}

export default async function NewDealPage({ searchParams }: { searchParams: { creator?: string; from?: string } }) {
  const brand = await verifyApprovedBrand()
  const supabase = createClient()

  // If ?from= is set, fetch source deal for pre-fill and derive creator from it
  let prefill: DealPrefill | undefined
  let creatorId = searchParams.creator

  if (searchParams.from) {
    const [{ data: sourceDeal }, { data: sourceItems }] = await Promise.all([
      supabase
        .from('deals')
        .select('id, creator_id, title, deliverables, price_paise, revision_limit, price_per_extra_revision_paise, usage_rights, payment_terms, usage_rights_end_date, brief_pitch, brief_guidelines')
        .eq('id', searchParams.from)
        .eq('brand_id', brand.brandId)
        .maybeSingle(),
      supabase
        .from('deal_deliverable_items')
        .select('label, platform, handle, price_paise, reel_type, boosting_rights, boosting_duration_months')
        .eq('deal_id', searchParams.from),
    ])

    if (sourceDeal) {
      creatorId = sourceDeal.creator_id
      prefill = {
        title: sourceDeal.title ?? '',
        deliverables: sourceDeal.deliverables ?? '',
        price_paise: sourceDeal.price_paise ?? 0,
        revision_limit: sourceDeal.revision_limit ?? 1,
        price_per_extra_revision_paise: sourceDeal.price_per_extra_revision_paise ?? 0,
        usage_rights: sourceDeal.usage_rights,
        payment_terms: sourceDeal.payment_terms,
        reengaged_from: sourceDeal.id,
        items: (sourceItems ?? []).map((i) => ({
          label: i.label,
          platform: i.platform,
          handle: i.handle,
          price_paise: i.price_paise ?? 0,
          reel_type: i.reel_type ?? null,
          boosting_rights: i.boosting_rights ?? null,
          boosting_duration_months: i.boosting_duration_months ?? null,
        })),
        usage_rights_end_date: sourceDeal.usage_rights_end_date ?? null,
        brief_pitch: (sourceDeal as any).brief_pitch ?? null,
        brief_guidelines: (sourceDeal as any).brief_guidelines ?? null,
      }
    }
  }

  if (!creatorId) redirect('/browse')

  const [{ data: creator, error }, { data: products }, { data: brandRow }, { data: campaigns }] = await Promise.all([
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
    supabase
      .from('campaigns')
      .select('id, name')
      .eq('status', 'active')
      .order('name'),
  ])

  if (error || !creator) notFound()

  // Resolve effective fee: pair rate (if exists) overrides brand standard rate
  const admin = createAdminClient()
  const { data: pairRate } = await admin
    .from('brand_creator_rates')
    .select('fee_pct')
    .eq('brand_id', brand.brandId)
    .eq('creator_id', creatorId)
    .maybeSingle()

  const effectiveFeePercent = pairRate?.fee_pct ?? brandRow?.platform_fee_percent ?? 0

  const activeProducts = (products ?? []).filter((p) => p.is_active)

  return (
    <section style={{ padding: '2.5rem var(--container-pad)', maxWidth: 'var(--container-width)', margin: '0 auto' }}>
      <Link href={`/browse/${creatorId}`} style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
        &larr; Back to {creator.full_name}
      </Link>

      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-heading)', margin: '0 0 2rem' }}>
        {prefill ? `New deal with ${creator.full_name}` : `Create an offer for ${creator.full_name}`}
      </h1>

      <DealForm
        creator={creator}
        products={activeProducts}
        platformFeePercent={effectiveFeePercent}
        feeMode={(brandRow?.fee_mode as 'on_top' | 'deducted') ?? 'on_top'}
        prefill={prefill}
        campaigns={(campaigns ?? []) as { id: string; name: string }[]}
      />
    </section>
  )
}
