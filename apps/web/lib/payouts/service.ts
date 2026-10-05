import 'server-only'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { logOpsEvent } from '@/lib/ops-audit'
import { getPayoutProvider } from './index'

/**
 * Vendor payout lifecycle (ops only, service role, explicit columns):
 *
 *   requested ──approve──▶ approved ──record reference──▶ paid
 *        └─────────── cancel ───────────┘
 *
 * "paid" requires an approval and a reference; the database refuses it
 * otherwise (CHECK vp_paid_has_ref, 0524). Every step writes ops_events, and
 * a failed audit write fails the step (CLAUDE.md).
 *
 * NO MESSAGE TO THE CREATOR IS SENT FROM HERE. The paid WhatsApp fires only
 * from a real provider's success callback (RazorpayX payout.processed), which
 * does not exist yet. The manual provider notifies nobody.
 */

const COLS = 'id, experience_id, deal_id, vendor_id, amount_paise, tds_paise, net_amount_paise, status, provider, idempotency_key, external_ref, approved_at, paid_at'

export type PayoutRow = {
  id: string; experience_id: string; deal_id: string | null; vendor_id: string
  amount_paise: number; tds_paise: number; net_amount_paise: number
  status: 'requested' | 'approved' | 'processing' | 'paid' | 'failed' | 'cancelled'
  provider: 'manual' | 'razorpayx'; idempotency_key: string; external_ref: string | null
  approved_at: string | null; paid_at: string | null
}

export interface PayoutRequestInput {
  experienceId: string
  dealId?: string | null
  vendorId: string
  amountPaise: number
  tdsPaise?: number
  reason: string
  costLineId?: string | null
  followOnId?: string | null
  /** Same key → same payout. Required: a retried request must never pay twice. */
  idempotencyKey: string
}

/** Create a payout request, or return the existing one for this idempotency key. */
export async function requestVendorPayout(admin: SupabaseClient, actor: User, p: PayoutRequestInput): Promise<PayoutRow> {
  if (!Number.isSafeInteger(p.amountPaise) || p.amountPaise <= 0) throw new Error('Payout amount must be a positive whole number of paise')
  const tds = p.tdsPaise ?? 0
  if (!Number.isSafeInteger(tds) || tds < 0 || tds > p.amountPaise) throw new Error('TDS must be between 0 and the amount')
  if (!p.idempotencyKey?.trim()) throw new Error('An idempotency key is required')

  const { data: existing } = await admin.from('vendor_payouts').select(COLS).eq('idempotency_key', p.idempotencyKey).maybeSingle()
  if (existing) return existing as PayoutRow

  const { data, error } = await admin.from('vendor_payouts').insert({
    experience_id: p.experienceId, deal_id: p.dealId ?? null, vendor_id: p.vendorId,
    cost_line_id: p.costLineId ?? null, follow_on_id: p.followOnId ?? null, reason: p.reason,
    amount_paise: p.amountPaise, tds_paise: tds, net_amount_paise: p.amountPaise - tds,
    provider: 'manual', idempotency_key: p.idempotencyKey,
  }).select(COLS).single()
  if (error) {
    // Lost a race on the same key: return the winner rather than erroring.
    const { data: again } = await admin.from('vendor_payouts').select(COLS).eq('idempotency_key', p.idempotencyKey).maybeSingle()
    if (again) return again as PayoutRow
    throw new Error(`Could not create payout: ${error.message}`)
  }
  await logOpsEvent(actor, 'vendor_payout.requested', 'vendor_payouts', data.id, {
    experience_id: p.experienceId, vendor_id: p.vendorId, amount_paise: p.amountPaise, tds_paise: tds,
  })
  return data as PayoutRow
}

async function usersRowId(admin: SupabaseClient, actor: User): Promise<string | null> {
  const { data } = await admin.from('users').select('id').eq('auth_id', actor.id).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

/** Approve a requested payout and hand it to its provider (manual: nothing moves yet). */
export async function approveVendorPayout(admin: SupabaseClient, actor: User, payoutId: string): Promise<PayoutRow> {
  const approver = await usersRowId(admin, actor)
  const { data, error } = await admin.from('vendor_payouts')
    .update({ status: 'approved', approved_by: approver, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', payoutId).eq('status', 'requested')
    .select(COLS).maybeSingle()
  if (error) throw new Error(`Could not approve payout: ${error.message}`)
  if (!data) throw new Error('Only a requested payout can be approved')
  const row = data as PayoutRow

  const result = await getPayoutProvider(row.provider).initiate({
    payoutId: row.id, vendorId: row.vendor_id, netAmountPaise: row.net_amount_paise,
    idempotencyKey: row.idempotency_key, reason: 'vendor payout',
  })
  await logOpsEvent(actor, 'vendor_payout.approved', 'vendor_payouts', row.id, {
    status_before: 'requested', status_after: 'approved', net_amount_paise: row.net_amount_paise, provider_state: result.state,
  })
  return row
}

/**
 * Record a transfer ops made by hand: approved → paid, with its reference.
 * Sends no message (see the file header).
 */
export async function recordManualPayment(admin: SupabaseClient, actor: User, payoutId: string, reference: string): Promise<PayoutRow> {
  const ref = reference?.trim()
  if (!ref) throw new Error('A payment reference (UTR) is required')
  const now = new Date().toISOString()
  const { data, error } = await admin.from('vendor_payouts')
    .update({ status: 'paid', external_ref: ref, paid_at: now, updated_at: now })
    .eq('id', payoutId).eq('status', 'approved').eq('provider', 'manual')
    .select(COLS).maybeSingle()
  if (error) throw new Error(`Could not record payment: ${error.message}`)
  if (!data) throw new Error('Only an approved manual payout can be recorded as paid')
  await logOpsEvent(actor, 'vendor_payout.paid_manual', 'vendor_payouts', payoutId, {
    status_before: 'approved', status_after: 'paid', external_ref: ref, net_amount_paise: (data as PayoutRow).net_amount_paise,
  })
  return data as PayoutRow
}

/** Cancel a payout that has not been paid. */
export async function cancelVendorPayout(admin: SupabaseClient, actor: User, payoutId: string, why: string): Promise<void> {
  const { data, error } = await admin.from('vendor_payouts')
    .update({ status: 'cancelled', failure_reason: why || null, updated_at: new Date().toISOString() })
    .eq('id', payoutId).in('status', ['requested', 'approved'])
    .select('id, status').maybeSingle()
  if (error) throw new Error(`Could not cancel payout: ${error.message}`)
  if (!data) throw new Error('Only a requested or approved payout can be cancelled')
  await logOpsEvent(actor, 'vendor_payout.cancelled', 'vendor_payouts', payoutId, { status_after: 'cancelled', reason: why })
}
