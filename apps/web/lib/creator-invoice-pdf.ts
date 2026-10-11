import 'server-only'
import { SimplePdf, wrap } from '@/lib/simple-pdf'
import { inr } from '@/lib/invoice-pdf'

/**
 * 0552: the creator's invoice to Guapd on an Experience deal, rendered on demand
 * from the issued row (creator_leg_invoice_doc / experience_console_creator_invoice_doc).
 * Every figure was copied from the locked terms by the database. No GST is
 * computed (CA to confirm the format); the creator's GSTIN is printed if given.
 * TDS is not on the invoice: Guapd deducts it at payment. No bank details.
 */
export interface CreatorInvoiceDoc {
  number: string; status: string; issued_at: string; shoot_confirmed_at: string
  billing_name: string; gstin: string | null
  day_rate_paise: number; days: number; gross_paise: number; platform_pct: number
  platform_fee_paise: number; net_paise: number; allowance_paise: number; payable_paise: number
  deal_ref: string | null; experience_title: string; brand_name: string | null; shoot_date: string | null; shoot_city: string | null
  bill_to: { legal_name: string; address: string | null; state: string | null; gstin: string | null; pan: string | null } | null
}

const date = (iso: string | null) => iso
  ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '-'

export function renderCreatorInvoicePdf(d: CreatorInvoiceDoc): Uint8Array {
  const pdf = new SimplePdf()
  const L = 48, R = pdf.width - 48, W = R - L
  let y = 60

  pdf.text(L, y, d.status === 'void' ? 'INVOICE (VOID)' : 'INVOICE', 20, 'bold')
  pdf.textRight(R, y - 4, d.number, 11, 'bold')
  pdf.textRight(R, y + 10, `Issued ${date(d.issued_at)}`, 9, 'regular', 0.35)
  y += 34
  pdf.line(L, y, R, y)
  y += 22

  const colW = W / 2 - 12
  const block = (x: number, top: number, title: string, lines: (string | null)[]) => {
    let yy = top
    pdf.text(x, yy, title, 8, 'bold', 0.45); yy += 14
    for (const raw of lines) {
      if (!raw) continue
      for (const l of wrap(raw, 9.5, colW)) { pdf.text(x, yy, l, 9.5); yy += 13 }
    }
    return yy
  }
  const left = block(L, y, 'FROM', [d.billing_name, d.gstin ? `GSTIN: ${d.gstin}` : null])
  const right = block(L + W / 2 + 12, y, 'INVOICE', [
    `Invoice no: ${d.number}`, `Invoice date: ${date(d.issued_at)}`,
    d.deal_ref ? `Deal: ${d.deal_ref}` : null,
    `Shoot: ${d.shoot_date ? date(d.shoot_date) : 'as booked'}${d.shoot_city ? `, ${d.shoot_city}` : ''}`,
  ])
  y = Math.max(left, right) + 16
  const b = d.bill_to
  y = block(L, y, 'BILL TO', b
    ? [b.legal_name, b.address, b.state ? `State: ${b.state}` : null, b.gstin ? `GSTIN: ${b.gstin}` : null, b.pan ? `PAN: ${b.pan}` : null]
    : ['Guapd']) + 18

  pdf.box(L, y - 13, W, 20, 0.94)
  pdf.text(L + 8, y, 'Description', 9, 'bold')
  pdf.textRight(R - 8, y, 'Amount', 9, 'bold')
  y += 22
  const line = (label: string, value: string, bold = false) => {
    const ls = wrap(label, 10, W - 150, bold ? 'bold' : 'regular')
    pdf.textRight(R - 8, y, value, 10, bold ? 'bold' : 'regular')
    for (const l of ls) { pdf.text(L + 8, y, l, 10, bold ? 'bold' : 'regular'); y += 14 }
    y += 4
  }
  const days = Number(d.days)
  line(`Shoot day rate, ${d.experience_title}${d.brand_name ? ` (${d.brand_name}, managed by Guapd)` : ''}: ${inr(d.day_rate_paise)} x ${days} day${days === 1 ? '' : 's'}`, inr(d.gross_paise))
  line(`Less Guapd platform fee (${Number(d.platform_pct)}%)`, `-${inr(d.platform_fee_paise)}`)
  line('Net fee', inr(d.net_paise))
  if (d.allowance_paise > 0) line('Travel and other allowance (no platform fee)', inr(d.allowance_paise))
  y += 2
  pdf.line(L, y, R, y)
  y += 18
  pdf.text(R - 230, y, 'Total payable', 11, 'bold')
  pdf.textRight(R - 8, y, inr(d.payable_paise), 11, 'bold')
  y += 26

  for (const t of [
    `The creator confirmed on ${date(d.shoot_confirmed_at)} that the shoot is done.`,
    'TDS, if applicable, is deducted by Guapd at payment and shown on the payout statement.',
    ...(d.gstin ? [] : ['GST is not charged on this invoice.']),
  ]) { for (const l of wrap(t, 9, W)) { pdf.text(L, y, l, 9, 'regular', 0.35); y += 12 } }

  pdf.text(L, pdf.height - 40, `${d.experience_title} · Raised on Guapd. This is a computer-generated invoice.`, 8, 'regular', 0.5)
  return pdf.toBytes()
}
