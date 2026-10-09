'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notifyOtherParty } from '@/lib/notifications'
import { notifyStaffCreatorMessage } from '@/lib/experience-leg-notify'

interface SendResult {
  status: 'success' | 'error'
  message?: string
  data?: { id: string; body: string; sender_party: string; created_at: string }
}

/**
 * Send a message on a deal thread. Notifies the other party.
 */
export async function sendMessage(
  dealId: string,
  body: string,
  senderParty: 'brand' | 'creator',
): Promise<SendResult> {
  const trimmed = body.trim()
  if (!trimmed) return { status: 'error', message: 'Message cannot be empty.' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Not authenticated.' }

  // Get profile id for notification
  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()

  // 0546: an Experience creator leg is a Guapd ↔ creator thread. Direct
  // inserts on a leg are refused by the database, so the creator writes
  // through creator_leg_message_send, and Guapd's staff (never the brand) are
  // told. Brand users are not parties to a leg at all.
  const { data: leg } = await supabase.from('deals').select('id, leg_role').eq('id', dealId).maybeSingle()
  if (leg?.leg_role === 'creator_leg') {
    if (senderParty !== 'creator') return { status: 'error', message: 'Not found.' }
    const { data: sent, error: legErr } = await supabase.rpc('creator_leg_message_send', { p_deal_id: dealId, p_body: trimmed })
    if (legErr) return { status: 'error', message: legErr.message }
    await notifyStaffCreatorMessage(dealId)
    revalidatePath('/creator/inbox')
    revalidatePath(`/creator/deals/${dealId}`)
    return { status: 'success', data: sent as { id: string; body: string; sender_party: string; created_at: string } }
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({ deal_id: dealId, body: trimmed, sender_party: senderParty })
    .select('id, body, sender_party, created_at')
    .single()

  if (error) return { status: 'error', message: error.message }

  // Notify the other party
  if (profile) {
    notifyOtherParty(dealId, profile.id, 'new_message', (t) => `New message on ${t}`)
  }

  revalidatePath('/inbox')
  revalidatePath('/creator/inbox')
  return { status: 'success', data }
}
