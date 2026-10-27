import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { webhookConfigured, webhookSignatureValid } from '@/lib/razorpay-payin'

/**
 * 0578: Razorpay's webhook. The ONLY path that records an online payment
 * against a Guapd invoice: a payment.captured event whose X-Razorpay-Signature
 * verifies against the webhook secret. The browser’s success callback
 * records nothing.
 *
 * Razorpay calls this server to server with no session, so it is exempt from
 * the staging Basic Auth gate (middleware.ts); the HMAC is the gate.
 *
 * 400: unsigned, bad signature or malformed payment (not recorded, not retried
 * usefully). 500: not configured or the database failed (Razorpay retries, and
 * a retry is safe: one Razorpay payment id is filed once). 200: handled.
 */
const PAY_ID = /^pay_[A-Za-z0-9]{6,40}$/
const ORDER_ID = /^order_[A-Za-z0-9]{6,40}$/

export async function POST(request: Request) {
  if (!webhookConfigured()) return NextResponse.json({ error: 'Not configured' }, { status: 500 })

  const raw = await request.text()
  if (!webhookSignatureValid(raw, request.headers.get('x-razorpay-signature'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let body: { event?: unknown; created_at?: unknown; payload?: { payment?: { entity?: Record<string, unknown> } } }
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Malformed body' }, { status: 400 })
  }

  // Only a captured payment is money. payment.failed, order.paid and the rest
  // change nothing here (order.paid arrives alongside payment.captured).
  if (body.event !== 'payment.captured') return NextResponse.json({ ignored: true })

  const p = body.payload?.payment?.entity ?? {}
  const paymentId = typeof p.id === 'string' && PAY_ID.test(p.id) ? p.id : null
  const orderId = typeof p.order_id === 'string' && ORDER_ID.test(p.order_id) ? p.order_id : null
  const amount = typeof p.amount === 'number' && Number.isSafeInteger(p.amount) && p.amount > 0 ? p.amount : null
  const currency = typeof p.currency === 'string' ? p.currency : null
  const method = typeof p.method === 'string' ? p.method.slice(0, 30) : null
  const at = typeof body.created_at === 'number' ? body.created_at : typeof p.created_at === 'number' ? p.created_at : null
  if (!paymentId || !orderId || amount === null || !currency || at === null) {
    return NextResponse.json({ error: 'Incomplete payment' }, { status: 400 })
  }
  const eventId = request.headers.get('x-razorpay-event-id')?.slice(0, 100) ?? null

  const { data, error } = await createAdminClient().rpc('razorpay_payin_capture', {
    p_payment_id: paymentId,
    p_order_id: orderId,
    p_amount_paise: amount,
    p_currency: currency,
    p_method: method,
    p_event_id: eventId,
    p_captured_at: new Date(at * 1000).toISOString(),
  })
  if (error) {
    console.error('[razorpay-webhook] capture failed', paymentId, error.message)
    return NextResponse.json({ error: 'Could not record' }, { status: 500 })
  }
  const outcome = (data as { outcome?: string } | null)?.outcome ?? 'unknown'
  if (outcome === 'needs_review') console.error('[razorpay-webhook] needs review', paymentId, (data as { reason?: string }).reason)
  return NextResponse.json({ outcome })
}
