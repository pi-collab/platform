import { Suspense } from 'react'
import { verifyBrand } from '@/lib/brand-auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import SettingsClient from './SettingsClient'
import { metaAppConfigured, metaMarketplaceEnabled } from '@/lib/meta/config'
import type { MetaEligibilityState } from '@/lib/meta/eligibility-copy'

export default async function SettingsPage() {
  const brand = await verifyBrand()
  const supabase = createClient()
  const admin = createAdminClient()

  // Fetch user profile + preferences
  const { data: user } = await supabase
    .from('users')
    .select('id, full_name, email, phone, preferences')
    .eq('id', brand.profileId)
    .single()

  // Get auth provider info
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const authProvider = authUser?.app_metadata?.provider || 'email'
  const authEmail = authUser?.email ?? user?.email ?? ''

  // Fetch brand details (all profile columns)
  const { data: brandRow } = await admin
    .from('brands')
    .select('id, name, category, website, company_size, contact_name, contact_email, social_accounts, bio, location, logo_url')
    .eq('id', brand.brandId)
    .single()

  // Fetch team members
  const { data: members } = await admin
    .from('brand_members')
    .select('id, is_admin, created_at, user_id, users(email, full_name)')
    .eq('brand_id', brand.brandId)
    .order('created_at', { ascending: true })

  // Fetch pending invites
  const { data: invites } = await admin
    .from('brand_invites')
    .select('id, email, status, expires_at, created_at')
    .eq('brand_id', brand.brandId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  const teamMembers = (members ?? []).map((m: any) => ({
    id: m.id,
    email: m.users?.email ?? '(no email)',
    name: m.users?.full_name ?? null,
    isAdmin: m.is_admin,
    joinedAt: m.created_at,
    isCurrentUser: m.user_id === brand.profileId,
  }))

  const pendingInvites = (invites ?? []).map((inv: any) => ({
    id: inv.id,
    email: inv.email,
    expiresAt: inv.expires_at,
  }))

  const socials = (brandRow?.social_accounts ?? {}) as Record<string, string>
  const prefs = (user?.preferences ?? {}) as Record<string, string>

  // Instagram Creator Marketplace status: only when it is on here.
  let instagram = null
  if (metaMarketplaceEnabled() && metaAppConfigured()) {
    const [{ data: conn }, { data: elig }] = await Promise.all([
      admin.from('brand_meta_connections').select('status, ig_username, page_name').eq('brand_id', brand.brandId).maybeSingle(),
      admin.from('brand_meta_eligibility').select('state').eq('brand_id', brand.brandId).maybeSingle(),
    ])
    instagram = { connected: conn?.status === 'connected', needsReconnect: conn?.status === 'needs_reconnect', igUsername: conn?.ig_username ?? null, pageName: conn?.page_name ?? null, eligibility: (elig?.state ?? null) as MetaEligibilityState | null }
  }

  return (
    <Suspense><SettingsClient
      brandName={brandRow?.name ?? brand.brandName}
      brandCategory={brandRow?.category ?? ''}
      brandWebsite={brandRow?.website ?? ''}
      brandBio={(brandRow as any)?.bio ?? ''}
      brandLocation={(brandRow as any)?.location ?? ''}
      brandContactEmail={brandRow?.contact_email ?? user?.email ?? ''}
      brandSocials={socials}
      brandLogoUrl={(brandRow as any)?.logo_url ?? null}
      userName={user?.full_name ?? ''}
      userEmail={user?.email ?? ''}
      userPhone={user?.phone ?? ''}
      userLanguage={prefs.language ?? 'English'}
      userTimezone={prefs.timezone ?? 'IST (GMT+5:30)'}
      authProvider={authProvider}
      authEmail={authEmail}
      isAdmin={brand.isAdmin}
      instagram={instagram}
      teamMembers={teamMembers}
      pendingInvites={pendingInvites}
    /></Suspense>
  )
}
