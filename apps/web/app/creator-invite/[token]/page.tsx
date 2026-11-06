import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorInvitesEnabled } from '@/lib/meta/config'
import { INVITE_TOKEN } from '@/lib/meta/invites'
import InviteClient, { type InviteState } from './InviteClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Campaign invite · Guapd', robots: { index: false, follow: false } }

/**
 * A brand's invite to a creator found on Instagram (guapd.com/c/i-<token>).
 * Shows the approved brand's name and Guapd's own summary (built from fixed
 * lists, lib/meta/invite-gate.ts), never text the brand typed or Meta data, and walks the creator
 * through: sign up with phone OTP → connect Instagram → accept.
 */
export default async function InvitePage({ params }: { params: { token: string } }) {
  if (!creatorInvitesEnabled() || !INVITE_TOKEN.test(params.token)) notFound()
  const admin = createAdminClient()
  const { data: invite } = await admin.from('brand_creator_invites')
    .select('id, ig_username, summary, deliverables, accepted_at, signed_up_at, brands(name, logo_url, brand_status)')
    .eq('token', params.token).maybeSingle()
  if (!invite) notFound()
  const brand = (invite as unknown as { brands: { name: string | null; logo_url: string | null; brand_status: string } | null }).brands
  // Only an approved brand's invite exists (0591): unapproved or later
  // rejected, the link is a 404, like one that was never made.
  if (!brand || brand.brand_status !== 'approved') notFound()

  let state: InviteState = 'visitor'
  if (invite.accepted_at) state = 'accepted'
  else {
    const { data: { user } } = await createClient().auth.getUser()
    if (user) {
      const { data: profile } = await admin.from('users').select('id').eq('auth_id', user.id).maybeSingle()
      const { data: creator } = profile ? await admin.from('creators').select('id').eq('user_id', profile.id).maybeSingle() : { data: null }
      if (creator) {
        // On Guapd now: the "signed up" step of the funnel.
        if (!invite.signed_up_at) await admin.from('brand_creator_invites').update({ signed_up_at: new Date().toISOString() }).eq('id', invite.id).is('signed_up_at', null)
        const { data: ig } = await admin.from('creator_instagram_connections').select('username, status').eq('creator_id', creator.id).maybeSingle()
        state = !ig || ig.status !== 'connected' ? 'needs_instagram'
          : (ig.username ?? '').toLowerCase() === invite.ig_username ? 'ready' : 'mismatch'
      } else {
        state = 'not_creator'
      }
    }
  }

  return (
    <InviteClient
      token={params.token}
      state={state}
      brandName={brand?.name ?? 'A brand'}
      brandLogo={brand?.logo_url ?? null}
      username={invite.ig_username}
      summary={invite.summary}
      deliverables={invite.deliverables ?? []}
      timeline={null}
    />
  )
}
