/**
 * Test fixture: a service invoice row written with the service role, in the
 * shape 0540 requires. Production code never does this: invoices are drafted,
 * numbered and issued only by the experience_console_invoice_* functions
 * (financial access). Tests use it to set up P&L and isolation cases quickly.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

let seq = 0
export async function fixtureInvoice(admin: SupabaseClient, p: {
  experienceId: string; brandId: string; kind: 'initial' | 'additional'; source?: 'existing_footage' | 'new_shoot'
  subtotalPaise: number; gstPaise?: number; status?: 'draft' | 'issued' | 'paid'
}): Promise<{ id: string; number: string | null; subtotalPaise: number }> {
  const status = p.status ?? 'draft'
  const issued = status !== 'draft'
  const number = issued ? `GPD/99-00/T${String(Date.now()).slice(-5)}${++seq}` : null
  const { data, error } = await admin.from('service_invoices').insert({
    experience_id: p.experienceId, brand_id: p.brandId, kind: p.kind, source: p.source ?? null, status,
    description: '[fixture] Content production service',
    lines: [{ description: '[fixture] Content production service', amount_paise: p.subtotalPaise }],
    subtotal_paise: p.subtotalPaise, igst_paise: p.gstPaise ?? null, supplier_gst_registered: p.gstPaise ? true : false,
    total_paise: p.subtotalPaise + (p.gstPaise ?? 0),
    ...(issued ? { number, issue_date: new Date().toISOString().slice(0, 10), issued_at: new Date().toISOString(),
      supplier_legal_name: '[fixture] Guapd', recipient_legal_name: '[fixture] Brand' } : {}),
    ...(status === 'paid' ? { payment_reference: 'UTR-FIXTURE', paid_at: new Date().toISOString() } : {}),
  }).select('id, number').single()
  if (error || !data) throw new Error(`fixture invoice: ${error?.message}`)
  return { id: data.id, number: data.number, subtotalPaise: p.subtotalPaise }
}

/** Fields that turn a fixture draft into an issued invoice (an update the 0540 freeze trigger allows from draft). */
export function issuedFields(): Record<string, unknown> {
  return { status: 'issued', number: `GPD/99-00/U${String(Date.now()).slice(-5)}${++seq}`, issue_date: new Date().toISOString().slice(0, 10),
    issued_at: new Date().toISOString(), supplier_legal_name: '[fixture] Guapd', recipient_legal_name: '[fixture] Brand' }
}
