'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCreator } from '@/lib/creator-auth'
import { revalidatePath } from 'next/cache'
import { resyncForCreator, listReelCandidates, syncFeaturedReels, MAX_FEATURED_REELS } from '@/lib/instagram-sync'

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

/** What a creator can state about one channel. Every field optional: the whole
 *  section is optional, and a blank must stay blank rather than becoming 0. */
export interface ChannelStatsInput {
  platform: string
  handle: string
  /** Followers, or subscribers on YouTube. */
  followers?: number | null
  /** Instagram only. */
  avgViews?: number | null
  /** Instagram only, and a COUNT, not a rate. */
  interactions?: number | null
  /** YouTube only: total views in the window, not an average. */
  views?: number | null
  /** YouTube only. Free text: creators read watch time as "1.2K hours". */
  watchTime?: string | null
}

/**
 * Per-channel numbers, stated by the creator.
 *
 * They live in creators.social_accounts — a JSONB array the editor has always
 * READ (the audience section renders them) and never let anyone write. So a
 * creator could see "0 followers" on their own shopfront with no way to correct
 * it short of asking ops.
 *
 * Merged into the existing entries rather than replacing the array: handles and
 * platforms are owned by the profile screen, and rewriting the whole array here
 * would let a stale editor tab undo a handle changed elsewhere.
 *
 * NOTHING here is measured. There is no YouTube or Meta integration in this
 * codebase — no client, no credentials — so every one of these is self-reported
 * and must be treated as a claim, never presented as a platform-verified figure.
 * A future integration would fill these same fields per channel, which is why
 * they live here rather than on the storefront row.
 *
 * A null CLEARS the field. Undefined leaves it alone. That distinction is what
 * lets a creator empty a number they no longer stand behind, instead of being
 * stuck with whatever they first typed.
 */
export async function saveChannelStats(
  counts: ChannelStatsInput[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await verifyCreator()
  const admin = createAdminClient()

  const { data: creator } = await admin
    .from('creators')
    .select('social_accounts')
    .eq('id', ctx.creatorId)
    .maybeSingle()

  const existing = (creator?.social_accounts ?? []) as Array<Record<string, unknown>>
  if (existing.length === 0) return { ok: false, message: 'Add a channel first.' }

  const key = (p: unknown, h: unknown) =>
    `${String(p ?? '').trim().toLowerCase()}|${String(h ?? '').trim().replace(/^@/, '').toLowerCase()}`

  const wanted = new Map(counts.map(c => [key(c.platform, c.handle), c]))

  // A whole, non-negative number. The cap is a typo guard: nobody has 10 billion
  // of anything here, and a slipped digit published on a shopfront is worse than
  // a rejected save. Returns undefined for "leave alone", null for "clear".
  const count = (v: number | null | undefined): number | null | undefined => {
    if (v === undefined) return undefined
    if (v === null) return null
    if (!Number.isFinite(v) || v < 0 || v > 10_000_000_000) return undefined
    return Math.round(v)
  }

  const merged = existing.map(a => {
    const want = wanted.get(key(a.platform, a.handle))
    if (!want) return a
    const next: Record<string, unknown> = { ...a }
    const put = (field: string, v: number | string | null | undefined) => {
      if (v === undefined) return
      if (v === null) { delete next[field]; return }
      next[field] = v
    }
    put('follower_count', count(want.followers))
    put('avg_views', count(want.avgViews))
    put('interactions', count(want.interactions))
    put('views', count(want.views))
    // Free text: a creator reads watch time as "1.2K hours", and parsing that
    // into a number here would only have to be formatted back for display.
    put('watch_time',
      want.watchTime === undefined ? undefined
        : want.watchTime === null ? null
          : String(want.watchTime).trim().slice(0, 16) || null)
    return next
  })

  const { error } = await admin
    .from('creators')
    .update({ social_accounts: merged })
    .eq('id', ctx.creatorId)

  if (error) {
    console.error(`[storefront] follower save failed creator=${ctx.creatorId}: ${error.message}`)
    return { ok: false, message: 'Could not save that. Please try again.' }
  }

  revalidatePath('/creator/storefront')
  return { ok: true }
}

/** @deprecated Use saveChannelStats. Kept so any caller not yet migrated keeps
 *  working rather than silently writing nothing. */
export async function saveFollowerCounts(
  counts: { platform: string; handle: string; followers: number }[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  return saveChannelStats(counts)
}

/* ── Content showcase media ──────────────────────────────────────────────────
   A creator can already paste a link to a reel. That link is the destination,
   not the picture: Instagram and YouTube will not let us render a thumbnail
   from a URL without their APIs, so a card with only a link has nothing to
   show. This uploads the still or the clip itself.

   The FILE DOES NOT PASS THROUGH THIS SERVER. We hand the browser a signed
   upload URL and it PUTs straight to storage. A server action buffers its whole
   body in memory before the handler runs, which is why next.config caps them at
   6 MB — routing a 50 MB clip through one would either be refused at that cap
   or hold 50 MB of server memory per concurrent upload. Signing costs one round
   trip and moves the bytes off our critical path entirely.

   Same bucket as avatars ('storefronts'), which is public — correct here,
   because these end up on a shopfront that brands open without logging in.
   Migration 0481 widened it to accept video; before that it was image-only at
   5 MB, so no application-side limit could have made a clip work.
   ────────────────────────────────────────────────────────────────────────── */

const CONTENT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const CONTENT_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm'])

const MAX_CONTENT_IMAGE = 5 * 1024 * 1024    // 5 MB
// The bucket allows 50 MB and Supabase's free plan refuses more than that at the
// platform level regardless. Raising this alone would only move the failure.
const MAX_CONTENT_VIDEO = 50 * 1024 * 1024   // 50 MB

export async function createContentUploadUrl(
  input: { contentType: string; size: number; ext?: string },
): Promise<{ path: string; token: string; publicUrl: string } | { error: string }> {
  const { creatorId } = await verifyCreator()

  const isImage = CONTENT_IMAGE_TYPES.has(input.contentType)
  const isVideo = CONTENT_VIDEO_TYPES.has(input.contentType)
  if (!isImage && !isVideo) {
    return { error: 'Use a JPEG, PNG, WebP or GIF image, or an MP4, MOV or WebM video.' }
  }

  const limit = isVideo ? MAX_CONTENT_VIDEO : MAX_CONTENT_IMAGE
  if (!Number.isFinite(input.size) || input.size <= 0) return { error: 'That file looks empty.' }
  if (input.size > limit) {
    return { error: `That file is ${(input.size / 1024 / 1024).toFixed(1)} MB. The limit is ${limit / 1024 / 1024} MB.` }
  }

  // A fresh name per upload rather than one keyed to the item's position:
  // positions change when a creator reorders their showcase, and an upsert onto
  // a reused path would silently repoint an item that was never touched.
  const rawExt = (input.ext ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)
  const ext = rawExt || (isVideo ? 'mp4' : 'jpg')
  const storagePath = `content/${creatorId}/${crypto.randomUUID()}.${ext}`

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from('storefronts')
    .createSignedUploadUrl(storagePath)

  if (error || !data) {
    console.error('[content-media] Signing failed:', error?.message)
    return { error: 'Could not start the upload. Please try again.' }
  }

  const { data: pub } = admin.storage.from('storefronts').getPublicUrl(storagePath)
  return { path: data.path, token: data.token, publicUrl: pub.publicUrl }
}

/**
 * Refresh the Instagram figures from the editor.
 *
 * The same action settings offers, placed where a creator is actually looking at
 * the numbers. Both call resyncForCreator, so there is one path that refreshes a
 * connection rather than two that can drift.
 *
 * The public page is revalidated too: a creator who syncs here is usually about
 * to look at what a brand sees, and a 60 second ISR window is long enough to
 * make a working refresh look broken.
 */
export async function syncInstagram(): Promise<{ ok: boolean; message?: string }> {
  const ctx = await verifyCreator()
  const result = await resyncForCreator(ctx.creatorId)

  if (result.detail === 'not connected') {
    return { ok: false, message: 'Instagram is not connected.' }
  }

  revalidatePath('/creator/storefront')
  revalidatePath('/creator/settings')

  const { data: sf } = await createAdminClient()
    .from('creator_storefronts')
    .select('slug')
    .eq('creator_id', ctx.creatorId)
    .maybeSingle()
  if (sf?.slug) revalidatePath(`/c/${sf.slug}`)

  // The detail is shown rather than swallowed. "personal account" and "expired"
  // are things the creator can act on, and a generic failure leaves them
  // pressing the button again.
  if (!result.ok) return { ok: false, message: `Could not sync: ${result.detail}.` }
  return { ok: true }
}

/* ── Brand logos ────────────────────────────────────────────────────────────
   Two ways to get one, because neither alone is enough: the auto-fetch is
   favicon-grade and sometimes wrong, and asking every creator to find a PNG for
   every brand they have worked with is how the section stays empty.
   ────────────────────────────────────────────────────────────────────────── */

const LOGO_BUCKET = 'storefronts'
const MAX_LOGO_BYTES = 2 * 1024 * 1024

/** A hostname, or null. Rejects schemes, paths, ports and anything that is not
 *  a plain dotted name — it is interpolated into a URL, so it is validated
 *  before it goes anywhere near one. */
function toDomain(input: string): string | null {
  const t = input.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '')
  return /^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+$/.test(t) && t.length <= 80 ? t : null
}

/** Domains worth trying for a brand NAME. Indian brands are as likely to be .in
 *  as .com, and trying both costs one extra request that 404s fast. */
function guessDomains(name: string): string[] {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  if (slug.length < 2) return []
  return [`${slug}.com`, `${slug}.in`]
}

/**
 * Fetch a brand mark, server-side, and store it as ours.
 *
 * Clearbit is gone — the domain no longer resolves — so these are FAVICON
 * services. They return a small square mark rather than a wordmark, which is why
 * the tile renders it at natural size and never upscales it.
 *
 * A 404 is the match test. Both services answer 404 for a domain that does not
 * exist rather than serving a generic placeholder, so an unknown brand fails
 * cleanly instead of quietly attaching a globe to somebody's storefront.
 *
 * Fixed hosts, with the domain as a parameter: we never fetch the brand's own
 * site, so there is no request to a user-controlled address and no SSRF surface.
 * The bytes are then copied into our bucket, so nothing hotlinks a third party
 * and no visitor's IP is handed to Google.
 */
export async function findBrandLogo(input: string): Promise<
  { ok: true; url: string; domain: string } | { ok: false; message: string }
> {
  const ctx = await verifyCreator()

  const raw = (input ?? '').trim().slice(0, 80)
  if (!raw) return { ok: false, message: 'Enter a brand name or website first.' }

  const explicit = toDomain(raw)
  const candidates = explicit ? [explicit] : guessDomains(raw)
  if (candidates.length === 0) return { ok: false, message: 'That does not look like a brand name or website.' }

  for (const domain of candidates) {
    for (const url of [
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`,
    ]) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
        if (!res.ok) continue

        const contentType = res.headers.get('content-type') ?? ''
        if (!contentType.startsWith('image/')) continue

        const bytes = new Uint8Array(await res.arrayBuffer())
        if (bytes.byteLength < 100 || bytes.byteLength > MAX_LOGO_BYTES) continue

        const ext = contentType.includes('png') ? 'png'
          : contentType.includes('svg') ? 'svg'
            : contentType.includes('jpeg') ? 'jpg' : 'ico'
        const path = `collab-logos/${ctx.creatorId}/${domain.replace(/[^a-z0-9]/g, '-')}.${ext}`

        const admin = createAdminClient()
        const { error } = await admin.storage
          .from(LOGO_BUCKET)
          .upload(path, bytes, { upsert: true, contentType })
        if (error) continue

        const { data } = admin.storage.from(LOGO_BUCKET).getPublicUrl(path)
        return { ok: true, url: `${data.publicUrl}?v=${Date.now()}`, domain }
      } catch {
        // A timeout or a network blip on one source is not a failure of the
        // feature; the next candidate is tried.
        continue
      }
    }
  }

  return {
    ok: false,
    message: explicit
      ? `Nothing found for ${explicit}. Upload the logo instead.`
      : 'Could not find that one. Try the website address, or upload the logo.',
  }
}

/** Manual upload: the path that always works, and the one that produces a good
 *  tile, since an uploaded logo can fill it and a favicon cannot. */
export async function uploadBrandLogo(formData: FormData): Promise<
  { ok: true; url: string } | { ok: false; message: string }
> {
  const ctx = await verifyCreator()

  const file = formData.get('file') as File | null
  const key = String(formData.get('key') ?? '').replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 40)
  if (!file) return { ok: false, message: 'No file chosen.' }
  if (!key) return { ok: false, message: 'Add the brand name first.' }

  if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
    return { ok: false, message: 'PNG, JPEG, WebP or SVG only.' }
  }
  if (file.size > MAX_LOGO_BYTES) return { ok: false, message: 'That file is over 2 MB.' }

  const ext = file.type.includes('png') ? 'png'
    : file.type.includes('svg') ? 'svg'
      : file.type.includes('webp') ? 'webp' : 'jpg'
  const path = `collab-logos/${ctx.creatorId}/${key}.${ext}`

  const admin = createAdminClient()
  const { error } = await admin.storage
    .from(LOGO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (error) {
    console.error(`[storefront] brand logo upload failed creator=${ctx.creatorId}: ${error.message}`)
    return { ok: false, message: 'Upload failed. Please try again.' }
  }

  const { data } = admin.storage.from(LOGO_BUCKET).getPublicUrl(path)
  // Same version stamp as the avatar: the path is stable across replacements, so
  // without it a new logo serves the old bytes from cache.
  return { ok: true, url: `${data.publicUrl}?v=${Date.now()}` }
}

/* ── Featured reels ─────────────────────────────────────────────────────────
   Which of their own reels a creator puts on the shopfront. Curated, not
   chronological: an automatic strip of latest posts shows whatever they last
   made, which is not the same as their best work.
   ────────────────────────────────────────────────────────────────────────── */

export interface ReelCandidate {
  id: string
  permalink: string
  timestamp: string
  caption?: string
  thumbnailUrl?: string
  likeCount?: number
  commentsCount?: number
}

/** Their reels, fetched live for the picker. Thumbnails are Instagram's own
 *  CDN URLs, used only on this private screen and never stored. */
export async function listMyReels(): Promise<{ ok: true; reels: ReelCandidate[] } | { ok: false; message: string }> {
  const ctx = await verifyCreator()
  const reels = await listReelCandidates(ctx.creatorId)

  if (reels.length === 0) {
    return { ok: false, message: 'No reels found on your connected account. Connect Instagram, or post a reel first.' }
  }

  return {
    ok: true,
    reels: reels.map(r => ({
      id: r.id,
      permalink: r.permalink,
      timestamp: r.timestamp,
      caption: r.caption,
      thumbnailUrl: r.thumbnailSourceUrl,
      likeCount: r.likeCount,
      commentsCount: r.commentsCount,
    })),
  }
}

/**
 * Save the selection.
 *
 * Stores IDS only. The reels themselves are resolved by id on every sync, so a
 * featured pick stays current and cannot go stale against a cached copy.
 */
export async function saveFeaturedReels(ids: string[]): Promise<{ ok: boolean; message?: string }> {
  const ctx = await verifyCreator()
  const admin = createAdminClient()

  const clean = Array.from(new Set(ids.filter(id => /^\d{5,32}$/.test(id)))).slice(0, MAX_FEATURED_REELS)

  const { data: sf } = await admin
    .from('creator_storefronts')
    .select('id, slug, stats')
    .eq('creator_id', ctx.creatorId)
    .maybeSingle()

  if (!sf) return { ok: false, message: 'Create your shopfront first.' }

  // Merged into stats, never assigned over it: that object carries keys written
  // by several steps of this editor and replacing it would drop the others.
  const stats = { ...((sf.stats ?? {}) as Record<string, unknown>), featured_reel_ids: clean }

  const { error } = await admin.from('creator_storefronts').update({ stats }).eq('id', sf.id)
  if (error) return { ok: false, message: 'Could not save that. Please try again.' }

  // Resolve immediately so the shopfront shows the choice now rather than after
  // tonight's cron.
  await syncFeaturedReels(ctx.creatorId).catch(() => {})

  revalidatePath('/creator/storefront')
  if (sf.slug) revalidatePath(`/c/${sf.slug}`)
  return { ok: true }
}
