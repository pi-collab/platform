import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Read the signing secret, or throw.
 *
 * Read LAZILY, not at module load. The previous top-level throw ran while
 * Next collected page data for /offer/[token], so a missing secret failed the
 * ENTIRE build — every page, in every environment, including ones that never
 * mint an offer token. It blocked three staging deployments in a row.
 *
 * Security is unchanged: no fallback, no weak default, and the error is still
 * thrown rather than swallowed. It now surfaces when a token is actually
 * minted or verified, which is the moment the secret is genuinely needed.
 *
 * Deliberately throws rather than letting verifyOfferToken return null: a
 * missing secret is a misconfigured server, and reporting that to a creator as
 * "this link is invalid or expired" would be a lie that sends them chasing a
 * link that was never the problem.
 */
function secret(): string {
  const value = process.env.OFFER_TOKEN_SECRET
  if (!value) {
    throw new Error('OFFER_TOKEN_SECRET env var is required')
  }
  return value
}

function base64urlEncode(data: string): string {
  return Buffer.from(data).toString('base64url')
}

function base64urlDecode(data: string): string {
  return Buffer.from(data, 'base64url').toString()
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
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
