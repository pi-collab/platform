'use server'

import { createClient }      from '@/lib/supabase/server'
import { sendWelcomeEmail } from '@/lib/welcome-email'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies }           from 'next/headers'
import { captureSignupOrigin, ORIGIN_COOKIE } from '@/lib/attribution'
import { BRAND_CATEGORIES } from '@/lib/brand-categories'
import { notifyOpsBrandSignup } from '@/lib/account-emails'
import { normalizeE164 } from '@/lib/phone'
import { validateWorkEmail } from '@/lib/work-email'

export type OnboardingState =
  | { status: 'error'; error: string }
  | { status: 'ok' }
  | null

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
    .from('users').select('id, role').eq('auth_id', user.id).maybeSingle()
  if (!profile) return { status: 'error' as const, error: 'User profile not found.' }

  // 2a. AUTHORISED, not merely authenticated.
  //
  // Without this, any signed-in session could create a brand — including a
  // creator who signed up with a phone and an OTP. That is not a hypothetical:
  // it happened on production within hours of launch, producing a brand whose
  // contact address was the synthetic creator_<phone>@auth.guapd.internal that
  // the OTP path generates.
  //
  // Blocked outright rather than allowed-with-caveats. users.role is an enum of
  // exactly two values, so the schema models ONE role per person; a creator who
  // also owns a brand has no representation here, and letting it happen
  // corrupts the model rather than enabling a use case. Anyone who genuinely
  // needs both sides needs two accounts.
  if (profile.role === 'creator') {
    return {
      status: 'error' as const,
      error: 'This account is registered as a creator. Brands need a separate account — sign up with your work email.',
    }
  }

  // 2b. The work-email rule, enforced here as well as in /auth/callback.
  //
  // It was only ever applied to the OAuth callback, so this action was a way
  // around it. Note it would NOT have stopped the case above on its own:
  // validateWorkEmail is a blocklist of free consumer providers, and our own
  // synthetic domain is not on it, so the address would have passed. Hence the
  // explicit rejection first — a phone-only account has no real address, and
  // cannot satisfy a work-email rule by definition.
  const email = user.email ?? ''
  if (email.endsWith('@auth.guapd.internal')) {
    return {
      status: 'error' as const,
      error: 'This account has no email address. Brands need a work email — sign up with one.',
    }
  }
  const emailCheck = validateWorkEmail(email, process.env.OPS_ALLOWED_EMAILS)
  if (!emailCheck.ok) {
    return { status: 'error' as const, error: emailCheck.message }
  }

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

  // A hostname has to look like one. Prepending https:// to whatever was typed
  // turned "Asd" into "https://Asd" and stored it as a website — a real signup
  // on production did exactly that. The rule: at least one dot, a label either
  // side of it, and a TLD of two or more letters. Deliberately not a list of
  // valid TLDs, which goes stale, and not a demand for .com, which would reject
  // .in, .co.uk and .xyz — all of which real brands here use.
  if (website) {
    let host: string
    try {
      host = new URL(website).hostname
    } catch {
      return { status: 'error' as const, error: 'Enter a valid website, like acmestudio.com.' }
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i.test(host)) {
      return { status: 'error' as const, error: 'Enter a valid website, like acmestudio.com.' }
    }
  }

  // Required, and validated here rather than trusting the form: this action is
  // directly callable. normalizeE164 enforces a plausible length for the dial
  // code given, which is all a contact number has to satisfy — it is somewhere
  // to ring, not a login identity, so the strict Indian-mobile rule that guards
  // creator signup would be wrong here.
  const phoneDial = (formData.get('phone_dial') as string)?.trim() || '+91'
  const phoneRaw  = (formData.get('phone') as string)?.trim() || ''
  const contactPhone = phoneRaw ? normalizeE164(phoneDial, phoneRaw) : null

  const termsAccepted = formData.get('terms_accepted') === 'yes'
  if (!termsAccepted) return { status: 'error' as const, error: 'You must agree to the Terms of Service and Privacy Policy.' }

  // 5. Server-side validation (browser `required` / type attrs are not a security boundary)

  // Required fields present
  if (!name)     return { status: 'error' as const, error: 'Company name is required.' }
  if (!category) return { status: 'error' as const, error: 'Industry is required.' }
  if (!phoneRaw)      return { status: 'error' as const, error: 'Phone number is required.' }
  if (!contactPhone)  return { status: 'error' as const, error: 'Enter a valid phone number for the country code selected.' }

  // Length caps
  if (name.length > 100)
    return { status: 'error' as const, error: 'Brand name must be 100 characters or fewer.' }
  if (website && website.length > 300)
    return { status: 'error' as const, error: 'Website URL must be 300 characters or fewer.' }
  if (instagram && instagram.length > 60)
    return { status: 'error' as const, error: 'Instagram handle must be 60 characters or fewer.' }

  // Industry must be one of the allowed values
  if (!BRAND_CATEGORIES.includes(category))
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
    .insert({ name, category, website, contact_email: user.email ?? null, contact_phone: contactPhone, social_accounts })
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

  // Tell ops a brand has arrived — after the membership exists, so a signup
  // that failed halfway is never announced as complete. Never awaited for a
  // result it acts on: the account exists either way, and a failed
  // notification must not fail signup.
  void notifyOpsBrandSignup(brand.id)

  await admin.from('users').update({
    terms_accepted_at: new Date().toISOString(),
    terms_version: '2026-07-23',
  }).eq('auth_id', user.id)

  // Welcome them in. Deliberately not awaited for a result it acts on, and
  // never able to throw: the brand exists by this point, and a failed email
  // must not fail onboarding.
  void sendWelcomeEmail({ userId: profile.id, to: user.email, audience: 'brand', name })

  // Attribution: resolve the first-touch storefront cookie onto this brand and
  // the brand↔creator pair. Set-once; never recomputed after this.
  await captureSignupOrigin(brand.id, cookies().get(ORIGIN_COOKIE)?.value)

  // Returns instead of redirecting so the client can show the design's
  // confirmation before moving on. The brand exists either way — nothing about
  // completion depends on the client honouring this.
  return { status: 'ok' as const }
}
