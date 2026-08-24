'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// ── Public storefront fetch ──────────────────────────────────────────────────
// Uses the SECURITY DEFINER function — returns whitelisted JSON only.
// Safe for anonymous callers.

export interface StorefrontData {
  slug: string
  display_name: string
  headline: string | null
  bio: string | null
  portrait_path: string | null
  categories: string[]
  stats: {
    followers?: number
    avg_views?: number
    engagement_rate?: number
  }
  platform_links: {
    platform: string
    handle: string
    url: string
  }[]
  content_items: {
    title: string
    link?: string
    image_path?: string
  }[]
  packages?: {
    platform: string
    product_type: string
    description: string | null
    price_paise: number
  }[]
  past_collabs?: {
    brand_name: string
  }[]
}

export async function getPublicStorefront(slug: string): Promise<StorefrontData | null> {
  // Validate slug format before hitting DB
  if (!/^[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]$/.test(slug.toLowerCase())) {
    return null
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('get_public_storefront', { p_slug: slug })

  if (error || !data) return null
  return data as StorefrontData
}


// ── Rich storefront fetch (for ShopfrontPreview) ────────────────────────────

export interface RichStorefrontData {
  storefront: {
    slug: string
    display_name: string | null
    headline: string | null
    bio: string | null
    categories: string[]
    stats: Record<string, unknown>
    is_published: boolean
  }
  creator: {
    id: string
    full_name: string
    handle: string | null
    bio: string | null
    niches: string[] | null
    profile_photo_url: string | null
    social_accounts: unknown
    worked_with: string[] | null
    is_vetted: boolean
  }
  products: {
    id: string
    platform: string
    handle: string
    product_type: string
    description: string | null
    price_paise: number
    is_active: boolean
  }[]
}

export async function getRichStorefront(slug: string): Promise<RichStorefrontData | null> {
  if (!/^[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]$/.test(slug.toLowerCase())) {
    return null
  }

  const admin = createAdminClient()

  const { data: sf } = await admin
    .from('creator_storefronts')
    .select('slug, display_name, headline, bio, categories, stats, is_published, creator_id')
    .ilike('slug', slug)
    .eq('is_published', true)
    .maybeSingle()

  if (!sf) return null

  const [{ data: creator }, { data: products }] = await Promise.all([
    admin
      .from('creators')
      .select('id, full_name, handle, bio, niches, profile_photo_url, social_accounts, worked_with, is_vetted')
      .eq('id', sf.creator_id)
      .single(),
    admin
      .from('creator_products')
      .select('id, platform, handle, product_type, description, price_paise, price_mode, price_max_paise, is_active')
      .eq('creator_id', sf.creator_id)
      .eq('is_active', true),
  ])

  if (!creator) return null

  return {
    storefront: {
      slug: sf.slug,
      display_name: sf.display_name,
      headline: sf.headline,
      bio: sf.bio,
      categories: sf.categories ?? [],
      stats: (sf.stats ?? {}) as Record<string, unknown>,
      is_published: sf.is_published,
    },
    creator,
    products: products ?? [],
  }
}

// ── Pitch panel: create deal from storefront ─────────────────────────────────
// Requires authentication. Resolves slug → creator_id server-side.
// The anonymous caller never sees creator_id.
