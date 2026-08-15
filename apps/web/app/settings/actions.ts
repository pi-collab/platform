'use server'

import { revalidatePath } from 'next/cache'
import { verifyBrand } from '@/lib/brand-auth'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Update Profile ────────────────────────────────────────────────

interface ProfileUpdate {
  brandName?: string
  category?: string
  website?: string
  bio?: string
  location?: string
  contactEmail?: string
  socials?: Record<string, string>
  fullName?: string
  email?: string
  phone?: string
}

export async function updateProfile(data: ProfileUpdate): Promise<{ error?: string }> {
  const brand = await verifyBrand()
  const admin = createAdminClient()

  // Update brand table
  const brandUpdate: Record<string, unknown> = {}
  if (data.brandName !== undefined) brandUpdate.name = data.brandName
  if (data.category !== undefined) brandUpdate.category = data.category || null
  if (data.website !== undefined) brandUpdate.website = data.website || null
  if (data.bio !== undefined) brandUpdate.bio = data.bio || null
  if (data.location !== undefined) brandUpdate.location = data.location || null
  if (data.contactEmail !== undefined) brandUpdate.contact_email = data.contactEmail || null
  if (data.socials !== undefined) {
    const cleaned: Record<string, string> = {}
    for (const [platform, handle] of Object.entries(data.socials)) {
      const trimmed = handle.trim().replace(/^@/, '')
      if (trimmed) cleaned[platform] = trimmed
    }
    brandUpdate.social_accounts = cleaned
  }

  if (Object.keys(brandUpdate).length > 0) {
    const { error } = await admin
      .from('brands')
      .update(brandUpdate)
      .eq('id', brand.brandId)

    if (error) return { error: error.message }
  }

  // Update user profile
  if (data.fullName !== undefined || data.email !== undefined || data.phone !== undefined) {
    const userUpdate: Record<string, string | null> = {}
    if (data.fullName !== undefined) userUpdate.full_name = data.fullName
    if (data.email !== undefined) userUpdate.email = data.email
    if (data.phone !== undefined) userUpdate.phone = data.phone

    const { error } = await admin
      .from('users')
      .update(userUpdate)
      .eq('id', brand.profileId)

    if (error) return { error: error.message }
  }

  revalidatePath('/settings')
  return {}
}

// ── Update Account Preferences ────────────────────────────────────

interface AccountUpdate {
  email?: string
  phone?: string
  language?: string
  timezone?: string
}

export async function updateAccount(data: AccountUpdate): Promise<{ error?: string }> {
  const brand = await verifyBrand()
  const admin = createAdminClient()

  const userUpdate: Record<string, unknown> = {}
  if (data.email !== undefined) userUpdate.email = data.email
  if (data.phone !== undefined) userUpdate.phone = data.phone

  // Language and timezone go into preferences jsonb
  if (data.language !== undefined || data.timezone !== undefined) {
    // Fetch existing preferences first
    const { data: existing } = await admin
      .from('users')
      .select('preferences')
      .eq('id', brand.profileId)
      .single()

    const prefs = (existing?.preferences ?? {}) as Record<string, unknown>
    if (data.language !== undefined) prefs.language = data.language
    if (data.timezone !== undefined) prefs.timezone = data.timezone
    userUpdate.preferences = prefs
  }

  if (Object.keys(userUpdate).length > 0) {
    const { error } = await admin
      .from('users')
      .update(userUpdate)
      .eq('id', brand.profileId)

    if (error) return { error: error.message }
  }

  revalidatePath('/settings')
  return {}
}
