'use server'

import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'

export type OnboardingState = { error: string } | null

export async function submitOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  // 1. Verify session — never trust client-supplied identity
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  // 2. Resolve internal user id from our users table
  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()
  if (!profile) return { error: 'User profile not found.' }

  // 3. Enforce one brand per user
  const { data: existing } = await supabase
    .from('brand_members').select('id').eq('user_id', profile.id).maybeSingle()
  if (existing) return { error: 'Your account already belongs to a brand.' }

  // 4. Extract all fields
  const name         = (formData.get('name') as string)?.trim()
  const category     = (formData.get('category') as string)?.trim()
  const company_size = (formData.get('company_size') as string)?.trim()
  const website      = (formData.get('website') as string)?.trim() || null
  const contact_name = (formData.get('contact_name') as string)?.trim() || null
  // Strip leading @ from handles
  const instagram    = ((formData.get('instagram') as string)?.trim() || '').replace(/^@/, '') || null
  const linkedin     = ((formData.get('linkedin') as string)?.trim() || '').replace(/^@/, '') || null

  const termsAccepted = formData.get('terms_accepted') === 'yes'
  if (!termsAccepted) return { error: 'You must agree to the Terms of Service and Privacy Policy.' }

  // 5. Server-side validation (browser `required` / type attrs are not a security boundary)

  // Required fields present
  if (!name)         return { error: 'Brand name is required.' }
  if (!category)     return { error: 'Category is required.' }
  if (!company_size) return { error: 'Company size is required.' }

  // Length caps
  if (name.length > 100)
    return { error: 'Brand name must be 100 characters or fewer.' }
  if (contact_name && contact_name.length > 100)
    return { error: 'Contact name must be 100 characters or fewer.' }
  if (website && website.length > 300)
    return { error: 'Website URL must be 300 characters or fewer.' }
  if (instagram && instagram.length > 60)
    return { error: 'Instagram handle must be 60 characters or fewer.' }
  if (linkedin && linkedin.length > 100)
    return { error: 'LinkedIn handle must be 100 characters or fewer.' }

  // Category must be one of the allowed values
  const ALLOWED_CATEGORIES = ['BFSI/Fintech', 'D2C', 'EdTech', 'Gaming', 'Other']
  if (!ALLOWED_CATEGORIES.includes(category))
    return { error: 'Invalid category selected.' }

  // Company size must be one of the allowed values
  const ALLOWED_SIZES = ['1–10', '11–50', '51–200', '201–500', '500+']
  if (!ALLOWED_SIZES.includes(company_size))
    return { error: 'Invalid company size selected.' }

  // Website: if provided, must be a valid http/https URL
  if (website) {
    try {
      const url = new URL(website)
      if (url.protocol !== 'http:' && url.protocol !== 'https:')
        return { error: 'Website must be an http or https URL.' }
    } catch {
      return { error: 'Website must be a valid URL (e.g. https://yourbrand.com).' }
    }
  }

  // Handles: only allow alphanumeric, dots, underscores, hyphens
  const HANDLE_RE = /^[a-zA-Z0-9._\-/]+$/
  if (instagram && !HANDLE_RE.test(instagram))
    return { error: 'Instagram handle contains invalid characters.' }
  if (linkedin && !HANDLE_RE.test(linkedin))
    return { error: 'LinkedIn handle contains invalid characters.' }

  const social_accounts = {
    ...(instagram && { instagram }),
    ...(linkedin  && { linkedin  }),
  }

  // 6. Write via service role (only reached after all checks above pass)
  const admin = createAdminClient()

  const { data: brand, error: brandErr } = await admin
    .from('brands')
    .insert({ name, category, company_size, website, contact_name, contact_email: user.email ?? null, social_accounts })
    .select('id')
    .single()

  if (brandErr || !brand) {
    return { error: `Failed to create brand: ${brandErr?.message ?? 'unknown error'}` }
  }

  const { error: memberErr } = await admin
    .from('brand_members')
    .insert({ brand_id: brand.id, user_id: profile.id, is_admin: true })

  if (memberErr) {
    return { error: `Failed to link brand member: ${memberErr.message}` }
  }

  await admin.from('users').update({
    terms_accepted_at: new Date().toISOString(),
    terms_version: '2026-07-23',
  }).eq('auth_id', user.id)

  redirect('/deals')
}
