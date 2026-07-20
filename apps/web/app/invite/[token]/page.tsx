import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import AcceptInviteCard from './AcceptInviteCard'

export const metadata = { title: 'Join your team', robots: { index: false, follow: false } }

export default async function InvitePage({ params }: { params: { token: string } }) {
  const admin = createAdminClient()

  // 1. Look up invite by token
  const { data: invite } = await admin
    .from('brand_invites')
    .select('id, brand_id, email, status, expires_at, brands(name)')
    .eq('token', params.token)
    .maybeSingle()

  if (!invite) {
    return <ErrorCard message="Invalid invite link." sub="This link doesn't exist. Check with your admin for a new invite." />
  }

  if (invite.status !== 'pending') {
    const msg = invite.status === 'accepted'
      ? 'This invite has already been used.'
      : invite.status === 'revoked'
        ? 'This invite has been revoked.'
        : 'This invite is no longer valid.'
    return <ErrorCard message={msg} sub="Ask your admin for a new invite." />
  }

  if (new Date(invite.expires_at) <= new Date()) {
    // Mark expired in DB (best-effort, don't block the page)
    admin.from('brand_invites').update({ status: 'expired' }).eq('id', invite.id).then(() => {})
    return <ErrorCard message="This invite has expired." sub="Ask your admin for a new invite." />
  }

  const brandName = (invite as any).brands?.name ?? 'your team'

  // 2. Check if user is authenticated
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Not logged in — show the "Sign in to accept" card
    return <AcceptInviteCard brandName={brandName} inviteEmail={invite.email} token={params.token} needsAuth />
  }

  // 3. User is authenticated — validate
  const userEmail = user.email?.toLowerCase()
  const inviteEmail = invite.email.toLowerCase()

  if (userEmail !== inviteEmail) {
    return (
      <ErrorCard
        message="Email mismatch"
        sub={`This invite was sent to ${invite.email}. You're signed in as ${user.email}. Sign in with the invited email, or ask your admin for a new invite to your current email.`}
      />
    )
  }

  // Get internal user profile
  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (!profile) {
    // Edge case: auth exists but no users row (shouldn't happen normally)
    // Create it (same as auth callback does)
    const { data: newProfile, error: insertErr } = await admin
      .from('users')
      .insert({ auth_id: user.id, email: user.email, role: 'brand_member' })
      .select('id')
      .single()

    if (insertErr || !newProfile) {
      return <ErrorCard message="Account setup failed." sub="Please try again or contact support." />
    }

    return await acceptAndRedirect(admin, invite, newProfile.id)
  }

  // Check if already belongs to a brand
  const { data: existingMembership } = await admin
    .from('brand_members')
    .select('id, brand_id')
    .eq('user_id', profile.id)
    .maybeSingle()

  if (existingMembership) {
    if (existingMembership.brand_id === invite.brand_id) {
      // Already a member of this brand
      redirect('/deals')
    }
    return (
      <ErrorCard
        message="Already belongs to a brand"
        sub="Your account is already linked to another brand. Each account can only belong to one brand."
      />
    )
  }

  // 4. Accept the invite
  return await acceptAndRedirect(admin, invite, profile.id)
}

async function acceptAndRedirect(
  admin: ReturnType<typeof createAdminClient>,
  invite: { id: string; brand_id: string },
  userId: string
) {
  // Insert brand_members row
  const { error: memberErr } = await admin
    .from('brand_members')
    .insert({ brand_id: invite.brand_id, user_id: userId, is_admin: false })

  if (memberErr) {
    return <ErrorCard message="Failed to join team." sub={memberErr.message} />
  }

  // Mark invite as accepted
  await admin
    .from('brand_invites')
    .update({ status: 'accepted', accepted_by: userId })
    .eq('id', invite.id)

  redirect('/deals')
}

function ErrorCard({ message, sub }: { message: string; sub: string }) {
  return (
    <main style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', minHeight: '100vh', background: '#FDFAF6', padding: '4rem 1.5rem' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', border: '1px solid #DDD3BE', borderRadius: 16, padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.25rem', fontWeight: 700, color: '#16100B', margin: '0 0 0.75rem' }}>{message}</h1>
        <p style={{ fontSize: '0.9375rem', color: '#7A6D61', margin: 0, lineHeight: 1.5 }}>{sub}</p>
      </div>
    </main>
  )
}
