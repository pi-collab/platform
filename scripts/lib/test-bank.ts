/**
 * 0580/0581: a creator invoice needs the creator's bank account and PAN on file. Live tests
 * raise invoices as real staging creators, so before raising, a creator with
 * nothing on file gets TEST details saved through their own session (the real,
 * encrypted path). Only those are removed afterwards: a creator's own saved
 * details are never touched.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const added = new Set<string>()

/** Make sure the creator behind this session has a bank account on file. */
export async function ensureTestBank(s: SupabaseClient, creatorId: string): Promise<void> {
  if (added.has(creatorId)) return
  const cur = (await s.rpc('creator_payout_details')).data as { on_file?: boolean; pan_masked?: string | null } | null
  if (cur?.on_file === true && cur.pan_masked) return
  // 0581: an invoice also needs a PAN. A creator with their own bank account but no PAN is not overwritten.
  if (cur?.on_file === true) throw new Error(`staging creator ${creatorId} has bank details but no PAN: add one, or pick another creator`)
  const r = await s.rpc('creator_set_payout_details', {
    p_holder: 'Test Creator', p_account: '501004433221', p_account_confirm: '501004433221',
    p_ifsc: 'HDFC0001234', p_pan: 'ABCPT1234Q', p_gst_registered: false,
  })
  if (r.error) throw new Error('test bank details: ' + r.error.message)
  added.add(creatorId)
}

/** Same, from a deal id (the helpers that only know the deal). */
export async function ensureTestBankForDeal(admin: SupabaseClient, s: SupabaseClient, dealId: string): Promise<void> {
  const c = (await admin.from('deals').select('creator_id').eq('id', dealId).single()).data as { creator_id: string } | null
  if (c?.creator_id) await ensureTestBank(s, c.creator_id)
}

/** Remove only the details this run saved. Returns how many are left (0 = clean). */
export async function removeTestBank(admin: SupabaseClient): Promise<number> {
  if (!added.size) return 0
  const { data: vs } = await admin.from('vendors').select('id').in('creator_id', Array.from(added))
  const ids = (vs ?? []).map((v: any) => v.id)
  if (ids.length) {
    await admin.from('vendor_payout_detail_changes').delete().in('vendor_id', ids)
    await admin.from('vendor_payout_details').delete().in('vendor_id', ids)
  }
  const left = ids.length ? ((await admin.from('vendor_payout_details').select('vendor_id').in('vendor_id', ids)).data ?? []).length : 0
  added.clear()
  return left
}
