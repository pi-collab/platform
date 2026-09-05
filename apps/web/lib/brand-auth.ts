import 'server-only'
import { brandLoginUrl } from '@/lib/safe-next'
import { currentPath } from '@/lib/current-path'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isOpsRoutingEmail } from '@/lib/ops-capabilities'

interface BrandContext {
  userId: string
  profileId: string
  brandId: string
  brandName: string
  brandStatus: string
  rejectionReason: string | null
  isAdmin: boolean
}

/**
 * Verify the current session belongs to an APPROVED brand member.
 * Returns brand context if authorized; redirects otherwise.
 *
 * Gate logic:
 *   1. No auth session → /login/brand
 *   2. No users row / no brand_members row → /onboarding (or /ops for founders)
 *   3. brand_status is NOT a gate here. Approval is enforced at FIRST SEND
 *      (lib/send-gate.ts), not on dashboard access — an unreviewed brand may
 *      explore, browse vetted creators and build drafts. brandStatus is
 *      returned so surfaces can label held work.
 *   4. Approved → return context
 */
/**
 * Onboarding, remembering where they were going.
 *
 * A brand part-way through signup who clicks "Create an offer" on a shopfront
 * still has a destination worth keeping — otherwise finishing onboarding drops
 * them on the dashboard and the creator they were about to pitch is gone.
 */
function onboardingWithNext(): string {
  const path = currentPath()
  const target = path && path.startsWith('/') && !path.startsWith('//') ? path : null
  return target ? `/onboarding?next=${encodeURIComponent(target)}` : '/onboarding'
}

export async function verifyBrand(): Promise<BrandContext> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Carries where they were going. This is what makes the shopfront → offer
  // path survive a login: /deals/new?creator=…&items=… comes back intact.
  if (!user) redirect(brandLoginUrl(currentPath()))

  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (!profile) redirect(onboardingWithNext())

  const { data: membership } = await supabase
    .from('brand_members')
    .select('is_admin, brand_id, brands(id, name, brand_status, rejection_reason)')
    .eq('user_id', profile.id)
    .maybeSingle()

  if (!membership) {
    // Ops person with no brand membership → /ops, not brand onboarding
    if (isOpsRoutingEmail(user.email)) redirect('/ops')
    redirect(onboardingWithNext())
  }

  const brand = (membership as any)?.brands
  if (!brand) redirect(onboardingWithNext())

  return {
    userId: user.id,
    profileId: profile.id,
    brandId: brand.id,
    brandName: brand.name,
    brandStatus: brand.brand_status as string,
    rejectionReason: (brand.rejection_reason ?? null) as string | null,
    isAdmin: (membership as any).is_admin,
  }
}
