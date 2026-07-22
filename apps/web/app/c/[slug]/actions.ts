'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notifyDealParty } from '@/lib/notifications'

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


// ── Pitch panel: create deal from storefront ─────────────────────────────────
// Requires authentication. Resolves slug → creator_id server-side.
// The anonymous caller never sees creator_id.

interface PitchInput {
  slug: string
  title: string
  deliverables: string
  message?: string
}

export async function createDealFromStorefront(input: PitchInput) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_authenticated' as const }

  // Verify caller is a brand member
  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()
  if (!profile) return { error: 'No user profile found.' }

  const { data: membership } = await supabase
    .from('brand_members')
    .select('brand_id, brands(id, name, brand_status, platform_fee_percent, fee_mode)')
    .eq('user_id', profile.id)
    .maybeSingle()

  if (!membership) return { error: 'Only brand members can send pitches.' }
  const brand = (membership as any).brands
  if (!brand || brand.brand_status !== 'approved') {
    return { error: 'Your brand account is pending approval.' }
  }

  // Resolve slug → creator_id via admin client (bypasses RLS)
  const admin = createAdminClient()
  const { data: storefront } = await admin
    .from('creator_storefronts')
    .select('creator_id')
    .ilike('slug', input.slug)
    .eq('is_published', true)
    .maybeSingle()

  if (!storefront) return { error: 'Creator storefront not found.' }

  // Verify creator is vetted
  const { data: creator } = await admin
    .from('creators')
    .select('id, is_vetted')
    .eq('id', storefront.creator_id)
    .single()

  if (!creator?.is_vetted) return { error: 'This creator is not available for deals.' }

  // Validation
  const title = input.title?.trim()
  const deliverables = input.deliverables?.trim()
  if (!title) return { error: 'Title is required.' }
  if (!deliverables) return { error: 'Deliverables description is required.' }

  // Create the deal via RLS-scoped client
  const { data: deal, error: dealErr } = await supabase
    .from('deals')
    .insert({
      brand_id: brand.id,
      creator_id: creator.id,
      created_by: profile.id,
      status: 'negotiating',
      title,
      deliverables,
      price_paise: 0,
      revision_limit: 1,
      last_offer_by: 'brand',
      fee_percent: brand.platform_fee_percent ?? 0,
      fee_mode: brand.fee_mode ?? 'on_top',
      source: 'storefront',
    })
    .select('id')
    .single()

  if (dealErr) return { error: dealErr.message }

  // Insert pitch message as first thread message
  if (input.message?.trim()) {
    await supabase.from('messages').insert({
      deal_id: deal.id,
      sender_id: profile.id,
      sender_party: 'brand',
      body: input.message.trim(),
    })
  }

  // Notify creator
  notifyDealParty(deal.id, 'creator', 'offer_sent', (t) => `New pitch from storefront: ${t}`)

  revalidatePath('/deals')
  return { success: true, dealId: deal.id }
}
