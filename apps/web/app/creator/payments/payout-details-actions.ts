'use server'

import { revalidatePath } from 'next/cache'
import { verifyCreator } from '@/lib/creator-auth'
import { createClient } from '@/lib/supabase/server'
import { notifyPayoutDetailsChanged } from '@/lib/experience-counter-notify'

/**
 * The creator's bank details for Guapd payouts (0542). Saved through
 * creator_set_payout_details with the creator's own session: the account
 * number and PAN are encrypted in the database with a Vault-held key, and
 * what comes back is MASKED. Nothing here logs, stores or returns the values.
 * A change to existing details sends the creator a security notice.
 */
export type PayoutDetailsView = {
  on_file: boolean; account_holder_name?: string | null; account_masked?: string | null; ifsc?: string | null
  pan_masked?: string | null; gst_registered?: boolean | null; changed_at?: string | null
}

export async function savePayoutDetails(f: { holder: string; account: string; accountConfirm: string; ifsc: string; pan: string; gstRegistered: boolean | null }): Promise<{ ok: true; view: PayoutDetailsView } | { ok: false; message: string }> {
  const ctx = await verifyCreator()
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
  if (typeof f.gstRegistered !== 'boolean') return { ok: false, message: 'Say whether you are GST-registered.' }
  const { data, error } = await createClient().rpc('creator_set_payout_details', {
    p_holder: str(f.holder, 100), p_account: str(f.account, 40), p_account_confirm: str(f.accountConfirm, 40),
    p_ifsc: str(f.ifsc, 20), p_pan: str(f.pan, 20) || null, p_gst_registered: f.gstRegistered,
  })
  if (error) return { ok: false, message: error.message.replace(/^.*?: /, '') }
  const view = data as PayoutDetailsView & { changed: boolean; first_time: boolean }
  if (view.changed && !view.first_time) await notifyPayoutDetailsChanged(ctx.profileId)
  revalidatePath('/creator/payments')
  return { ok: true, view }
}
