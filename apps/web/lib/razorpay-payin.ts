import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

/**
 * 0578: Razorpay Standard Checkout for a brand paying a Guapd (Leg 1)
 * Experience invoice. Money IN only. Nothing here knows about creators,
 * payouts, costs or margin.
 *
 * The key SECRET and the webhook secret are read here, server-side, and never
 * leave this file. The browser gets the key ID only (from startOnlinePayment).
 * No SDK: two HTTPS calls and two HMACs do not need a dependency.
 */

export function razorpayKeyId(): string | null {
  const id = process.env.RAZORPAY_KEY_ID?.trim()
  return id ? id : null
}

function keySecret(): string | null {
  const s = process.env.RAZORPAY_KEY_SECRET?.trim()
  return s ? s : null
}

/** Online payment is offered only when both keys are set. */
export function razorpayConfigured(): boolean {
  return razorpayKeyId() !== null && keySecret() !== null
}

export type OrderResult =
  | { ok: true; orderId: string }
  | { ok: false; status: 401 | 500; error: string }

/** POST /v1/orders. The amount is whatever the caller worked out server-side. */
export async function createRazorpayOrder(v: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<OrderResult> {
  const id = razorpayKeyId()
  const secret = keySecret()
  if (!id || !secret) return { ok: false, status: 500, error: 'Online payment is not set up.' }
  if (!Number.isSafeInteger(v.amountPaise) || v.amountPaise < 100) return { ok: false, status: 500, error: 'The amount is too small to pay online.' }
  let res: Response
  try {
    res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: v.amountPaise, currency: 'INR', receipt: v.receipt.slice(0, 40), notes: v.notes }),
      cache: 'no-store',
    })
  } catch {
    return { ok: false, status: 500, error: 'Could not reach Razorpay. Try again.' }
  }
  if (res.status === 401) return { ok: false, status: 401, error: 'Razorpay rejected Guapd’s keys.' }
  const body = (await res.json().catch(() => null)) as { id?: unknown; amount?: unknown; currency?: unknown } | null
  if (!res.ok || !body || typeof body.id !== 'string' || !body.id.startsWith('order_')) {
    return { ok: false, status: 500, error: 'Razorpay could not create the payment. Try again.' }
  }
  // Razorpay echoes what it will charge; anything else is not our order.
  if (body.amount !== v.amountPaise || body.currency !== 'INR') return { ok: false, status: 500, error: 'Razorpay returned a different amount.' }
  return { ok: true, orderId: body.id }
}

function hmacMatches(payload: string, secret: string, signature: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false
  const expected = createHmac('sha256', secret).update(payload).digest()
  const given = Buffer.from(signature, 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** Checkout success: HMAC-SHA256(order_id|payment_id, key secret). Proves nothing was paid; the webhook does. */
export function checkoutSignatureValid(orderId: string, paymentId: string, signature: string): boolean {
  const secret = keySecret()
  if (!secret || !orderId || !paymentId || !signature) return false
  return hmacMatches(`${orderId}|${paymentId}`, secret, signature)
}

/** Webhook: HMAC-SHA256(raw body, webhook secret). Missing secret = nothing verifies. */
export function webhookSignatureValid(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim()
  if (!secret || !signature || !rawBody) return false
  return hmacMatches(rawBody, secret, signature)
}

export function webhookConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_WEBHOOK_SECRET?.trim())
}
