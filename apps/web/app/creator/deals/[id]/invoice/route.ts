import { NextResponse } from 'next/server'
import { verifyCreator } from '@/lib/creator-auth'
import { createClient } from '@/lib/supabase/server'
import { renderCreatorInvoicePdf, type CreatorInvoiceDoc } from '@/lib/creator-invoice-pdf'

export const dynamic = 'force-dynamic'

/** 0552: the creator's own invoice to Guapd as a PDF. creator_leg_invoice_doc checks the deal is theirs. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await verifyCreator(`/creator/deals/${params.id}`)
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new NextResponse('Not found', { status: 404 })
  const { data, error } = await createClient().rpc('creator_leg_invoice_doc', { p_deal_id: params.id })
  if (error || !data) return new NextResponse('Not found', { status: 404 })
  const doc = data as CreatorInvoiceDoc
  return new NextResponse(Buffer.from(renderCreatorInvoicePdf(doc)), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${doc.number}.pdf"`, 'Cache-Control': 'private, no-store' },
  })
}
