import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

const SECRET = process.env.OFFER_TOKEN_SECRET
if (!SECRET) {
  throw new Error('OFFER_TOKEN_SECRET env var is required')
}

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function base64urlEncode(data: string): string {
  return Buffer.from(data).toString('base64url')
}

function base64urlDecode(data: string): string {
  return Buffer.from(data, 'base64url').toString()
}

function sign(payload: string): string {
  return createHmac('sha256', SECRET!).update(payload).digest('base64url')
}

export function generateOfferToken(dealId: string): string {
  const payload = JSON.stringify({ dealId, exp: Date.now() + TOKEN_TTL_MS })
  const encoded = base64urlEncode(payload)
  return `${encoded}.${sign(encoded)}`
}

export function verifyOfferToken(token: string): { dealId: string } | null {
  const dotIndex = token.indexOf('.')
  if (dotIndex === -1) return null

  const encoded = token.slice(0, dotIndex)
  const signature = token.slice(dotIndex + 1)

  // Timing-safe comparison
  const expected = sign(encoded)
  if (signature.length !== expected.length) return null
  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)
  if (!timingSafeEqual(sigBuf, expBuf)) return null

  try {
    const payload = JSON.parse(base64urlDecode(encoded)) as { dealId?: string; exp?: number }
    if (!payload.dealId || typeof payload.dealId !== 'string') return null
    if (!payload.exp || typeof payload.exp !== 'number') return null
    if (Date.now() > payload.exp) return null // expired
    return { dealId: payload.dealId }
  } catch {
    return null
  }
}
