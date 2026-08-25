import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyBrand } from '@/lib/brand-auth'
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

const STEPS = ['Create offer', 'Agreed', 'Submitted', 'Approved', 'Invoice', 'Paid'] as const

export default async function NewDealPage({ searchParams }: { searchParams: { creator?: string; from?: string; items?: string } }) {
  const brand = await verifyBrand()
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
      .select('id, platform, handle, product_type, description, price_paise, price_mode, price_max_paise, display_price, is_active, included_revisions, price_per_extra_revision_paise')
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
  // Per-channel collab / boosting rates, so the offer builder can price the
  // add-ons before a deal exists. Read through the admin client like the rest
  // of this page; the RLS policy would allow it anyway for a vetted creator.
  const { data: addonRates } = await admin
    .from('creator_addon_rates')
    .select('platform, handle, collab_rate_type, collab_rate_value, boosting_30day_paise')
    .eq('creator_id', creator.id)

  const activeProducts = (products ?? []).filter((p) => p.is_active)
  const firstName = creator.full_name.split(' ')[0]

  // Parse storefront item selections: "productId:qty,productId:qty"
  let storefrontSelections: Record<string, number> | undefined
  if (!prefill && searchParams.items) {
    storefrontSelections = {}
    for (const pair of searchParams.items.split(',')) {
      const [key, qtyStr] = pair.split(':')
      const qty = parseInt(qtyStr, 10)
      if (key && qty > 0) storefrontSelections[key] = qty
    }
    if (Object.keys(storefrontSelections).length === 0) storefrontSelections = undefined
  }

  return (
    <main style={{ flex: '1 1 0%', minWidth: 0, padding: 'clamp(18px, 2.4vw, 30px) clamp(22px, 4vw, 56px) clamp(56px, 6vw, 96px)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Header card ── */}
        <div className="surface" style={{ padding: '28px 30px' }}>
          <Link href="/deals" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', whiteSpace: 'nowrap', textDecoration: 'none' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            Back to deals
          </Link>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                New deal
              </div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 3.4vw, 34px)', fontWeight: 700, letterSpacing: '-0.025em', margin: '8px 0 0' }}>
                Create an offer for{' '}
                <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400 }}>{firstName}</span>
              </h1>
            </div>
            <div style={{ display: 'flex', gap: 10, flex: '0 0 auto' }}>
              <Link
                href={`/browse/${creatorId}`}
                className="pill"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 42, padding: '0 16px', borderRadius: 11, background: 'var(--card)', border: '1px solid var(--hairline)', boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 8px 16px rgba(22,23,15,.04)', fontWeight: 700, fontSize: 12.5, color: 'var(--ink)', textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                Storefront
              </Link>
              <Link
                href={`/inbox?creator=${creatorId}`}
                className="neonbtn"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 42, padding: '0 18px', borderRadius: 11, background: 'var(--neon, var(--lime-400))', border: 'none', boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, color: 'var(--ink)', textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                Message {firstName}
              </Link>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border-hairline)', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--warning)', boxShadow: '0 0 0 4px color-mix(in oklab, var(--warning) 22%, transparent)' }} />
              Draft
            </span>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              {prefill ? 'Prefilled from the previous deal' : `Prefilled from ${firstName}'s storefront`} &middot; nothing is sent until you create the offer
            </span>
          </div>
        </div>

        {/* ── Progress stepper ── */}
        <div className="surface" style={{ padding: '18px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            {STEPS.map((label, i) => {
              const active = i === 0
              return (
                <div key={label} style={{ position: 'relative', flex: '1 1 0%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
                  <div style={{ position: 'relative', width: '100%', height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {i > 0 && (
                      <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 'calc(50% - 15px)', height: 3, borderRadius: 3, background: 'var(--border-hairline)' }} />
                    )}
                    {i < STEPS.length - 1 && (
                      <span style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 'calc(50% - 15px)', height: 3, borderRadius: 3, background: 'var(--border-hairline)' }} />
                    )}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: active ? 'var(--neon, var(--lime-400))' : 'var(--sec, #F4F8FC)',
                      color: active ? 'var(--ink)' : 'var(--ink-faint)',
                    }}>
                      {active && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ink)' }} />}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 11.5,
                    fontWeight: active ? 700 : 600,
                    whiteSpace: 'nowrap',
                    color: active ? 'var(--ink)' : 'var(--ink-faint)',
                  }}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-hairline)' }}>
            <span />
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
              Next &middot; send to {firstName}
            </span>
          </div>
        </div>

        {/* ── Form ── */}
        <DealForm
          creator={creator}
          products={activeProducts}
          platformFeePercent={effectiveFeePercent}
          feeMode={(brandRow?.fee_mode as 'on_top' | 'deducted') ?? 'on_top'}
          prefill={prefill}
          campaigns={(campaigns ?? []) as { id: string; name: string }[]}
          storefrontSelections={storefrontSelections}
          addonRates={(addonRates ?? []) as never}
        />
      </div>
    </main>
  )
}
