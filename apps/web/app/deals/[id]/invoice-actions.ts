'use server'

import { verifyBrand } from '@/lib/brand-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notifyDealParty } from '@/lib/notifications'

type InvoiceResult =
  | { status: 'success' }
  | { status: 'error'; message: string }

/**
 * Accept an invoice (issued → accepted). Sets due_date from payment_due_days.
 */
export async function acceptInvoice(dealId: string): Promise<InvoiceResult> {
  const brand = await verifyBrand()
  const supabase = createClient()

  // The deal's own brand. The invoice is written with the service role below
  // (migration 0521), so this is the boundary, not RLS.
  const { data: owned } = await supabase
    .from('deals')
    .select('id')
    .eq('id', dealId)
    .eq('brand_id', brand.brandId)
    .maybeSingle()
  if (!owned) return { status: 'error', message: 'Deal not found.' }

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, status, payment_due_days')
    .eq('deal_id', dealId)
    .maybeSingle()

  if (!invoice) return { status: 'error', message: 'Invoice not found.' }
  if (invoice.status !== 'issued') {
    return { status: 'error', message: `Cannot accept an invoice that is "${invoice.status}".` }
  }

  const now = new Date()
  let dueDate: string | null = null
  if (invoice.payment_due_days != null) {
    const due = new Date(now)
    due.setDate(due.getDate() + invoice.payment_due_days)
    dueDate = due.toISOString().split('T')[0] // date only
  }

  const { error: updateErr } = await createAdminClient()
    .from('invoices')
    .update({
      status: 'accepted',
      accepted_at: now.toISOString(),
      due_date: dueDate,
      updated_at: now.toISOString(),
    })
    .eq('id', invoice.id)
    .eq('status', 'issued')

  if (updateErr) {
    return { status: 'error', message: `Failed to accept invoice: ${updateErr.message}` }
  }

  // Notify creator: invoice accepted
  notifyDealParty(dealId, 'creator', 'invoice_accepted', (t) => `Invoice accepted for ${t}`)

  revalidatePath(`/deals/${dealId}`)
  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}

/**
 * Mark an invoice as paid (accepted → paid) and complete the deal.
 *
 * NO MONEY MOVES HERE. On a Deals / Growth deal the brand pays the creator
 * DIRECTLY (UPI / bank), off the platform; Guapd never collects or forwards
 * that money (CLAUDE.md, and the payment guardrail: no pool-and-split, which
 * is why Razorpay Route is not the plan). This records the brand's
 * confirmation that it has paid, so the deal can close.
 *
 * It used to be written as a payment stub, and it messaged the creator
 * "payment released / sent to your linked account" on WhatsApp the moment the
 * brand clicked, when nothing had been sent by anyone. The creator is now told
 * the brand MARKED it paid, and to check their account.
 */
export async function markAsPaid(dealId: string): Promise<InvoiceResult> {
  await verifyBrand()
  const supabase = createClient()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, status, creator_receives_paise')
    .eq('deal_id', dealId)
    .maybeSingle()

  if (!invoice) return { status: 'error', message: 'Invoice not found.' }
  if (invoice.status !== 'accepted') {
    return { status: 'error', message: `Cannot mark as paid: invoice is "${invoice.status}".` }
  }

  // The brand's confirmation, recorded. Atomic: invoice→paid + deal→paid + deal→complete in a single Postgres
  // transaction via SECURITY DEFINER function (see 010_robustness_functions.sql).

  const { data: result, error: rpcErr } = await supabase.rpc('mark_deal_paid', {
    p_deal_id: dealId,
  })

  if (rpcErr) {
    return { status: 'error', message: `Payment failed: ${rpcErr.message}` }
  }

  const res = result as { status: string; message?: string; already?: boolean }

  if (res.status === 'error') {
    return { status: 'error', message: res.message ?? 'Unknown error.' }
  }

  // Idempotent: if already paid/complete, skip notification
  if (res.already) {
    revalidatePath(`/deals/${dealId}`)
    revalidatePath(`/creator/deals/${dealId}`)
    return { status: 'success' }
  }

  // Tell the creator the brand says it has paid: in-app only. NOT the
  // `payment_released` WhatsApp template, whose approved text says the money
  // was released and sent, which nobody here can know. `res.already` above
  // keeps this to one notice per deal.
  await notifyDealParty(dealId, 'creator', 'payment_paid', (t) => `Marked as paid: ${t}`)

  revalidatePath(`/deals/${dealId}`)
  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}
