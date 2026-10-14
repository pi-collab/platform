import 'server-only'
import { SimplePdf, wrap } from '@/lib/simple-pdf'

/**
 * The service invoice as a PDF, rendered ONCE from the frozen invoice
 * (experience_console_invoice_doc, 0540) at issue and stored. One clean
 * service price: no platform fee, no creator rates, no per-video breakdown.
 *
 * GST is whatever finance entered, never computed here. If Guapd is not
 * GST-registered the invoice says so and carries no GST.
 */
export interface InvoiceDoc {
  id: string
  number: string
  issue_date: string
  due_date: string | null
  description: string
  experience_title: string
  subtotal_paise: number
  gst_rate_pct: number | null
  cgst_paise: number | null
  sgst_paise: number | null
  igst_paise: number | null
  total_paise: number
  place_of_supply: string | null
  supplier: { legal_name: string; address: string | null; state: string | null; gstin: string | null; gst_registered: boolean | null; pan: string | null; payment_instructions: string | null }
  recipient: { legal_name: string; address: string | null; state: string | null; gstin: string | null; pan: string | null }
}

/** INR with Indian digit grouping, e.g. 16990000 paise → "INR 1,69,900.00". */
export function inr(paise: number): string {
  const neg = paise < 0
  const p = Math.abs(Math.round(paise))
  const rupees = Math.floor(p / 100).toString()
  const last3 = rupees.slice(-3)
  const rest = rupees.slice(0, -3)
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3
  return `${neg ? '-' : ''}INR ${grouped}.${String(p % 100).padStart(2, '0')}`
}

const date = (iso: string | null) => iso
  ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '-'

export function renderInvoicePdf(d: InvoiceDoc): Uint8Array {
  const pdf = new SimplePdf()
  const L = 48, R = pdf.width - 48, W = R - L
  const registered = d.supplier.gst_registered === true
  let y = 60

  pdf.text(L, y, registered ? 'TAX INVOICE' : 'INVOICE', 20, 'bold')
  pdf.textRight(R, y - 4, d.number, 11, 'bold')
  pdf.textRight(R, y + 10, `Issued ${date(d.issue_date)}`, 9, 'regular', 0.35)
  y += 34
  pdf.line(L, y, R, y)
  y += 22

  // Supplier (left) and the invoice facts (right).
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
  const sup = d.supplier
  const left = block(L, y, 'FROM', [
    sup.legal_name, sup.address, sup.state ? `State: ${sup.state}` : null,
    sup.gstin ? `GSTIN${registered ? '' : ' (provisional)'}: ${sup.gstin}` : null,
    sup.pan ? `PAN: ${sup.pan}` : null,
  ])
  const right = block(L + W / 2 + 12, y, 'INVOICE', [
    `Invoice no: ${d.number}`, `Invoice date: ${date(d.issue_date)}`,
    `Due date: ${d.due_date ? date(d.due_date) : 'On receipt'}`,
    d.place_of_supply ? `Place of supply: ${d.place_of_supply}` : null,
  ])
  y = Math.max(left, right) + 16

  const rec = d.recipient
  y = block(L, y, 'BILL TO', [
    rec.legal_name, rec.address, rec.state ? `State: ${rec.state}` : null,
    rec.gstin ? `GSTIN: ${rec.gstin}` : null, rec.pan ? `PAN: ${rec.pan}` : null,
  ]) + 18

  // The one line.
  pdf.box(L, y - 13, W, 20, 0.94)
  pdf.text(L + 8, y, 'Description', 9, 'bold')
  pdf.textRight(R - 8, y, 'Amount', 9, 'bold')
  y += 22
  const descLines = wrap(d.description, 10, W - 150)
  pdf.textRight(R - 8, y, inr(d.subtotal_paise), 10)
  for (const l of descLines) { pdf.text(L + 8, y, l, 10); y += 14 }
  y += 6
  pdf.line(L, y, R, y)
  y += 18

  // Totals.
  const total = (label: string, value: string, bold = false) => {
    pdf.text(R - 230, y, label, 10, bold ? 'bold' : 'regular')
    pdf.textRight(R - 8, y, value, 10, bold ? 'bold' : 'regular')
    y += 16
  }
  total('Sub-total', inr(d.subtotal_paise))
  const rate = d.gst_rate_pct != null ? Number(d.gst_rate_pct) : null
  if (registered) {
    if (d.igst_paise) total(`IGST${rate != null ? ` @ ${rate}%` : ''}`, inr(d.igst_paise))
    if (d.cgst_paise) total(`CGST${rate != null ? ` @ ${rate / 2}%` : ''}`, inr(d.cgst_paise))
    if (d.sgst_paise) total(`SGST${rate != null ? ` @ ${rate / 2}%` : ''}`, inr(d.sgst_paise))
  }
  y += 2
  pdf.line(R - 230, y - 10, R, y - 10)
  y += 4
  total('Total', inr(d.total_paise), true)
  if (!registered) {
    y += 6
    for (const l of wrap('GST not charged: Guapd is not yet registered for GST.', 9, W)) { pdf.text(L, y, l, 9, 'regular', 0.35); y += 12 }
  }

  if (sup.payment_instructions) {
    y += 18
    pdf.text(L, y, 'HOW TO PAY', 8, 'bold', 0.45); y += 14
    for (const l of wrap(sup.payment_instructions, 9.5, W)) { pdf.text(L, y, l, 9.5); y += 13 }
  }

  pdf.text(L, pdf.height - 40, `${d.experience_title} · This is a computer-generated invoice.`, 8, 'regular', 0.5)
  return pdf.toBytes()
}
