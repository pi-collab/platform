'use server'

import { verifyApprovedBrand } from '@/lib/brand-auth'
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
  await verifyApprovedBrand()
  const supabase = createClient()

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

  const { error: updateErr } = await supabase
    .from('invoices')
    .update({
      status: 'accepted',
      accepted_at: now.toISOString(),
      due_date: dueDate,
      updated_at: now.toISOString(),
    })
    .eq('id', invoice.id)

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
 * STUBBED: No real payment. This is the single swap-point for Razorpay Route.
 *
 * TODO: RAZORPAY ROUTE INTEGRATION
 * ─────────────────────────────────────────────────────────────────
 * Replace the stub below with:
 * 1. Create a Razorpay Payment Link for invoice.brand_pays_paise
 * 2. Return the link URL to the brand (redirect or open in new tab)
 * 3. Listen for Razorpay webhook (payment.captured / payment_link.paid)
 * 4. On webhook confirmation → call the invoice/deal updates below
 * The status transitions (invoice → paid, deal → paid → complete) and
 * the UI (BrandInvoiceCard) stay identical — only the trigger changes
 * from an immediate button click to a webhook callback.
 * ─────────────────────────────────────────────────────────────────
 */
export async function markAsPaid(dealId: string): Promise<InvoiceResult> {
  await verifyApprovedBrand()
  const supabase = createClient()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('deal_id', dealId)
    .maybeSingle()

  if (!invoice) return { status: 'error', message: 'Invoice not found.' }
  if (invoice.status !== 'accepted') {
    return { status: 'error', message: `Cannot mark as paid — invoice is "${invoice.status}".` }
  }

  // ── STUB: simulate successful payment (no real money moves) ──
  // In production, this block executes only after Razorpay webhook confirms payment.

  const now = new Date().toISOString()

  // 1. Invoice → paid
  const { error: invoiceErr } = await supabase
    .from('invoices')
    .update({ status: 'paid', paid_at: now, updated_at: now })
    .eq('id', invoice.id)

  if (invoiceErr) {
    return { status: 'error', message: `Failed to update invoice: ${invoiceErr.message}` }
  }

  // 2. Deal → paid (audit trigger fires)
  const { error: paidErr } = await supabase
    .from('deals')
    .update({ status: 'paid' })
    .eq('id', dealId)
    .eq('status', 'approved')

  if (paidErr) {
    return { status: 'error', message: `Failed to update deal to paid: ${paidErr.message}` }
  }

  // 3. Deal → complete (audit trigger fires again — two events logged)
  const { error: completeErr } = await supabase
    .from('deals')
    .update({ status: 'complete', completed_at: now })
    .eq('id', dealId)
    .eq('status', 'paid')

  if (completeErr) {
    return { status: 'error', message: `Deal marked paid but failed to complete: ${completeErr.message}` }
  }

  // Notify creator: payment received
  notifyDealParty(dealId, 'creator', 'payment_paid', (t) => `Payment received for ${t}`)

  revalidatePath(`/deals/${dealId}`)
  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}
