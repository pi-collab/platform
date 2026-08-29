import type { Metadata } from 'next'
import { getPublicSnapshot } from '@/lib/instagram-sync'
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
  // Stated by the creator, per channel. Nothing here is measured: this codebase
  // has no YouTube or Meta client. Absent means absent, never zero.
  avg_views?: number | null
  interactions?: number | null
  views?: number | null
  watch_time?: string | null
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

  // Per channel, from what the creator actually stated on that channel.
  //
  // These used to read engagement and avgViews off the STOREFRONT stats, so
  // every channel showed the same number, and both fell back to hardcoded
  // figures (6.4% and 340,000) that no code anywhere computed. Every storefront
  // therefore published the same invented pair on the page a brand prices from.
  // A missing number is now missing, and the renderer omits it.
  //
  // The Feb-Jul "reach" series went the same way: it was six hardcoded values,
  // identical on every creator's page, drawn as though it were their trend.
  const allPlatforms = socials
    .filter(s => s.platform === 'instagram' || s.platform === 'youtube')
    .map(s => ({
      platform: s.platform as 'instagram' | 'youtube',
      handle: s.handle || handle,
      followers: s.follower_count ?? null,
      avgViews: s.avg_views ?? null,
      interactions: s.interactions ?? null,
      views: s.views ?? null,
      watchTime: s.watch_time ?? null,
    }))

  // The headline strip is Instagram-led. The audience section below carries
  // a per-channel toggle, so YouTube is reachable there rather than needing a
  // section of its own.
  const primary = allPlatforms.find(p => p.platform === 'instagram') ?? allPlatforms[0] ?? null

  // NOT a sum across channels. Adding Instagram followers to YouTube
  // subscribers produces a number that describes nobody: the same person
  // following both is counted twice, and the two are not the same unit.
  const totalFollowers = primary?.followers ?? null
  const niches = (storefront.categories?.length ? storefront.categories : creator.niches) ?? []
  const workedWith = creator.worked_with ?? []
  const audience = stats.audience ?? {}

  // SNAPSHOT FIRST, typed values second. The creator's own figures are never
  // overwritten: a verified number simply takes precedence while the connection
  // is healthy, and disconnecting reveals what they typed again with nothing to
  // restore. That also means there is no per-field provenance to keep in sync —
  // "verified" is exactly "this came from the snapshot".
  const ig = await getPublicSnapshot(creator.id)
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
    { key: 'audience', label: 'Audience', enabled: Boolean(ig?.topLocations || (audience as Record<string, unknown>).top_locations) },
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
    // Blank, not an invented '~4h'. The other three stats already fall back
    // to '-'; this one asserted a response time nobody measured, on the page
    // a brand decides from.
    replyTime: stats.reply_time || '',
    totalFollowers: ig?.followersCount != null
      ? formatStat(ig.followersCount)
      : totalFollowers != null ? formatStat(totalFollowers) : '',
    // Blank, never a fabricated figure. The renderer hides what is blank.
    interactions: primary?.interactions != null ? formatStat(primary.interactions) : '',
    avgViews: primary?.avgViews != null ? formatStat(primary.avgViews) : '',
    monthlyReach: stats.monthly_reach || '-',
    repeatBrands: stats.repeat_brands || '-',
    avgDealValue: stats.avg_deal_value || '-',
    platforms: allPlatforms,
    audience: {
      ageBreakdown: ig?.ageBreakdown
        ?? (audience as Record<string, unknown>).age_breakdown as { label: string; pct: number }[] | undefined,
      // The verified split reports unknown as its own share rather than folding
      // it into men, which is what dividing by F+M alone would do.
      gender: ig?.gender
        ? { women: ig.gender.womenPct, men: ig.gender.menPct, unknown: ig.gender.unknownPct }
        : (audience as Record<string, unknown>).gender_women != null
          ? { women: (audience as Record<string, unknown>).gender_women as number, men: 100 - ((audience as Record<string, unknown>).gender_women as number) }
          : undefined,
      topLocations: ig?.topLocations
        ?? (audience as Record<string, unknown>).top_locations as { city: string; pct: number }[] | undefined,
    },
    // What a brand may be told is measured. Only ever set from the snapshot.
    verified: ig
      ? {
          followers: ig.followersCount != null,
          audience: Boolean(ig.ageBreakdown || ig.gender || ig.topLocations),
          // Stated because the shopfront has no band under 18, so these
          // percentages describe adult followers.
          adultsOnly: (ig.under18Excluded ?? 0) > 0,
          username: ig.username,
        }
      : undefined,
    contentItems,
    brandCollabs,
    rateCardItems,
    sections,
  }

  return <PublicStorefront data={shopfrontData} slug={storefront.slug} creatorId={creator.id} creatorName={storefront.display_name || creator.full_name} />
}
