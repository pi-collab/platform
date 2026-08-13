'use server'

import { verifyCreator } from '@/lib/creator-auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyDealParty } from '@/lib/notifications'

type Result = { status: 'success' } | { status: 'error'; message: string }

/**
 * How long a creator must wait before chasing the same deal again.
 *
 * This is a REAL rate limit, not a UI nicety. The only previous guard was
 * `remindedIds` React state in PaymentsClient, which resets on refresh — so a
 * creator could re-send indefinitely. That was harmless while the reminder
 * only wrote an in-app row; now that it also emails, an unbounded button is an
 * email-flood vector against the brand. Spam complaints damage the sending
 * reputation of mail.guapd.com, which ALSO carries Supabase auth mail, so
 * password resets and signup confirmations would start landing in spam
 * because of an unrelated button.
 */
const REMINDER_COOLDOWN_HOURS = 24

export async function sendPaymentReminder(invoiceId: string): Promise<Result> {
  await verifyCreator()

  const supabase = createClient()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, deal_id, status, brand_pays_paise')
    .eq('id', invoiceId)
    .maybeSingle()

  if (!invoice) return { status: 'error', message: 'Invoice not found.' }

  if (invoice.status === 'paid') {
    return { status: 'error', message: 'This invoice is already paid.' }
  }

  if (invoice.status !== 'issued' && invoice.status !== 'accepted') {
    return { status: 'error', message: 'Cannot send reminder for this invoice status.' }
  }

  // ── Server-side cooldown ──
  // Checked against the last payment_reminder notification for this deal.
  // Admin client because the creator cannot read the brand's notification rows
  // under RLS, and this check must not be skippable from the client.
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString()

  const { data: recent } = await admin
    .from('notifications')
    .select('id, created_at')
    .eq('deal_id', invoice.deal_id)
    .eq('type', 'payment_reminder')
    .gt('created_at', cutoff)
    .limit(1)
    .maybeSingle()

  if (recent) {
    return {
      status: 'error',
      message: `You've already sent a reminder for this deal in the last ${REMINDER_COOLDOWN_HOURS} hours. Try again later.`,
    }
  }

  await notifyDealParty(
    invoice.deal_id,
    'brand',
    'payment_reminder',
    (t) => `Payment reminder for ${t} — the creator is waiting for payment`,
    {
      email: (ctx) => ({
        subject: `Payment reminder from ${ctx.creatorName} — ${ctx.dealLabel}`,
        heading: `${ctx.creatorName} is waiting on payment`,
        body: `The work on this deal is done and the invoice is outstanding. Settling it closes the deal out.`,
        // The invoice is authoritative for what is actually owed — it can
        // include revision overage the deal price does not carry.
        amountPaise: invoice.brand_pays_paise ?? ctx.brandPaysPaise,
        amountLabel: 'Amount due',
        ctaLabel: 'View invoice',
      }),
    },
  )

  return { status: 'success' }
}
