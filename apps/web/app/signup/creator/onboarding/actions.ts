'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type OnboardingResult =
  | { status: 'success'; redirect: string }
  | { status: 'error'; message: string }

/**
 * Save Stage 1 onboarding: name + primary social account + optional first product.
 *
 * Runs as the authenticated creator (session exists from signup).
 * Uses service-role for the writes since the creator was just created
 * and RLS context may not yet reflect the new user_id linkage.
 */
export async function saveOnboarding(data: {
  fullName: string
  platform: string
  handle: string
  /** The explicit tick on this form. Signup already recorded acceptance
   *  against the notice on the account screen; this upgrades that record to a
   *  deliberate act, which is why it overwrites rather than skips. */
  termsAccepted: boolean
  productType?: string
  productPricePaise?: number
}): Promise<OnboardingResult> {
  const { fullName, platform, handle, termsAccepted, productType, productPricePaise } = data

  // Validate required fields. Checked here and not only in the form: a server
  // action is directly callable, so the form is convenience, not the boundary.
  if (!fullName.trim()) return { status: 'error', message: 'Name is required.' }
  if (!platform.trim()) return { status: 'error', message: 'Select a platform.' }
  if (!handle.trim()) return { status: 'error', message: 'Enter your handle.' }
  // Enforced here, not only by the checkbox. The brand action does the same:
  // without it, a directly-called action completes onboarding and writes an
  // acceptance timestamp for a tick that never happened.
  if (!termsAccepted) {
    return { status: 'error', message: 'You must agree to the Terms of Service and Privacy Policy.' }
  }

  // Get authenticated user
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Not authenticated. Please sign up again.' }

  const admin = createAdminClient()

  // Find the creator row linked to this user
  const { data: profile } = await admin
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (!profile) return { status: 'error', message: 'User profile not found.' }

  const { data: creator } = await admin
    .from('creators')
    .select('id, is_vetted')
    .eq('user_id', profile.id)
    .maybeSingle()

  if (!creator) return { status: 'error', message: 'Creator profile not found.' }

  const cleanHandle = handle.trim().replace(/^@/, '')

  // Map platform display names to lowercase keys used in social_accounts
  const platformKey = platform.toLowerCase()

  // Build social_accounts JSONB array with the primary account
  const socialAccount = {
    platform: platformKey,
    handle: cleanHandle,
    url: null,
    follower_count: null,
    verified: false,
  }

  // Update creator profile: name, handle, and social_accounts
  const { error: updateErr } = await admin
    .from('creators')
    .update({
      full_name: fullName.trim(),
      handle: cleanHandle,
      social_accounts: [socialAccount],
    })
    .eq('id', creator.id)

  if (updateErr) return { status: 'error', message: 'Failed to save profile.' }

  // Record the explicit acceptance over the implicit one taken at signup.
  await admin.from('users').update({
    terms_accepted_at: new Date().toISOString(),
    terms_version: '2026-07-23',
  }).eq('id', profile.id)

  // Create product if provided
  if (productType?.trim() && productPricePaise != null && productPricePaise > 0) {
    await admin.from('creator_products').insert({
      creator_id: creator.id,
      platform: platformKey,
      handle: cleanHandle,
      product_type: productType.trim(),
      price_paise: productPricePaise,
    })
  }

  // Already vetted (stub claim) → go to deals
  if (creator.is_vetted) {
    return { status: 'success', redirect: '/creator/dashboard' }
  }

  // New creator, pending vetting → show confirmation
  return { status: 'success', redirect: '/signup/creator/complete' }
}
