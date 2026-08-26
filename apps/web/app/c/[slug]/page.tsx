import type { Metadata } from 'next'
import { formatProductPrice, normalizePriceMode } from '@/lib/product-price'
import { notFound } from 'next/navigation'
import { getPublicStorefront, getRichStorefront } from './actions'
import PublicStorefront from './PublicStorefront'
import type { ShopfrontData, ShopfrontSection, ContentItem, BrandCollab } from '@/app/creator/storefront/ShopfrontPreview'

// ISR: cached at edge, revalidated every 60 seconds
export const revalidate = 60

interface Props {
  params: { slug: string }
}

interface SocialAccount {
  platform: string
  handle: string
  url: string | null
  follower_count: number | null
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getPublicStorefront(params.slug)
  if (!data) return { title: 'Creator Not Found · Guapd' }

  return {
    title: `${data.display_name} · Guapd`,
    description: data.headline || `${data.display_name} on Guapd`,
    openGraph: {
      title: `${data.display_name} · Guapd`,
      description: data.headline || `${data.display_name} on Guapd`,
      type: 'profile',
    },
  }
}

export default async function CreatorStorefrontRoute({ params }: Props) {
  const rich = await getRichStorefront(params.slug)
  if (!rich) notFound()

  const { storefront, creator, products } = rich
  const socials = (creator.social_accounts ?? []) as SocialAccount[]
  const handle = creator.handle || 'creator'
  const stats = (storefront.stats ?? {}) as StorefrontStats
  const activeProducts = products.filter(p => p.is_active)

  // Build platform stats from social accounts
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

  // Build rate card items from products
  const rateCardItems = activeProducts.map(p => ({
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

  // Auto-hide empty sections
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
    replyTime: stats.reply_time || '~4h',
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

  return <PublicStorefront data={shopfrontData} slug={storefront.slug} creatorId={creator.id} creatorName={storefront.display_name || creator.full_name} />
}
