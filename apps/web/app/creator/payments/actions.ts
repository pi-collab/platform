'use server'

import { verifyCreator } from '@/lib/creator-auth'
import { createClient } from '@/lib/supabase/server'
import { notifyDealParty } from '@/lib/notifications'

type Result = { status: 'success' } | { status: 'error'; message: string }

export async function sendPaymentReminder(invoiceId: string): Promise<Result> {
  await verifyCreator()

  const supabase = createClient()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, deal_id, status')
    .eq('id', invoiceId)
    .maybeSingle()

  if (!invoice) return { status: 'error', message: 'Invoice not found.' }

  if (invoice.status === 'paid') {
    return { status: 'error', message: 'This invoice is already paid.' }
  }

  if (invoice.status !== 'issued' && invoice.status !== 'accepted') {
    return { status: 'error', message: 'Cannot send reminder for this invoice status.' }
  }

  await notifyDealParty(
    invoice.deal_id,
    'brand',
    'payment_reminder',
    (t) => `Payment reminder for ${t} — the creator is waiting for payment`,
  )

  return { status: 'success' }
}
