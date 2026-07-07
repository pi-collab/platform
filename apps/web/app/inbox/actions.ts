'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notifyOtherParty } from '@/lib/notifications'

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
