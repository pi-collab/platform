'use server'

import { revalidatePath } from 'next/cache'
import { verifyCreator } from '@/lib/creator-auth'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Update Creator Profile ───────────────────────────────────────

interface ProfileUpdate {
  fullName?: string
  handle?: string
  bio?: string
  niche?: string
  location?: string
  primaryPlatform?: string
  contactEmail?: string
  socials?: Array<{ platform: string; handle: string }>
}

export async function updateCreatorProfile(data: ProfileUpdate): Promise<{ error?: string }> {
  const ctx = await verifyCreator()
  const admin = createAdminClient()

  const update: Record<string, unknown> = {}
  if (data.fullName !== undefined) update.full_name = data.fullName || null
  if (data.handle !== undefined) update.handle = data.handle || null
  if (data.bio !== undefined) update.bio = data.bio || null
  if (data.niche !== undefined) update.niche = data.niche || null
  if (data.location !== undefined) update.location = data.location || null
  if (data.primaryPlatform !== undefined) update.primary_platform = data.primaryPlatform || null
  if (data.contactEmail !== undefined) update.contact_email = data.contactEmail || null
  if (data.socials !== undefined) {
    const cleaned = data.socials
      .map(s => ({ platform: s.platform.trim(), handle: s.handle.trim().replace(/^@/, '') }))
      .filter(s => s.platform && s.handle)
    update.social_accounts = cleaned
  }

  if (Object.keys(update).length > 0) {
    const { error } = await admin
      .from('creators')
      .update(update)
      .eq('id', ctx.creatorId)

    if (error) return { error: error.message }
  }

  // Update user profile name/email if changed
  if (data.fullName !== undefined) {
    const { error } = await admin
      .from('users')
      .update({ full_name: data.fullName })
      .eq('id', ctx.profileId)

    if (error) return { error: error.message }
  }

  revalidatePath('/creator/settings')
  return {}
}

// ── Update Account Preferences ───────────────────────────────────

interface AccountUpdate {
  email?: string
  phone?: string
  language?: string
  timezone?: string
}

export async function updateCreatorAccount(data: AccountUpdate): Promise<{ error?: string }> {
  const ctx = await verifyCreator()
  const admin = createAdminClient()

  const userUpdate: Record<string, unknown> = {}
  if (data.email !== undefined) userUpdate.email = data.email
  if (data.phone !== undefined) userUpdate.phone = data.phone

  if (data.language !== undefined || data.timezone !== undefined) {
    const { data: existing } = await admin
      .from('users')
      .select('preferences')
      .eq('id', ctx.profileId)
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
      .eq('id', ctx.profileId)

    if (error) return { error: error.message }
  }

  revalidatePath('/creator/settings')
  return {}
}
