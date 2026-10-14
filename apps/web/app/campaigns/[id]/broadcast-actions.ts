'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { verifyBrand } from '@/lib/brand-auth'
import { notifyOtherParty } from '@/lib/notifications'

/**
 * 6.1 item 10: the brand writes once to every creator on a campaign. Each
 * creator gets it in THEIR OWN deal thread as a normal message (so replies come
 * back one thread at a time, and nobody sees who else got it). Written with the
 * brand's own session: RLS allows a message only on the brand's own open deals,
 * so a broadcast can reach nothing a single message could not.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function broadcastToCampaign(campaignId: string, body: string): Promise<{ ok: true; data: number } | { ok: false; error: string }> {
  const { profileId } = await verifyBrand()
  if (!UUID.test(campaignId)) return { ok: false, error: 'Not found.' }
  const text = typeof body === 'string' ? body.trim() : ''
  if (!text) return { ok: false, error: 'Write a message first.' }
  if (text.length > 4000) return { ok: false, error: 'A message is at most 4,000 characters.' }
  const supabase = createClient()
  const { data: deals, error } = await supabase.from('deals').select('id, status')
    .eq('campaign_id', campaignId).not('status', 'in', '(complete,declined,cancelled)').limit(200)
  if (error) return { ok: false, error: 'Could not load the campaign.' }
  if (!deals || deals.length === 0) return { ok: false, error: 'No open deal on this campaign to message.' }
  let sent = 0
  for (const d of deals) {
    const { error: e } = await supabase.from('messages').insert({ deal_id: d.id, body: text, sender_party: 'brand' })
    if (e) continue
    sent++
    await notifyOtherParty(d.id as string, profileId, 'new_message', (t) => `New message on ${t}`)
  }
  revalidatePath(`/campaigns/${campaignId}`); revalidatePath('/inbox'); revalidatePath('/creator/inbox')
  return sent ? { ok: true, data: sent } : { ok: false, error: 'The message could not be sent.' }
}
