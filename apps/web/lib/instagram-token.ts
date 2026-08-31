import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Encrypting Instagram access tokens at rest.
 *
 * A long-lived Instagram token reads a creator's private insights: their
 * follower demographics, their reach, their audience. It is closer to a
 * password than to an id, and it sits in a table any database dump would carry.
 *
 * ── What this protects against, and what it does not ────────────────────────
 * Protects: a database dump, a backup leak, anyone reading the table in the
 * Supabase dashboard, a read-only SQL leak.
 *
 * Does NOT protect: application compromise. The key lives in the same
 * environment as SUPABASE_SERVICE_ROLE_KEY, so anything that reads one reads
 * the other. Stated plainly because "encrypted at rest" is often heard as more
 * than it is.
 *
 * True envelope encryption means a KMS issuing a data key per record. There is
 * no KMS in this stack, and adding one to protect a secret that sits beside a
 * more powerful secret would be motion rather than progress. AES-256-GCM with
 * an application key is the honest level of protection available here.
 *
 * ── Why GCM ─────────────────────────────────────────────────────────────────
 * Authenticated: the tag makes tampering detectable. A token that was altered
 * in the database fails to decrypt rather than being sent to Meta as garbage.
 */

/** Bumped when the key rotates. Stored per row so old rows stay readable while
 *  they are re-encrypted, rather than needing a migration and a maintenance
 *  window to turn the key over. */
export const CURRENT_KEY_VERSION = 1

export interface EncryptedToken {
  ciphertext: string
  iv: string
  tag: string
  keyVersion: number
}

function key(version: number): Buffer {
  // Versioned lookup, so rotation is: add INSTAGRAM_TOKEN_KEY_V2, bump
  // CURRENT_KEY_VERSION, re-encrypt on next refresh. Old rows keep working.
  const raw = version === 1
    ? process.env.INSTAGRAM_TOKEN_KEY
    : process.env[`INSTAGRAM_TOKEN_KEY_V${version}`]

  if (!raw) {
    throw new Error(`Instagram token key v${version} is not configured`)
  }
  const buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) {
    // Loud rather than silent: a short key would still "work" in the sense of
    // not throwing at import time, and would weaken every token written after.
    throw new Error(`INSTAGRAM_TOKEN_KEY v${version} must be 32 bytes base64, got ${buf.length}`)
  }
  return buf
}

export function encryptToken(token: string): EncryptedToken {
  // A fresh IV per encryption. Reusing one under GCM is the classic way to
  // destroy the guarantee entirely, so it is generated here and never passed in.
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(CURRENT_KEY_VERSION), iv)
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    keyVersion: CURRENT_KEY_VERSION,
  }
}

export function decryptToken(enc: EncryptedToken): string {
  const decipher = createDecipheriv('aes-256-gcm', key(enc.keyVersion), Buffer.from(enc.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(enc.tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

/** Never log a token. This is for the audit trail, where the useful fact is
 *  which token, not what it was. */
export function maskToken(token: string): string {
  return token.length <= 10 ? '***' : `${token.slice(0, 4)}…${token.slice(-4)}`
}
