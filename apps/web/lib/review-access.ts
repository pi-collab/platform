import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * A fixed login code for ONE phone number, so an App Review reviewer can sign in.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Creator login is phone OTP. A Meta reviewer cannot receive our SMS, so
 * without this they cannot reach the screen the review is about. This is the
 * narrowest thing that solves it.
 *
 * ── Why it is NOT the staging bypass ────────────────────────────────────────
 * STAGING_OTP_BYPASS accepts 000000 or 123456 for ANY phone, and is explicitly
 * refused when VERCEL_ENV is production. This has to work ON production, so it
 * cannot be that: it is one phone, one secret code, and it is inert unless both
 * are configured.
 *
 * ── The honest weakness ─────────────────────────────────────────────────────
 * The login UI is a fixed six-cell OTP input, so the code must be six digits.
 * There is no rate limiting on OTP verification in this codebase. Six digits is
 * a million guesses, and unlike a real OTP — which lives for minutes — this one
 * lives for as long as the review does. Longevity is the risk here, not the
 * mechanism.
 *
 * So the controls that actually carry the weight are:
 *   1. It is dead unless BOTH env vars are set. Deleting either revokes it.
 *   2. The phone must match EXACTLY, and must resolve to a creator marked as
 *      the review account. A changed env var cannot reach a real creator.
 *   3. The account itself is a throwaway with no deals, no payouts and no real
 *      audience data, so a compromise is worth nothing.
 *   4. Every use is written to ops_events, successful or not, so abuse is
 *      visible rather than silent.
 *   5. It is time-boxed by hand: remove the vars when the review closes.
 *
 * Control 3 is the one to rely on. The others reduce the chance; that one
 * removes the payoff.
 */

/** Refused below this, so a truncated or half-set env var cannot quietly
 *  create a weaker bypass than intended. */
const REQUIRED_CODE_LENGTH = 6

export interface ReviewLoginOutcome {
  /** The code matched and the phone is the configured review account. */
  accepted: boolean
  /** Set when the phone IS the review phone, so the caller can audit an
   *  attempt against it even though the code was wrong. */
  attemptedOnReviewPhone: boolean
}

export function checkReviewLogin(phone: string, code: string): ReviewLoginOutcome {
  const reviewPhone = process.env.REVIEW_LOGIN_PHONE
  const reviewCode = process.env.REVIEW_LOGIN_CODE

  // Absent config means the path does not exist. This is the revoke switch.
  if (!reviewPhone || !reviewCode) {
    return { accepted: false, attemptedOnReviewPhone: false }
  }

  // A misconfigured code must fail closed rather than open.
  if (reviewCode.length !== REQUIRED_CODE_LENGTH) {
    console.error('[review-access] REVIEW_LOGIN_CODE is not 6 digits; the review login is disabled')
    return { accepted: false, attemptedOnReviewPhone: false }
  }

  const onReviewPhone = phone === reviewPhone
  if (!onReviewPhone) return { accepted: false, attemptedOnReviewPhone: false }

  // Compared without an early exit. A byte-by-byte comparison on a secret is
  // the textbook timing oracle, and this one is long-lived.
  const a = Buffer.from(code)
  const b = Buffer.from(reviewCode)
  const accepted = a.length === b.length && timingSafeEqual(a, b)

  return { accepted, attemptedOnReviewPhone: true }
}

/**
 * Record every attempt against the review phone.
 *
 * Written for failures too. A run of failures on this number is the signal that
 * someone is guessing, and it is the only such signal we have while OTP verify
 * is unthrottled.
 *
 * Never throws: a login must not fail because the audit write did.
 */
export async function logReviewLogin(phone: string, accepted: boolean): Promise<void> {
  try {
    await createAdminClient().from('ops_events').insert({
      actor_email: 'review-access@guapd.internal',
      actor_auth_id: null,
      action: accepted ? 'review.login_succeeded' : 'review.login_failed',
      target_table: 'creators',
      target_id: null,
      detail: { phone, accepted },
    })
  } catch (err) {
    console.error(`[review-access] audit write failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
