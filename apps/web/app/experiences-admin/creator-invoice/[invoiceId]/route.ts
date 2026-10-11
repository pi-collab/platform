import { NextResponse } from 'next/server'
import { experienceStaffGate } from '@/lib/experience-staff-auth'
import { getCreatorInvoiceDoc } from '@/lib/experience-console-server'
import { renderCreatorInvoicePdf, type CreatorInvoiceDoc } from '@/lib/creator-invoice-pdf'

export const dynamic = 'force-dynamic'

/** 0552: a creator invoice as a PDF, for Experiences staff (operational access, checked again in Postgres). */
export async function GET(_req: Request, { params }: { params: { invoiceId: string } }) {
  const gate = await experienceStaffGate()
  if (!gate.ok) return new NextResponse('No access', { status: 403 })
  if (!/^[0-9a-f-]{36}$/i.test(params.invoiceId)) return new NextResponse('Not found', { status: 404 })
  const r = await getCreatorInvoiceDoc(params.invoiceId)
  if (!r.ok || !r.data) return new NextResponse('Not found', { status: 404 })
  const doc = r.data as CreatorInvoiceDoc
  return new NextResponse(Buffer.from(renderCreatorInvoicePdf(doc)), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${doc.number}.pdf"`, 'Cache-Control': 'private, no-store' },
  })
}
