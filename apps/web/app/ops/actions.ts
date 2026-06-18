'use server'

import { verifyOpsAccess } from '@/lib/ops-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ── Add creator ──────────────────────────────────────────────────────────────

interface SocialAccountEntry {
  platform: string
  handle: string
  url: string | null
  follower_count: number | null
  verified: boolean
}

interface AddCreatorInput {
  full_name: string
  phone?: string
  niches?: string[]
  handle?: string
  bio?: string
  profile_photo_url?: string
  social_accounts?: SocialAccountEntry[]
  worked_with?: string[]
  portfolio_links?: string[]
  rate_card?: Record<string, number> // values already in paise
}

const VALID_PLATFORMS = new Set(['instagram', 'youtube', 'twitter', 'linkedin', 'other'])

function isValidUrl(s: string): boolean {
  return s.startsWith('http://') || s.startsWith('https://')
}

export async function addCreator(input: AddCreatorInput) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const { full_name, phone, niches, handle, bio, profile_photo_url, social_accounts, worked_with, portfolio_links, rate_card } = input
  if (!full_name.trim()) return { error: 'Full name is required' }

  // Validate profile_photo_url
  if (profile_photo_url && !isValidUrl(profile_photo_url)) {
    return { error: 'Profile photo URL must start with http:// or https://' }
  }

  // Validate social_accounts
  if (social_accounts) {
    for (let i = 0; i < social_accounts.length; i++) {
      const sa = social_accounts[i]
      if (!VALID_PLATFORMS.has(sa.platform)) {
        return { error: `Social account ${i + 1}: invalid platform "${sa.platform}"` }
      }
      if (sa.follower_count !== null && (sa.follower_count < 0 || !Number.isInteger(sa.follower_count))) {
        return { error: `Social account ${i + 1}: follower count must be a non-negative integer` }
      }
      if (sa.url && !isValidUrl(sa.url)) {
        return { error: `Social account ${i + 1}: URL must start with http:// or https://` }
      }
    }
  }

  // Validate portfolio_links
  if (portfolio_links) {
    for (let i = 0; i < portfolio_links.length; i++) {
      if (!isValidUrl(portfolio_links[i])) {
        return { error: `Portfolio link ${i + 1}: must start with http:// or https://` }
      }
    }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('creators').insert({
    full_name: full_name.trim(),
    phone: phone?.trim() || null,
    niches: niches ?? [],
    handle: handle?.trim() || null,
    bio: bio?.trim() || null,
    profile_photo_url: profile_photo_url?.trim() || null,
    social_accounts: social_accounts ?? [],
    worked_with: worked_with ?? [],
    portfolio_links: portfolio_links ?? [],
    rate_card: rate_card ?? {},
    is_vetted: false,
  })

  if (error) return { error: error.message }

  revalidatePath('/ops/creators')
  return { success: true }
}

// ── Vet (approve) creator ────────────────────────────────────────────────────

export async function vetCreator(creatorId: string) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('creators')
    .update({ is_vetted: true })
    .eq('id', creatorId)

  if (error) return { error: error.message }

  revalidatePath('/ops/creators')
  return { success: true }
}

// ── Reject creator (soft-reject — keeps the row) ────────────────────────────

export async function rejectCreator(creatorId: string) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('creators')
    .update({ is_vetted: false })
    .eq('id', creatorId)

  if (error) return { error: error.message }

  revalidatePath('/ops/creators')
  return { success: true }
}

// ── Edit creator ─────────────────────────────────────────────────────────────

interface EditCreatorInput {
  id: string
  full_name: string
  phone?: string
  niches?: string[]
  handle?: string
  bio?: string
  profile_photo_url?: string
  social_accounts?: SocialAccountEntry[]
  worked_with?: string[]
  portfolio_links?: string[]
  rate_card?: Record<string, number>
}

export async function editCreator(input: EditCreatorInput) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const { id, full_name, phone, niches, handle, bio, profile_photo_url, social_accounts, worked_with, portfolio_links, rate_card } = input
  if (!full_name.trim()) return { error: 'Full name is required' }

  if (profile_photo_url && !isValidUrl(profile_photo_url)) {
    return { error: 'Profile photo URL must start with http:// or https://' }
  }

  if (social_accounts) {
    for (let i = 0; i < social_accounts.length; i++) {
      const sa = social_accounts[i]
      if (!VALID_PLATFORMS.has(sa.platform)) {
        return { error: `Social account ${i + 1}: invalid platform "${sa.platform}"` }
      }
      if (sa.follower_count !== null && (sa.follower_count < 0 || !Number.isInteger(sa.follower_count))) {
        return { error: `Social account ${i + 1}: follower count must be a non-negative integer` }
      }
      if (sa.url && !isValidUrl(sa.url)) {
        return { error: `Social account ${i + 1}: URL must start with http:// or https://` }
      }
    }
  }

  if (portfolio_links) {
    for (let i = 0; i < portfolio_links.length; i++) {
      if (!isValidUrl(portfolio_links[i])) {
        return { error: `Portfolio link ${i + 1}: must start with http:// or https://` }
      }
    }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('creators')
    .update({
      full_name: full_name.trim(),
      phone: phone?.trim() || null,
      niches: niches ?? [],
      handle: handle?.trim() || null,
      bio: bio?.trim() || null,
      profile_photo_url: profile_photo_url?.trim() || null,
      social_accounts: social_accounts ?? [],
      worked_with: worked_with ?? [],
      portfolio_links: portfolio_links ?? [],
      rate_card: rate_card ?? {},
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/ops/creators')
  return { success: true }
}

// ── Approve brand ────────────────────────────────────────────────────────────

export async function approveBrand(brandId: string) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('brands')
    .update({ brand_status: 'approved' })
    .eq('id', brandId)

  if (error) return { error: error.message }

  revalidatePath('/ops/brands')
  return { success: true }
}

// ── Reject brand ─────────────────────────────────────────────────────────────

export async function rejectBrand(brandId: string) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('brands')
    .update({ brand_status: 'rejected' })
    .eq('id', brandId)

  if (error) return { error: error.message }

  revalidatePath('/ops/brands')
  return { success: true }
}

// ── Add creator product ──────────────────────────────────────────────────────

interface AddProductInput {
  creator_id: string
  platform: string
  handle: string
  product_type: string
  description?: string
  price_paise: number
  display_price?: boolean
}

export async function addProduct(input: AddProductInput) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const { creator_id, platform, handle, product_type, description, price_paise, display_price } = input
  if (!platform.trim()) return { error: 'Platform is required' }
  if (!handle.trim()) return { error: 'Handle is required' }
  if (!product_type.trim()) return { error: 'Product type is required' }
  if (!Number.isInteger(price_paise) || price_paise < 0) return { error: 'Price must be a non-negative integer (paise)' }

  const admin = createAdminClient()
  const { error } = await admin.from('creator_products').insert({
    creator_id,
    platform: platform.trim(),
    handle: handle.trim(),
    product_type,
    description: description?.trim() || null,
    price_paise,
    display_price: display_price ?? true,
  })

  if (error) return { error: error.message }

  revalidatePath(`/ops/creators/${creator_id}`)
  return { success: true }
}

// ── Edit creator product ─────────────────────────────────────────────────────

interface EditProductInput {
  id: string
  creator_id: string
  product_type: string
  description?: string
  price_paise: number
  display_price?: boolean
  is_active?: boolean
}

export async function editProduct(input: EditProductInput) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const { id, creator_id, product_type, description, price_paise, display_price, is_active } = input
  if (!product_type.trim()) return { error: 'Product type is required' }
  if (!Number.isInteger(price_paise) || price_paise < 0) return { error: 'Price must be a non-negative integer (paise)' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('creator_products')
    .update({
      product_type,
      description: description?.trim() || null,
      price_paise,
      display_price: display_price ?? true,
      is_active: is_active ?? true,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath(`/ops/creators/${creator_id}`)
  return { success: true }
}

// ── Edit brand ───────────────────────────────────────────────────────────────

interface EditBrandInput {
  id: string
  name: string
  category?: string
  company_size?: string
  website?: string
  contact_name?: string
  social_accounts?: Record<string, string>
}

export async function editBrand(input: EditBrandInput) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const { id, name, category, company_size, website, contact_name, social_accounts } = input
  if (!name.trim()) return { error: 'Brand name is required' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('brands')
    .update({
      name: name.trim(),
      category: category?.trim() || null,
      company_size: company_size?.trim() || null,
      website: website?.trim() || null,
      contact_name: contact_name?.trim() || null,
      social_accounts: social_accounts ?? {},
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/ops/brands')
  return { success: true }
}
