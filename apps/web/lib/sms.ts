import 'server-only'
import { toMsg91Number, maskPhone } from '@/lib/whatsapp'

/**
 * MSG91 transactional SMS channel — delivery only.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 * This does NOT generate or verify one-time codes. The app already does both:
 * sendOTP generates the code and stores it in `phone_verifications`, and the
 * verify steps check it. MSG91's own OTP endpoints are deliberately unused —
 * we bring our own code and MSG91 only carries it. Keeping generation and
 * verification in our database is what makes the staging bypass, the rate
 * limit and the replay guard ours to reason about.
 *
 * ── CONTRACT: this module NEVER throws and NEVER hangs. ────────────────────
 * Every entry point returns a result object, mirroring lib/whatsapp.ts and
 * lib/email.ts. Callers rely on it; do not introduce a throw path.
 *
 * ── EVERY non-ok path logs before returning. ──────────────────────────────
 * Same rule as the other two channels, for the same reason: the WhatsApp
 * sender once returned early on an unusable recipient with no log at all, and
 * three triggered events produced no message and no trace of why.
 *
 * ── THE CODE IS A CREDENTIAL. ─────────────────────────────────────────────
 * Nothing here logs it. Not on success, not on failure, not in the recorded
 * event. A one-time code in a log line is a login sitting in Vercel's log
 * retention, readable by anyone with dashboard access. Only the masked phone
 * and MSG91's request id are ever written down.
 *
 * ── DLT (India) ───────────────────────────────────────────────────────────
 * Indian transactional SMS is gated on DLT registration. Our approved
 * template is:
 *   "{#num#} is your Guapd verification code. Do not share it with anyone."
 * sent under header GUAPD, DLT template id 1177178695429229295.
 *
 * The text must match character-for-character; only the digits vary. That is
 * why nothing here builds a message body — MSG91 holds the approved text
 * against the flow template and we supply one variable. There is no way to
 * send arbitrary text through this module, which is the point.
 *
 * MSG91_SMS_TEMPLATE_ID is MSG91's OWN flow template id (a 24-char hex
 * string), NOT the numeric DLT id. MSG91 maps one to the other internally.
 * The DLT entity/PE id is configured at account level and is not sent here.
 *
 * ── API ───────────────────────────────────────────────────────────────────
 *   POST {base}/api/v5/flow
 *   headers: authkey, content-type: application/json, accept: application/json
 *   { template_id, realTimeResponse: "1", recipients: [ { mobiles, <var> } ] }
 *
 * `realTimeResponse: "1"` asks MSG91 to resolve synchronously so a failure is
 * visible on this request rather than only in a delivery report. No short_url:
 * there is no link in an OTP and nothing to shorten.
 */

const DEFAULT_BASE_URL = 'https://control.msg91.com'
const SEND_PATH = '/api/v5/flow'

/** Hard ceiling on how long a login can be delayed by MSG91. */
const TIMEOUT_MS = 4000

export type SmsResult =
  | { ok: true; requestId?: string }
  | { ok: false; reason: string }

interface SmsConfig {
  authKey: string
  templateId: string
  varName: string
  baseUrl: string
}

/**
 * Read config, or null when SMS is not fully configured.
 *
 * Deliberately OPT-IN: `MSG91_SMS_ENABLED` must be exactly 'true'. This is the
 * kill switch that lets the feature deploy dark — real SMS will not deliver
 * until our DLT PE-TM chain (binding MSG91 as our telemarketer) goes Active,
 * and that sync is outside our control. Unset means no HTTP request at all,
 * not a failed one.
 */
function readConfig(): SmsConfig | null {
  if (process.env.MSG91_SMS_ENABLED !== 'true') return null

  const authKey = process.env.MSG91_AUTH_KEY
  const templateId = process.env.MSG91_SMS_TEMPLATE_ID
  const varName = process.env.MSG91_SMS_VAR_NAME
  if (!authKey || !templateId || !varName) return null

  return {
    authKey,
    templateId,
    varName,
    baseUrl: process.env.MSG91_SMS_URL || DEFAULT_BASE_URL,
  }
}

export function isSmsConfigured(): boolean {
  return readConfig() !== null
}

export interface SendOtpSmsParams {
  /** Recipient phone in any stored format; normalised internally. */
  toPhone: string | null | undefined
  /** The six-digit code this app generated. Never logged. */
  code: string
}

/**
 * Deliver one already-generated code to one number.
 *
 * Resolves `{ok:false, reason}` for every failure mode — missing config,
 * unusable phone, network error, timeout, HTTP error, or an MSG91 body that
 * reports failure. Never rejects.
 */
export async function sendOtpSms(params: SendOtpSmsParams): Promise<SmsResult> {
  const { toPhone, code } = params

  try {
    const config = readConfig()
    if (!config) {
      return await fail(
        'not_configured',
        'MSG91_SMS_ENABLED is not exactly "true", or auth key / template id / variable name is missing',
        toPhone,
      )
    }

    const to = toMsg91Number(toPhone)
    if (!to) {
      return await fail('unusable_phone', `stored value ${maskPhone(toPhone)} could not be normalised to an E.164 recipient`, toPhone)
    }

    // Defensive: the DLT-approved text has exactly one variable and it is a
    // six-digit code. Anything else means a caller passed the wrong thing, and
    // sending it would burn a message and produce a template mismatch.
    if (!/^\d{6}$/.test(code)) {
      return await fail('bad_code', `expected 6 digits, got ${code.length} chars`, toPhone)
    }

    console.info(`[sms] → sending otp to=${maskPhone(to)} template=${config.templateId} host=${config.baseUrl}`)

    // The variable key is a computed name from env on purpose. Our template
    // preview showed ##number##, so MSG91 expects the key `number` rather than
    // the `VAR1` the generic docs show. A wrong key is the classic silent
    // failure here: MSG91 accepts the request, the variable never populates,
    // and the creator gets a broken message with everything else correct.
    const body = {
      template_id: config.templateId,
      realTimeResponse: '1',
      recipients: [{ mobiles: to, [config.varName]: code }],
    }

    const res = await fetch(`${config.baseUrl}${SEND_PATH}`, {
      method: 'POST',
      headers: {
        authkey: config.authKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })

    const raw = await res.text().catch(() => '')

    if (!res.ok) {
      return await fail(`http_${res.status}`, raw, toPhone)
    }

    // HTTP 200 IS NOT SUCCESS. MSG91 returns errors with a 200 — this is the
    // same trap already hit on the WhatsApp channel, where keying on a field
    // the live response did not contain passed error bodies through as
    // successes for weeks. Treat anything that reports failure as failure, and
    // require a positive success signal rather than assuming one.
    let parsed: {
      type?: string
      status?: string
      hasError?: boolean
      request_id?: string
      requestId?: string
      message?: unknown
      errors?: unknown
    } = {}
    try {
      parsed = raw ? JSON.parse(raw) : {}
    } catch {
      // Accepted but unparseable: treat as sent rather than tell someone their
      // code failed when it may well be on its way.
      await recordAttempt({ ok: true, reason: 'unparseable_response', to: toPhone })
      return { ok: true }
    }

    const reportsFailure =
      parsed.hasError === true ||
      (typeof parsed.status === 'string' && parsed.status.toLowerCase() !== 'success') ||
      (typeof parsed.type === 'string' && parsed.type.toLowerCase() !== 'success')

    if (reportsFailure) {
      const label = parsed.status ?? parsed.type ?? 'error'
      return await fail(`msg91_${label}`, raw, toPhone)
    }

    // MSG91's /flow success body carries the request id in `message` on some
    // responses and `request_id` on others. Only read `message` as an id once
    // success is established — on an error body that same field is the error
    // text, and storing that as a request id would make reconciliation lie.
    const requestId =
      parsed.request_id ??
      parsed.requestId ??
      (typeof parsed.message === 'string' ? parsed.message : undefined)

    // ACCEPTED IS NOT DELIVERED. MSG91 queues the message; a DLT chain that is
    // not yet Active, a blocked header, or an operator rejection surfaces in
    // the delivery report later, never in this response. The request id is the
    // reconciliation key.
    console.info(`[sms] ✓ accepted (queued, not yet delivered) to=${maskPhone(to)} request_id=${requestId ?? 'n/a'}`)
    await recordAttempt({ ok: true, requestId, to: toPhone })
    return { ok: true, requestId }
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network_error'
    return await fail(reason, err instanceof Error ? err.message : String(err), toPhone)
  }
}

/**
 * Log a delivery failure. Never includes the auth key or the code; phones
 * appear masked only.
 */
function logFailure(reason: string, detail: string) {
  console.error(`[sms] ✗ otp send failed reason=${reason} detail=${detail.slice(0, 300)}`)
}

/**
 * Persist the outcome so "did the code actually go out?" is a query rather
 * than a hunt through Vercel logs — the same reason the WhatsApp channel
 * records its attempts.
 *
 * Recorded with a null deal_id: an OTP belongs to a phone, not a deal. The
 * code itself is never stored here; `phone_verifications` already holds it,
 * and duplicating a credential into the audit log would be a second place to
 * leak it from.
 *
 * Never throws and never blocks the send.
 */
async function recordAttempt(args: {
  ok: boolean
  reason?: string
  requestId?: string
  to?: string | null
}): Promise<void> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    await createAdminClient().from('events').insert({
      deal_id: null,
      event_type: args.ok ? 'notification.sms_sent' : 'notification.sms_failed',
      detail: {
        channel: 'sms',
        purpose: 'otp',
        ok: args.ok,
        ...(args.reason && { reason: args.reason }),
        ...(args.requestId && { request_id: args.requestId }),
        ...(args.to && { to_masked: maskPhone(args.to) }),
      },
    })
  } catch (err) {
    console.error(`[sms] could not record attempt: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Log, record and return a failure in one step, so no early return can skip
 * any of the three. Awaited rather than fire-and-forget: a serverless function
 * can freeze before a floating promise resolves, which would lose exactly the
 * rows this exists to write.
 */
async function fail(reason: string, detail: string, to?: string | null): Promise<SmsResult> {
  logFailure(reason, detail)
  await recordAttempt({ ok: false, reason, to })
  return { ok: false, reason }
}
