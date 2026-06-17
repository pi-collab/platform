import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

interface BrandContext {
  userId: string
  profileId: string
  brandId: string
  brandName: string
  brandStatus: string
  isAdmin: boolean
}

/**
 * Verify the current session belongs to an APPROVED brand member.
 * Returns brand context if authorized; redirects otherwise.
 *
 * Gate logic:
 *   1. No auth session → /login
 *   2. No users row / no brand_members row → /onboarding (or /ops for founders)
 *   3. brand_status !== 'approved' → /dashboard (they'll see pending state there)
 *   4. Approved → return context
 */
export async function verifyApprovedBrand(): Promise<BrandContext> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (!profile) redirect('/onboarding')

  const { data: membership } = await supabase
    .from('brand_members')
    .select('is_admin, brand_id, brands(id, name, brand_status)')
    .eq('user_id', profile.id)
    .maybeSingle()

  if (!membership) {
    // Check if founder → /ops
    const allowedRaw = process.env.OPS_ALLOWED_EMAILS
    if (allowedRaw && user.email) {
      const allowed = new Set(allowedRaw.split(',').map(e => e.trim().toLowerCase()))
      if (allowed.has(user.email.toLowerCase())) redirect('/ops')
    }
    redirect('/onboarding')
  }

  const brand = (membership as any)?.brands
  if (!brand || brand.brand_status !== 'approved') {
    redirect('/dashboard')
  }

  return {
    userId: user.id,
    profileId: profile.id,
    brandId: brand.id,
    brandName: brand.name,
    brandStatus: brand.brand_status,
    isAdmin: (membership as any).is_admin,
  }
}
