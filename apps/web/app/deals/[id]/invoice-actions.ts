'use server'

import { verifyApprovedBrand } from '@/lib/brand-auth'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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

  revalidatePath(`/deals/${dealId}`)
  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}
