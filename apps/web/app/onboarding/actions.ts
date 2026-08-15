'use server'

import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies }           from 'next/headers'
import { captureSignupOrigin, ORIGIN_COOKIE } from '@/lib/attribution'

export type OnboardingState =
  | { status: 'error'; error: string }
  | { status: 'ok' }
  | null

/**
 * Industry options. The design's eleven, plus the four this product already
 * used, per the decision to keep both rather than replace one with the other.
 *
 * Two design entries were mapped rather than duplicated: "Finance" is dropped
 * in favour of the existing 'BFSI/Fintech', which is the wedge's own language
 * and already stored on live rows. 'EdTech' and 'Education' are BOTH kept —
 * they are not the same thing (a learning app is not a university), and
 * 'EdTech' is a value live brands already carry.
 *
 * The exact strings are stored on brands.category. Renaming one does not
 * migrate existing rows, so treat them as data, not labels.
 *
 * Alphabetical, because a thirteen-item list is scanned rather than read.
 */
export const BRAND_CATEGORIES = [
  'Beauty & Fashion',
  'BFSI/Fintech',
  'D2C',
  'EdTech',
  'Education',
  'Entertainment & Media',
  'Food & Beverage',
  'Gaming',
  'Health & Wellness',
  'Home & Lifestyle',
  'Sports & Fitness',
  'Tech & Electronics',
  'Travel & Hospitality',
  'Other',
] as const

export async function submitOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  // 1. Verify session — never trust client-supplied identity
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error' as const, error: 'Not authenticated.' }

  // 2. Resolve internal user id from our users table
  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()
  if (!profile) return { status: 'error' as const, error: 'User profile not found.' }

  // 3. Enforce one brand per user
  const { data: existing } = await supabase
    .from('brand_members').select('id').eq('user_id', profile.id).maybeSingle()
  if (existing) return { status: 'error' as const, error: 'Your account already belongs to a brand.' }

  // 4. Extract all fields
  const name      = (formData.get('name') as string)?.trim()
  const category  = (formData.get('category') as string)?.trim()
  const websiteIn = (formData.get('website') as string)?.trim() || null
  // Strip leading @ from the handle
  const instagram = ((formData.get('instagram') as string)?.trim() || '').replace(/^@/, '') || null

  // The design asks for a bare domain ("acmestudio.com"), so a scheme cannot be
  // required. Anything without one is treated as https rather than rejected —
  // demanding people type "https://" to describe their own company is friction
  // that teaches nothing.
  const website = websiteIn
    ? (/^https?:\/\//i.test(websiteIn) ? websiteIn : `https://${websiteIn}`)
    : null

  const termsAccepted = formData.get('terms_accepted') === 'yes'
  if (!termsAccepted) return { status: 'error' as const, error: 'You must agree to the Terms of Service and Privacy Policy.' }

  // 5. Server-side validation (browser `required` / type attrs are not a security boundary)

  // Required fields present
  if (!name)     return { status: 'error' as const, error: 'Company name is required.' }
  if (!category) return { status: 'error' as const, error: 'Industry is required.' }

  // Length caps
  if (name.length > 100)
    return { status: 'error' as const, error: 'Brand name must be 100 characters or fewer.' }
  if (website && website.length > 300)
    return { status: 'error' as const, error: 'Website URL must be 300 characters or fewer.' }
  if (instagram && instagram.length > 60)
    return { status: 'error' as const, error: 'Instagram handle must be 60 characters or fewer.' }

  // Industry must be one of the allowed values
  if (!(BRAND_CATEGORIES as readonly string[]).includes(category))
    return { status: 'error' as const, error: 'Invalid industry selected.' }

  // Website: if provided, must be a valid http/https URL
  if (website) {
    try {
      const url = new URL(website)
      if (url.protocol !== 'http:' && url.protocol !== 'https:')
        return { status: 'error' as const, error: 'Website must be an http or https URL.' }
    } catch {
      return { status: 'error' as const, error: 'Website must be a valid URL (e.g. https://yourbrand.com).' }
    }
  }

  // Handles: only allow alphanumeric, dots, underscores, hyphens
  const HANDLE_RE = /^[a-zA-Z0-9._\-/]+$/
  if (instagram && !HANDLE_RE.test(instagram))
    return { status: 'error' as const, error: 'Instagram handle contains invalid characters.' }

  const social_accounts = { ...(instagram && { instagram }) }

  // 6. Write via service role (only reached after all checks above pass)
  const admin = createAdminClient()

  const { data: brand, error: brandErr } = await admin
    .from('brands')
    .insert({ name, category, website, contact_email: user.email ?? null, social_accounts })
    .select('id')
    .single()

  if (brandErr || !brand) {
    return { status: 'error' as const, error: `Failed to create brand: ${brandErr?.message ?? 'unknown error'}` }
  }

  const { error: memberErr } = await admin
    .from('brand_members')
    .insert({ brand_id: brand.id, user_id: profile.id, is_admin: true })

  if (memberErr) {
    return { status: 'error' as const, error: `Failed to link brand member: ${memberErr.message}` }
  }

  await admin.from('users').update({
    terms_accepted_at: new Date().toISOString(),
    terms_version: '2026-07-23',
  }).eq('auth_id', user.id)

  // Attribution: resolve the first-touch storefront cookie onto this brand and
  // the brand↔creator pair. Set-once; never recomputed after this.
  await captureSignupOrigin(brand.id, cookies().get(ORIGIN_COOKIE)?.value)

  // Returns instead of redirecting so the client can show the design's
  // confirmation before moving on. The brand exists either way — nothing about
  // completion depends on the client honouring this.
  return { status: 'ok' as const }
}
