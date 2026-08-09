'use server'

import { createClient } from '@/lib/supabase/server'
import { verifyCreator } from '@/lib/creator-auth'
import { revalidatePath } from 'next/cache'

// ── Validation ──────────────────────────────────────────────────────────────

const RESERVED_SLUGS = new Set([
  'api', 'admin', 'app', 'c', 'www', 'help', 'support', 'about',
  'blog', 'pricing', 'terms', 'privacy',
  'auth', 'brand', 'brands', 'browse', 'callback', 'campaigns',
  'creator', 'creators', 'dashboard', 'deals', 'inbox', 'invite',
  'login', 'notifications', 'offer', 'onboarding', 'ops',
  'settings', 'signup', 'test-rls',
])

const ALLOWED_LINK_DOMAINS = new Set([
  'instagram.com', 'www.instagram.com',
  'youtube.com', 'www.youtube.com',
  'twitter.com', 'www.twitter.com', 'x.com', 'www.x.com',
  'linkedin.com', 'www.linkedin.com',
  'tiktok.com', 'www.tiktok.com',
])

const STOREFRONT_BUCKET_PREFIX = 'storefront/'

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    return ALLOWED_LINK_DOMAINS.has(parsed.hostname)
  } catch { return false }
}

function validateStoragePath(path: string): boolean {
  return (
    path.startsWith(STOREFRONT_BUCKET_PREFIX)
    && !path.includes('..')
    && /^storefront\/[a-zA-Z0-9\-_/]+\.[a-zA-Z0-9]+$/.test(path)
  )
}

interface PlatformLink {
  platform: string
  handle: string
  url: string
}

function validatePlatformLinks(links: unknown): links is PlatformLink[] {
  if (!Array.isArray(links) || links.length > 10) return false
  return links.every(
    (l) =>
      typeof l === 'object' && l !== null
      && typeof l.platform === 'string' && l.platform.length <= 30
      && typeof l.handle === 'string' && l.handle.length <= 100
      && typeof l.url === 'string' && validateUrl(l.url)
  )
}

interface ContentItem {
  title: string
  link?: string
  image_path?: string
}

function validateContentItems(items: unknown): items is ContentItem[] {
  if (!Array.isArray(items) || items.length > 20) return false
  return items.every(
    (i) =>
      typeof i === 'object' && i !== null
      && typeof i.title === 'string' && i.title.length <= 200
      && (!i.link || (typeof i.link === 'string' && validateUrl(i.link)))
      && (!i.image_path || (typeof i.image_path === 'string' && validateStoragePath(i.image_path)))
  )
}

interface StorefrontStats {
  followers?: number
  avg_views?: number
  engagement_rate?: number
  // Extended fields stored in stats JSONB
  monthly_reach?: string
  repeat_brands?: string
  avg_deal_value?: string
  reply_time?: string
  booking_open?: boolean
  spots_left?: number
  audience?: unknown
  content_items?: unknown
  brand_collabs?: unknown
}

function validateStats(stats: unknown): stats is StorefrontStats {
  if (typeof stats !== 'object' || stats === null) return false
  const s = stats as Record<string, unknown>

  // Validate numeric fields if present
  if (s.followers !== undefined && s.followers !== null) {
    if (typeof s.followers !== 'number' || s.followers < 0) return false
  }
  if (s.avg_views !== undefined && s.avg_views !== null) {
    if (typeof s.avg_views !== 'number' || s.avg_views < 0) return false
  }
  if (s.engagement_rate !== undefined && s.engagement_rate !== null) {
    if (typeof s.engagement_rate !== 'number' || s.engagement_rate < 0 || s.engagement_rate > 100) return false
  }
  if (s.spots_left !== undefined && s.spots_left !== null) {
    if (typeof s.spots_left !== 'number' || s.spots_left < 0) return false
  }
  return true
}

function validateSlug(slug: string): string | null {
  if (slug.length < 3 || slug.length > 30) {
    return '3\u201330 characters'
  }
  if (/[^a-z0-9-]/.test(slug)) {
    return 'Letters, numbers and hyphens only'
  }
  if (!/^[a-z0-9]/.test(slug) || !/[a-z0-9]$/.test(slug)) {
    return 'Must start and end with a letter or number'
  }
  if (RESERVED_SLUGS.has(slug)) {
    return 'This URL isn\u2019t available'
  }
  return null
}


// ── Get storefront ──────────────────────────────────────────────────────────

export interface StorefrontRow {
  id: string
  slug: string
  display_name: string | null
  headline: string | null
  bio: string | null
  portrait_path: string | null
  categories: string[]
  stats: StorefrontStats
  platform_links: PlatformLink[]
  content_items: ContentItem[]
  show_rates: boolean
  show_past_collabs: boolean
  is_published: boolean
}

export async function getMyStorefront(): Promise<StorefrontRow | null> {
  await verifyCreator()
  const supabase = createClient()

  const { data } = await supabase
    .from('creator_storefronts')
    .select('*')
    .maybeSingle()

  if (!data) return null
  return data as StorefrontRow
}


// ── Upsert storefront ──────────────────────────────────────────────────────

interface UpsertInput {
  slug: string
  display_name?: string
  headline?: string
  bio?: string
  portrait_path?: string
  categories?: string[]
  stats?: unknown
  platform_links?: unknown
  content_items?: unknown
  show_rates?: boolean
  show_past_collabs?: boolean
  is_published?: boolean
}

export async function upsertStorefront(input: UpsertInput) {
  const ctx = await verifyCreator()
  const supabase = createClient()

  // Validate slug
  const slug = input.slug.toLowerCase().trim()
  const slugError = validateSlug(slug)
  if (slugError) return { error: slugError }

  // Validate JSONB fields
  const platformLinks = input.platform_links ?? []
  if (!validatePlatformLinks(platformLinks)) {
    return { error: 'Invalid platform links. Use HTTPS URLs from supported platforms (Instagram, YouTube, Twitter, LinkedIn, TikTok).' }
  }

  const contentItems = input.content_items ?? []
  if (!validateContentItems(contentItems)) {
    return { error: 'Invalid content items. Links must be HTTPS from supported platforms. Image paths must be in the storefront bucket.' }
  }

  const stats = input.stats ?? {}
  if (!validateStats(stats)) {
    return { error: 'Invalid stats. Followers and avg views must be non-negative integers. Engagement rate must be 0-100.' }
  }

  // Validate portrait_path
  if (input.portrait_path && !validateStoragePath(input.portrait_path)) {
    return { error: 'Invalid portrait path. Must be a file in the storefront storage bucket.' }
  }

  // Validate categories
  const categories = (input.categories ?? []).filter((c) => typeof c === 'string' && c.trim().length > 0)
  if (categories.length > 10) {
    return { error: 'Maximum 10 categories allowed.' }
  }

  const row = {
    creator_id: ctx.creatorId,
    slug,
    display_name: input.display_name?.trim() || null,
    headline: input.headline?.trim() || null,
    bio: input.bio?.trim() || null,
    portrait_path: input.portrait_path || null,
    categories,
    stats,
    platform_links: platformLinks,
    content_items: contentItems,
    show_rates: input.show_rates ?? true,
    show_past_collabs: input.show_past_collabs ?? false,
    is_published: input.is_published ?? false,
  }

  // Check if storefront already exists
  const { data: existing } = await supabase
    .from('creator_storefronts')
    .select('id, slug, is_published')
    .maybeSingle()

  let error
  if (existing) {
    // Update — don't change creator_id
    const { error: updateErr } = await supabase
      .from('creator_storefronts')
      .update(row)
      .eq('id', existing.id)
    error = updateErr
  } else {
    // Insert
    const { error: insertErr } = await supabase
      .from('creator_storefronts')
      .insert(row)
    error = insertErr
  }

  if (error) {
    // Handle unique slug violation
    if (error.code === '23505' && error.message.includes('slug')) {
      return { error: 'This slug is already taken. Choose a different one.' }
    }
    return { error: error.message }
  }

  revalidatePath('/creator/storefront')
  revalidatePath(`/c/${slug}`)
  // If slug changed on a published storefront, invalidate the old URL's cache
  if (existing && existing.slug && existing.slug !== slug) {
    revalidatePath(`/c/${existing.slug}`)
  }
  return { success: true }
}


// ── Check slug availability ─────────────────────────────────────────────────

export async function checkSlugAvailable(slug: string): Promise<{ available: boolean; error?: string }> {
  await verifyCreator()

  const normalized = slug.toLowerCase().trim()
  const slugError = validateSlug(normalized)
  if (slugError) return { available: false, error: slugError }

  const supabase = createClient()

  // Check if another creator owns this slug
  const { data: existing } = await supabase
    .from('creator_storefronts')
    .select('id')
    .ilike('slug', normalized)
    .maybeSingle()

  // If it exists, check if it's ours (RLS scopes to own rows only)
  if (existing) {
    const { data: mine } = await supabase
      .from('creator_storefronts')
      .select('id')
      .eq('id', existing.id)
      .maybeSingle()

    if (!mine) return { available: false, error: 'Someone already has this one' }
  }

  return { available: true }
}
