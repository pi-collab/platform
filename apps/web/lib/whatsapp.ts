import 'server-only'

/**
 * MSG91 WhatsApp channel.
 *
 * Sends pre-approved WhatsApp templates to CREATORS only (brands are notified
 * in-app; creator-only WhatsApp is a deliberate product decision).
 *
 * ── CONTRACT: this module NEVER throws and NEVER hangs. ────────────────────
 * Every entry point returns a result object. A WhatsApp send is a side effect
 * of a deal action, never part of its transaction — if MSG91 is down, slow,
 * misconfigured, or returns garbage, the deal state change must still succeed.
 * Callers rely on this; do not introduce a throw path.
 *
 * ── API shape (verified against live integrations, not guessed) ────────────
 *   POST {base}/api/v5/whatsapp/whatsapp-outbound-message/bulk/
 *   headers: authkey, Content-Type: application/json
 *   body.payload.template.to_and_components[].components is an OBJECT keyed
 *   by slot name — NOT Meta's positional array:
 *     body_1..body_n : { type: 'text', value }
 *     button_1       : { subtype: 'url', type: 'text', value }
 *
 * The button `value` is the URL SUFFIX ONLY. The fixed base (e.g.
 * https://guapd.com/offer/) is baked into the approved template — sending a
 * full URL would produce https://guapd.com/offer/https://guapd.com/offer/…
 */

const DEFAULT_BASE_URL = 'https://control.msg91.com'
const SEND_PATH = '/api/v5/whatsapp/whatsapp-outbound-message/bulk/'

/** Hard ceiling on how long a deal action can be delayed by MSG91. */
const TIMEOUT_MS = 4000

export type WhatsAppResult =
  | { ok: true }
  | { ok: false; reason: string }

interface Msg91Config {
  authKey: string
  integratedNumber: string
  lang: string
  namespace: string | null
  baseUrl: string
}

/**
 * Read config, or null when WhatsApp is not fully configured.
 *
 * Deliberately OPT-IN: `MSG91_WHATSAPP_ENABLED` must be exactly 'true'. An
 * unset switch means no sends, so staging and local dev can hold real
 * credentials without ever messaging a real creator.
 */
function readConfig(): Msg91Config | null {
  if (process.env.MSG91_WHATSAPP_ENABLED !== 'true') return null

  const authKey = process.env.MSG91_AUTH_KEY
  const integratedNumber = process.env.MSG91_WHATSAPP_NUMBER
  if (!authKey || !integratedNumber) return null

  return {
    authKey,
    integratedNumber,
    lang: process.env.MSG91_WHATSAPP_LANG || 'en',
    namespace: process.env.MSG91_WHATSAPP_NAMESPACE || null,
    baseUrl: process.env.MSG91_WHATSAPP_URL || DEFAULT_BASE_URL,
  }
}

export function isWhatsAppConfigured(): boolean {
  return readConfig() !== null
}

/**
 * Convert a stored phone to MSG91's wire format: country code, digits only,
 * no '+' (e.g. "+91 98765 43210" → "919876543210").
 *
 * NOT India-only. WhatsApp is global and MSG91 delivers internationally; an
 * India-only rule silently drops every foreign number, including the founders'
 * own UK numbers during testing. Only genuinely unusable input is rejected.
 *
 * Rules, in order:
 *   "09876543210"   → 919876543210  (Indian trunk-0 national form)
 *   "9876543210"    → 919876543210  (bare national number ⇒ assume India,
 *                                    matching lib/phone.ts)
 *   "+447700900123" → 447700900123  (explicit country code, kept as-is)
 *   anything outside E.164's 8–15 digits → null
 */
export function toMsg91Number(phone: string | null | undefined): string | null {
  if (!phone) return null

  const trimmed = phone.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null

  // Indian trunk-prefixed national form.
  if (/^0\d{10}$/.test(digits)) return `91${digits.slice(1)}`

  // Bare 10-digit national number with no explicit country code ⇒ India.
  // A leading '+' means the caller stated a country code, so don't assume.
  if (/^\d{10}$/.test(digits) && !trimmed.startsWith('+')) return `91${digits}`

  // Otherwise assume the country code is already present. E.164 permits 8–15
  // digits total; outside that it is not a usable recipient.
  if (digits.length >= 8 && digits.length <= 15) return digits

  return null
}

/** Mask a phone for logs — enough to identify it, not enough to leak it. */
function maskPhone(phone: string | null | undefined): string {
  if (!phone) return 'none'
  const digits = phone.replace(/\D/g, '')
  return digits.length <= 4 ? '****' : `****${digits.slice(-4)}`
}

export interface SendTemplateParams {
  /** Approved MSG91/Meta template name, e.g. 'new_offer_received'. */
  template: string
  /** Recipient phone in any stored format; normalised internally. */
  toPhone: string | null | undefined
  /** Fills body_1..body_n in order. */
  bodyVars: string[]
  /** Fills button_1 — the URL SUFFIX only (offer token or deal UUID). */
  buttonValue?: string
  /** Deal id, for log correlation only. */
  dealId?: string
}

/**
 * Send one approved template to one creator.
 *
 * Resolves `{ok:false, reason}` for every failure mode — missing config,
 * unusable phone, network error, timeout, HTTP error, or an MSG91 body that
 * reports failure. Never rejects.
 */
export async function sendWhatsAppTemplate(params: SendTemplateParams): Promise<WhatsAppResult> {
  const { template, toPhone, bodyVars, buttonValue, dealId } = params

  try {
    const config = readConfig()
    if (!config) {
      return await fail(template, dealId, 'not_configured', 'MSG91_WHATSAPP_ENABLED is not exactly "true", or auth key / number is missing')
    }

    const to = toMsg91Number(toPhone)
    if (!to) {
      return await fail(template, dealId, 'unusable_phone', `stored value ${maskPhone(toPhone)} could not be normalised to an E.164 recipient`)
    }

    // WhatsApp rejects empty body parameters — catch it here rather than
    // burning a send and getting an opaque template-mismatch error back.
    if (bodyVars.some((v) => !v || !v.trim())) {
      return await fail(template, dealId, 'empty_body_var', `${bodyVars.length} body vars, at least one blank`)
    }

    console.info(`[whatsapp] → sending template=${template} deal=${dealId ?? 'n/a'} to=${maskPhone(to)} lang=${config.lang} host=${config.baseUrl}`)

    const components: Record<string, unknown> = {}
    bodyVars.forEach((value, i) => {
      components[`body_${i + 1}`] = { type: 'text', value }
    })
    if (buttonValue) {
      components.button_1 = { subtype: 'url', type: 'text', value: buttonValue }
    }

    const body = {
      integrated_number: config.integratedNumber,
      content_type: 'template',
      payload: {
        messaging_product: 'whatsapp',
        type: 'template',
        template: {
          name: template,
          language: { code: config.lang, policy: 'deterministic' },
          namespace: config.namespace,
          to_and_components: [{ to: [to], components }],
        },
      },
    }

    const res = await fetch(`${config.baseUrl}${SEND_PATH}`, {
      method: 'POST',
      headers: {
        authkey: config.authKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })

    const raw = await res.text().catch(() => '')

    if (!res.ok) {
      logFailure(template, dealId, `http_${res.status}`, raw)
      return { ok: false, reason: `http_${res.status}` }
    }

    // MSG91 can return HTTP 200 with { type: 'error' } — the status code alone
    // is NOT a success signal.
    // MSG91's LIVE response shape (captured from a real send) is:
    //   { status: 'success', hasError: false, errors: null, request_id: '…' }
    // Some MSG91 endpoints/docs instead use { type: 'success' }. Accept both.
    //
    // Keying only on `type` — as this originally did — silently passed an
    // error body as success, because the live response has no `type` field at
    // all. `hasError` is authoritative when present.
    let parsed: {
      type?: string
      status?: string
      hasError?: boolean
      request_id?: string
      errors?: unknown
      message?: string
    } = {}
    try {
      parsed = raw ? JSON.parse(raw) : {}
    } catch {
      // Accepted but unparseable: treat as sent rather than risk a false alarm.
      await recordAttempt({ template, dealId, ok: true, reason: 'unparseable_response', to: toPhone })
      return { ok: true }
    }

    const reportsFailure =
      parsed.hasError === true ||
      (typeof parsed.status === 'string' && parsed.status.toLowerCase() !== 'success') ||
      (typeof parsed.type === 'string' && parsed.type.toLowerCase() !== 'success')

    if (reportsFailure) {
      const label = parsed.status ?? parsed.type ?? 'error'
      logFailure(template, dealId, `msg91_${label}`, raw)
      await recordAttempt({ template, dealId, ok: false, reason: `msg91_${label}`, to: toPhone })
      return { ok: false, reason: `msg91_${label}` }
    }

    // ACCEPTED IS NOT DELIVERED. MSG91 queues the message ("check delivery
    // reports for status"). An unapproved template name, a recipient who has
    // not opted in, or a Meta policy block surfaces in the delivery report
    // later — never in this response. request_id is the reconciliation key.
    console.info(
      `[whatsapp] ✓ accepted (queued, not yet delivered) template=${template} deal=${dealId ?? 'n/a'} request_id=${parsed.request_id ?? 'n/a'}`
    )
    await recordAttempt({
      template, dealId, ok: true, requestId: parsed.request_id, to: toPhone,
    })
    return { ok: true }
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network_error'
    logFailure(template, dealId, reason, err instanceof Error ? err.message : String(err))
    await recordAttempt({ template, dealId, ok: false, reason, to: toPhone })
    return { ok: false, reason }
  }
}

/**
 * Log a delivery failure. Never includes the auth key or message variables
 * (those carry names and deal amounts); phones appear masked only.
 *
 * EVERY non-ok path must go through here. A send that fails silently is worse
 * than one that fails loudly — silence was the original bug: an unroutable
 * phone returned early with no log at all, so three triggered events produced
 * no message and no trace of why.
 */
function logFailure(template: string, dealId: string | undefined, reason: string, detail: string) {
  console.error(
    `[whatsapp] ✗ send failed template=${template} deal=${dealId ?? 'n/a'} reason=${reason} detail=${detail.slice(0, 300)}`
  )
}

/**
 * Persist the outcome of an attempt so "did the creator actually get pinged?"
 * is a query rather than a hunt through Vercel logs.
 *
 * console.error alone was not enough: three separate times we could not answer
 * that question without opening the dashboard, and by then the logs for the
 * moment in question had scrolled.
 *
 * request_id is the reconciliation key and the reason this records SUCCESSES
 * too. MSG91 accepting a message is not Meta delivering it — an unapproved
 * template, a recipient who never opted in, or a policy block all surface in a
 * delivery report afterwards and never in the API response. Without the id
 * stored next to the deal, a queued-but-undelivered message is untraceable.
 *
 * Never throws and never blocks the send: a failure to record is logged and
 * swallowed, because losing the audit line must not cost the notification.
 */
async function recordAttempt(args: {
  template: string
  dealId?: string
  ok: boolean
  reason?: string
  requestId?: string
  to?: string | null
}): Promise<void> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    await createAdminClient().from('events').insert({
      deal_id: args.dealId ?? null,
      event_type: args.ok ? 'notification.whatsapp_sent' : 'notification.whatsapp_failed',
      detail: {
        template: args.template,
        ok: args.ok,
        ...(args.reason && { reason: args.reason }),
        ...(args.requestId && { request_id: args.requestId }),
        ...(args.to && { to_masked: maskPhone(args.to) }),
      },
    })
  } catch (err) {
    console.error(
      `[whatsapp] could not record attempt: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

/**
 * Log, record and return a failure in one step, so no early return can skip
 * any of the three. Awaited rather than fire-and-forget: a serverless function
 * can freeze before a floating promise resolves, which would lose exactly the
 * rows we added this for.
 */
async function fail(
  template: string,
  dealId: string | undefined,
  reason: string,
  detail: string,
  to?: string | null,
): Promise<WhatsAppResult> {
  logFailure(template, dealId, reason, detail)
  await recordAttempt({ template, dealId, ok: false, reason, to })
  return { ok: false, reason }
}
