'use server'

import { revalidatePath } from 'next/cache'
import { verifyCreator } from '@/lib/creator-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { mergeSocialAccounts } from '@/lib/social-accounts'
import { canonicalNiches } from '@/lib/niches'
import { validateLocation } from '@/lib/creator-location'

// ── Update Creator Profile ───────────────────────────────────────

interface ProfileUpdate {
  fullName?: string
  handle?: string
  bio?: string
  niches?: string[]
  city?: string
  state?: string
  ageBracket?: string
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
  if (data.niches !== undefined) {
    const niches = canonicalNiches(data.niches).slice(0, 5)
    update.niches = niches
    // The legacy singular column is still read by AI search; keep it the
    // creator's first pick rather than letting it drift from the list.
    update.niche = niches[0] ?? null
  }
  if (data.primaryPlatform !== undefined) update.primary_platform = data.primaryPlatform || null
  if (data.contactEmail !== undefined) update.contact_email = data.contactEmail || null
  if (data.socials !== undefined) {
    const cleaned = data.socials
      .map(s => ({ platform: s.platform.trim(), handle: s.handle.trim().replace(/^@/, '') }))
      .filter(s => s.platform && s.handle)

    // MERGED, not replaced. This wrote `cleaned` straight over the column,
    // keeping only platform and handle, so saving the profile silently deleted
    // every other key on each entry: follower_range — the ONLY source of
    // creators.follower_band, so the creator then disappeared from every band
    // filter in ops — plus follower_count and the storefront's per-channel
    // stats. Nothing errored and nothing was logged.
    const { data: row } = await admin
      .from('creators').select('social_accounts').eq('id', ctx.creatorId).maybeSingle()
    update.social_accounts = mergeSocialAccounts(row?.social_accounts, cleaned)
  }

  // City, state and age go together or not at all: all blank means the
  // creator has not answered and is just editing something else; any one set
  // means all three are checked. Written separately so a database without
  // migration 0515 fails only this, not the rest of the profile.
  const placeGiven = [data.city, data.state, data.ageBracket].some(v => (v ?? '').trim())
  let placeRow: Record<string, unknown> | null = null
  if (placeGiven) {
    const place = validateLocation({ city: data.city ?? '', state: data.state ?? '', ageBracket: data.ageBracket ?? '' })
    if (!place.ok) return { error: place.error }
    placeRow = place.row
  }

  if (Object.keys(update).length > 0) {
    const { error } = await admin
      .from('creators')
      .update(update)
      .eq('id', ctx.creatorId)

    if (error) return { error: error.message }
  }

  if (placeRow) {
    const { error } = await admin.from('creators').update(placeRow).eq('id', ctx.creatorId)
    if (error) {
      console.error(`[settings] city/state/age not saved creator=${ctx.creatorId}: ${error.message}`)
      return { error: 'Your profile saved, but city, state and age did not. Try again in a moment.' }
    }
    revalidatePath('/creator/dashboard')
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
