'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOfferToken } from '@/lib/offer-token'
import { notifyDealParty } from '@/lib/notifications'

export type OfferActionResult =
  | { status: 'success' }
  | { status: 'auth_required' }
  | { status: 'error'; message: string }

/**
 * Accept an offer. Requires a valid session (auth gate).
 *
 * Steps:
 *   1. Re-validate token server-side
 *   2. Require auth session — return auth_required if missing
 *   3. Ensure users row exists (service-role: new creator, RLS can't self-insert with correct role)
 *   4. Claim creator stub (service-role: no RLS update policy for creators by new users)
 *   5. Transition deal negotiating → agreed (service-role: stub just claimed, RLS context unreliable)
 *
 * All service-role writes are gated by token validity + session.
 */
export async function acceptOffer(token: string): Promise<OfferActionResult> {
  // 1. Validate token
  const parsed = verifyOfferToken(token)
  if (!parsed) return { status: 'error', message: 'This link is invalid or has expired.' }

  // 2. Require auth
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'auth_required' }

  const admin = createAdminClient()

  // 3. Ensure users row exists for this creator
  const { data: existingUser } = await admin
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()

  let userId: string

  if (existingUser) {
    userId = existingUser.id
  } else {
    const { data: newUser, error: userErr } = await admin
      .from('users')
      .insert({
        auth_id: user.id,
        role: 'creator',
        full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
        email: user.email,
      })
      .select('id')
      .single()

    if (userErr || !newUser) {
      return { status: 'error', message: 'Failed to create your account. Please try again.' }
    }
    userId = newUser.id
  }

  // 4. Claim the creator stub
  // Fetch the deal to get creator_id
  const { data: deal } = await admin
    .from('deals')
    .select('id, creator_id, status')
    .eq('id', parsed.dealId)
    .single()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (deal.status !== 'negotiating') {
    return { status: 'error', message: 'This offer has already been responded to.' }
  }

  // Fetch the creator stub
  const { data: creator } = await admin
    .from('creators')
    .select('id, user_id')
    .eq('id', deal.creator_id)
    .single()

  if (!creator) return { status: 'error', message: 'Creator profile not found.' }

  if (creator.user_id && creator.user_id !== userId) {
    return { status: 'error', message: 'This offer is for a different creator.' }
  }

  // Claim: set user_id on the creator stub if not already set
  if (!creator.user_id) {
    const { error: claimErr } = await admin
      .from('creators')
      .update({ user_id: userId })
      .eq('id', creator.id)

    if (claimErr) {
      return { status: 'error', message: 'Failed to link your account. Please try again.' }
    }
  }

  // 5. Transition deal → agreed
  const { data: updated, error: updateErr } = await admin
    .from('deals')
    .update({ status: 'agreed' })
    .eq('id', deal.id)
    .eq('status', 'negotiating') // guard: only if still negotiating
    .select('id')
    .maybeSingle()

  if (updateErr) {
    return { status: 'error', message: 'Failed to accept the offer. Please try again.' }
  }

  if (!updated) {
    return { status: 'error', message: 'This offer has already been responded to.' }
  }

  // Notify brand: deal agreed (via offer link)
  await notifyDealParty(deal.id, 'brand', 'deal_agreed', (t) => `${t}: deal agreed`, {
    email: (ctx) => ({
      subject: `${ctx.creatorName} accepted your offer: ${ctx.dealLabel}`,
      heading: `${ctx.creatorName} accepted your offer`,
      body: `The terms are now agreed and the deal has moved forward. You can view the full terms and next steps on the deal.`,
      amountPaise: ctx.brandPaysPaise,
      amountLabel: 'Deal value',
    }),
  })

  return { status: 'success' }
}

/**
 * Decline an offer. Requires a valid session (same auth gate as accept).
 *
 * Steps:
 *   1. Re-validate token
 *   2. Require auth session
 *   3. Ensure users row + claim stub (same as accept — the real creator is declining)
 *   4. Transition deal negotiating → declined (service-role)
 *   5. Optionally log decline reason as a message
 */
export async function declineOffer(token: string, reason?: string): Promise<OfferActionResult> {
  // 1. Validate token
  const parsed = verifyOfferToken(token)
  if (!parsed) return { status: 'error', message: 'This link is invalid or has expired.' }

  // 2. Require auth
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'auth_required' }

  const admin = createAdminClient()

  // 3. Ensure users row exists
  const { data: existingUser } = await admin
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()

  let userId: string

  if (existingUser) {
    userId = existingUser.id
  } else {
    const { data: newUser, error: userErr } = await admin
      .from('users')
      .insert({
        auth_id: user.id,
        role: 'creator',
        full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
        email: user.email,
      })
      .select('id')
      .single()

    if (userErr || !newUser) {
      return { status: 'error', message: 'Failed to create your account. Please try again.' }
    }
    userId = newUser.id
  }

  // Fetch deal + creator for validation
  const { data: deal } = await admin
    .from('deals')
    .select('id, creator_id, status')
    .eq('id', parsed.dealId)
    .single()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (deal.status !== 'negotiating') {
    return { status: 'error', message: 'This offer has already been responded to.' }
  }

  const { data: creator } = await admin
    .from('creators')
    .select('id, user_id')
    .eq('id', deal.creator_id)
    .single()

  if (!creator) return { status: 'error', message: 'Creator profile not found.' }

  if (creator.user_id && creator.user_id !== userId) {
    return { status: 'error', message: 'This offer is for a different creator.' }
  }

  // Claim stub if needed
  if (!creator.user_id) {
    const { error: claimErr } = await admin
      .from('creators')
      .update({ user_id: userId })
      .eq('id', creator.id)

    if (claimErr) {
      return { status: 'error', message: 'Failed to link your account. Please try again.' }
    }
  }

  // 4. Transition deal → declined
  const { data: updated, error: updateErr } = await admin
    .from('deals')
    .update({ status: 'declined' })
    .eq('id', deal.id)
    .eq('status', 'negotiating')
    .select('id')
    .maybeSingle()

  if (updateErr) {
    return { status: 'error', message: 'Failed to decline the offer. Please try again.' }
  }

  if (!updated) {
    return { status: 'error', message: 'This offer has already been responded to.' }
  }

  // Notify brand: offer declined (via offer link)
  await notifyDealParty(deal.id, 'brand', 'offer_declined', (t) => `Offer declined: ${t}`, {
    email: (ctx) => ({
      subject: `${ctx.creatorName} declined your offer: ${ctx.dealLabel}`,
      heading: `${ctx.creatorName} declined your offer`,
      body: `This deal will not go ahead. Any reason they gave is on the deal thread. You can re-engage them with revised terms at any time.`,
    }),
  })

  // 5. Log decline reason if provided
  if (reason?.trim()) {
    await admin.from('messages').insert({
      deal_id: deal.id,
      sender_id: userId,
      sender_party: 'creator',
      body: `Declined: ${reason.trim()}`,
    })
  }

  return { status: 'success' }
}
