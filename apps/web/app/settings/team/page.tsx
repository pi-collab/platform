import { verifyApprovedBrand } from '@/lib/brand-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import TeamPage from './TeamPage'

export default async function SettingsTeamPage() {
  const brand = await verifyApprovedBrand()
  const admin = createAdminClient()

  // Fetch team members with user details
  const { data: members } = await admin
    .from('brand_members')
    .select('id, is_admin, created_at, user_id, users(email, full_name)')
    .eq('brand_id', brand.brandId)
    .order('created_at', { ascending: true })

  // Fetch pending invites (active = pending + not expired)
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

  return (
    <TeamPage
      brandName={brand.brandName}
      isAdmin={brand.isAdmin}
      members={teamMembers}
      pendingInvites={pendingInvites}
    />
  )
}
