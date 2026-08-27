import { createClient } from '@/lib/supabase/server'
import { formatProductPrice, normalizePriceMode } from '@/lib/product-price'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyBrand } from '@/lib/brand-auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import BrowseStorefront from './BrowseStorefront'
import type { ShopfrontData, ShopfrontSection, ContentItem, BrandCollab } from '@/app/creator/storefront/ShopfrontPreview'

interface SocialAccount {
  platform: string
  handle: string
  url: string | null
  follower_count: number | null
  verified: boolean
}

interface Product {
  id: string
  platform: string
  handle: string
  product_type: string
  description: string | null
  price_paise: number
  display_price: boolean
  is_active: boolean
  included_revisions: number
  price_per_extra_revision_paise: number
}

interface StorefrontStats {
  followers?: number
  avg_views?: number
  engagement_rate?: number
  monthly_reach?: string
  repeat_brands?: string
  avg_deal_value?: string
  reply_time?: string
  booking_open?: boolean
  spots_left?: number
  audience?: {
    age_breakdown?: { label: string; pct: number }[]
    gender_women?: number
    top_locations?: { city: string; pct: number }[]
  }
  content_items?: ContentItem[]
  brand_collabs?: BrandCollab[]
}

function formatStat(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return n.toString()
}

function formatPaise(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(1)}L`
  if (rupees >= 1_000) return `₹${Math.round(rupees / 1_000)}K`
  return `₹${rupees.toLocaleString('en-IN')}`
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default async function CreatorProfilePage({ params }: { params: { id: string } }) {
  const brand = await verifyBrand()
  const supabase = createClient()
  const admin = createAdminClient()

  const [{ data: creator, error }, { data: products }, { data: lastDeal }, { data: storefront }] = await Promise.all([
    supabase
      .from('creators')
      .select('id, full_name, niches, handle, bio, profile_photo_url, social_accounts, worked_with, is_vetted')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('creator_products')
      .select('id, platform, handle, product_type, description, price_paise, price_mode, price_max_paise, display_price, is_active, included_revisions, price_per_extra_revision_paise')
      .eq('creator_id', params.id),
    supabase
      .from('deals')
      .select('id')
      .eq('brand_id', brand.brandId)
      .eq('creator_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // RLS blocks brand reads on storefronts — use admin
    admin
      .from('creator_storefronts')
      .select('*')
      .eq('creator_id', params.id)
      .eq('is_published', true)
      .maybeSingle(),
  ])

  if (error || !creator) notFound()

  const socials = (creator.social_accounts ?? []) as SocialAccount[]
  const activeProducts = (products ?? []).filter((p: Product) => p.is_active)
  const handle = creator.handle || 'creator'
  const dealUrl = `/deals/new?creator=${creator.id}`

  // ── Storefront view (ShopfrontPreview) ──
  if (storefront) {
    const stats = (storefront.stats ?? {}) as StorefrontStats

    const rateCardItems = activeProducts.map((p: Product) => ({
      key: p.id, name: p.product_type, desc: p.description || '',
      pricePaise: p.price_paise, platform: p.platform, handle: p.handle,
        // Mode travels with the number so the shopfront can print "From ₹60,000"
        // and keep an on-request line out of the running total.
        priceLabel: formatProductPrice(p),
        countsToward: normalizePriceMode(p) !== 'on_request',
        approximate: normalizePriceMode(p) === 'from' || normalizePriceMode(p) === 'range',
    }))
    if (rateCardItems.length === 0) {
      rateCardItems.push(
        { key: 'reel', name: 'Instagram Reel', desc: 'Per reel, feed-posted', pricePaise: 6000000, platform: 'instagram', handle , priceLabel: formatProductPrice({ price_paise: 6000000 }), countsToward: true, approximate: false },
        { key: 'story', name: 'Instagram Story', desc: 'Per story, with link sticker', pricePaise: 2500000, platform: 'instagram', handle , priceLabel: formatProductPrice({ price_paise: 2500000 }), countsToward: true, approximate: false },
      )
    }

    const platforms = socials
      .filter(s => s.platform === 'instagram' || s.platform === 'youtube')
      .map(s => ({
        platform: s.platform as 'instagram' | 'youtube',
        handle: s.handle || handle,
        followers: s.follower_count || 0,
        engagement: stats.engagement_rate || 6.4,
        avgViews: stats.avg_views || 0,
        reachData: [
          { month: 'Feb', value: 210000 }, { month: 'Mar', value: 260000 },
          { month: 'Apr', value: 235000 }, { month: 'May', value: 300000 },
          { month: 'Jun', value: 355000 }, { month: 'Jul', value: 428000 },
        ],
      }))
    if (platforms.length === 0) {
      platforms.push({
        platform: 'instagram' as const, handle,
        followers: stats.followers || 500000,
        engagement: stats.engagement_rate || 6.4,
        avgViews: stats.avg_views || 340000,
        reachData: [
          { month: 'Feb', value: 210000 }, { month: 'Mar', value: 260000 },
          { month: 'Apr', value: 235000 }, { month: 'May', value: 300000 },
          { month: 'Jun', value: 355000 }, { month: 'Jul', value: 428000 },
        ],
      })
    }

    const totalFollowers = stats.followers || platforms.reduce((s, p) => s + p.followers, 0)
    const niches = (storefront.categories?.length ? storefront.categories : creator.niches) ?? []
    const workedWith = creator.worked_with ?? []
    const audience = stats.audience ?? {}
    const contentItems = (stats.content_items ?? []) as ContentItem[]
    const brandCollabs = (stats.brand_collabs ?? workedWith.map((b: string) => ({ name: b, type: 'Reel + Stories', views: '', engagement: '' }))) as BrandCollab[]

    const sections: ShopfrontSection[] = [
      { key: 'hero', label: 'Hero', enabled: true },
      { key: 'stats', label: 'Stats Strip', enabled: true },
      { key: 'ratecard', label: 'Rate Card', enabled: activeProducts.length > 0 },
      { key: 'audience', label: 'Audience', enabled: !!(audience as Record<string, unknown>).top_locations },
      { key: 'content', label: 'Content Showcase', enabled: contentItems.some(i => i.title?.trim()) },
      { key: 'collabs', label: 'Past Collaborations', enabled: brandCollabs.some(c => c.name?.trim()) },
      { key: 'pitch', label: 'Work With Me', enabled: true },
    ]

    const shopfrontData: ShopfrontData = {
      creatorName: storefront.display_name || creator.full_name,
      handle,
      slug: storefront.slug,
      bio: storefront.bio || creator.bio || '',
      profilePhotoUrl: creator.profile_photo_url,
      niches: niches.length > 0 ? niches : ['Creator'],
      isVerified: creator.is_vetted ?? false,
      // Blank, not an invented '~4h'. See /c/[slug]: an unmeasured response
      // time must not be stated as fact to a brand.
      replyTime: stats.reply_time || '',
      totalFollowers: formatStat(totalFollowers),
      engagementRate: `${stats.engagement_rate || 6.4}%`,
      avgViews: formatStat(stats.avg_views || 340000),
      monthlyReach: stats.monthly_reach || '-',
      repeatBrands: stats.repeat_brands || '-',
      avgDealValue: stats.avg_deal_value || '-',
      platforms,
      audience: {
        ageBreakdown: (audience as Record<string, unknown>).age_breakdown as { label: string; pct: number }[] | undefined,
        gender: (audience as Record<string, unknown>).gender_women != null
          ? { women: (audience as Record<string, unknown>).gender_women as number, men: 100 - ((audience as Record<string, unknown>).gender_women as number) }
          : undefined,
        topLocations: (audience as Record<string, unknown>).top_locations as { city: string; pct: number }[] | undefined,
      },
      contentItems,
      brandCollabs,
      rateCardItems,
      sections,
    }

    return (
      <BrowseStorefront
        data={shopfrontData}
        creatorId={creator.id}
        creatorSlug={storefront.slug}
        lastDealId={lastDeal?.id}
      />
    )
  }

  // ── Basic profile view (no storefront) ──
  const followers = Math.max(0, ...socials.map(s => s.follower_count ?? 0))
  const niches = creator.niches ?? []
  const workedWith = creator.worked_with ?? []

  return (
    <main style={{ flex: '1 1 0%', minWidth: 0, padding: 'clamp(18px,2.4vw,30px) clamp(22px,4vw,56px) clamp(56px,6vw,96px)' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Back link */}
        <Link href="/browse" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', textDecoration: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          Browse creators
        </Link>

        {/* Profile card */}
        <div className="surface" style={{ padding: '32px 36px' }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Avatar */}
            <div style={{
              width: 72, height: 72, borderRadius: 18, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22,
              color: 'var(--ink-soft)', overflow: 'hidden',
              background: creator.profile_photo_url ? 'none' : 'linear-gradient(150deg, #EEF6FD 0%, #F4F0FF 100%)',
              border: '1px solid var(--frost-edge)',
            }}>
              {creator.profile_photo_url ? (
                <img src={creator.profile_photo_url} alt={creator.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : getInitials(creator.full_name)}
            </div>

            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', margin: 0 }}>
                  {creator.full_name}
                </h1>
                {creator.is_vetted && (
                  <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" fill="var(--neon-deep)" />
                    <path d="m7.5 12 2.8 2.8L16.5 8.6" fill="none" stroke="var(--card)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>

              {/* Social handles */}
              {socials.length > 0 && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                  {socials.filter(s => s.platform === 'instagram' || s.platform === 'youtube').map(s => (
                    <a
                      key={`${s.platform}-${s.handle}`}
                      href={s.url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px', borderRadius: 8,
                        background: 'var(--sec)', fontSize: 12, fontWeight: 600,
                        color: 'var(--ink-soft)', textDecoration: 'none',
                      }}
                    >
                      {s.platform === 'instagram' ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9.5 5 2.5-5 2.5z" /></svg>
                      )}
                      @{(s.handle || '').replace(/^@/, '')}
                    </a>
                  ))}
                </div>
              )}

              {/* Niches */}
              {niches.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  {niches.map((n: string) => (
                    <span key={n} style={{
                      padding: '3px 10px', borderRadius: 999,
                      background: 'rgba(232,255,102,.3)', fontSize: 11, fontWeight: 500, color: 'var(--ink)',
                    }}>{n}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {lastDeal && (
                <Link href={`/deals/new?from=${lastDeal.id}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 16px', borderRadius: 11,
                  background: 'var(--card)', border: '1px solid var(--hairline)',
                  fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5,
                  color: 'var(--ink)', textDecoration: 'none',
                }}>
                  Re-engage
                </Link>
              )}
              <Link href={dealUrl} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 20px', borderRadius: 11,
                background: 'var(--neon)', border: 'none',
                fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5,
                color: 'var(--ink)', textDecoration: 'none',
                boxShadow: '0 8px 18px -12px rgba(40,45,25,.5)',
              }}>
                Start a deal
              </Link>
            </div>
          </div>

          {/* Bio */}
          {creator.bio && (
            <p style={{ color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.6, marginTop: 20, whiteSpace: 'pre-wrap' }}>
              {creator.bio}
            </p>
          )}

          {/* Stats row */}
          <div style={{
            display: 'flex', gap: 32, marginTop: 24, paddingTop: 20,
            borderTop: '1px solid var(--border-hairline)', flexWrap: 'wrap',
          }}>
            {followers > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20 }}>{formatStat(followers)}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-faint)', fontWeight: 600, marginTop: 3 }}>Followers</div>
              </div>
            )}
            {workedWith.length > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20 }}>{workedWith.length}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-faint)', fontWeight: 600, marginTop: 3 }}>Brands worked with</div>
              </div>
            )}
          </div>
        </div>

        {/* Rate card */}
        {activeProducts.length > 0 && (
          <div className="surface" style={{ padding: '28px 36px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, margin: '0 0 16px' }}>Rate Card</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              {activeProducts.map((p: Product) => (
                <div key={p.id} style={{
                  padding: '16px 18px', borderRadius: 14,
                  background: 'var(--sec)', border: '1px solid var(--border-hairline)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-faint)', fontWeight: 600 }}>
                    {p.platform === 'instagram' ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9.5 5 2.5-5 2.5z" /></svg>
                    )}
                    {p.product_type}
                  </div>
                  {p.description && (
                    <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 6 }}>{p.description}</div>
                  )}
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginTop: 8 }}>
                    {p.display_price ? formatPaise(p.price_paise) : 'On request'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Worked with */}
        {workedWith.length > 0 && (
          <div className="surface" style={{ padding: '28px 36px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, margin: '0 0 12px' }}>Worked with</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {workedWith.map((b: string) => (
                <span key={b} style={{
                  padding: '5px 12px', borderRadius: 999,
                  background: 'var(--sec)', border: '1px solid var(--border-hairline)',
                  fontSize: 13, fontWeight: 500, color: 'var(--ink)',
                }}>{b}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
