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
 * Returns null for anything that isn't a plausible Indian mobile — better to
 * skip the send than to hand MSG91 a malformed recipient.
 */
export function toMsg91Number(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (/^91\d{10}$/.test(digits)) return digits
  if (/^\d{10}$/.test(digits)) return `91${digits}`
  return null
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
    if (!config) return { ok: false, reason: 'whatsapp_not_configured' }

    const to = toMsg91Number(toPhone)
    if (!to) return { ok: false, reason: 'no_valid_phone' }

    // WhatsApp rejects empty body parameters — catch it here rather than
    // burning a send and getting an opaque template-mismatch error back.
    if (bodyVars.some((v) => !v || !v.trim())) {
      return { ok: false, reason: 'empty_body_var' }
    }

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
    let parsed: { type?: string; message?: string } = {}
    try {
      parsed = raw ? JSON.parse(raw) : {}
    } catch {
      // Accepted but unparseable: treat as sent rather than risk a false alarm.
      return { ok: true }
    }

    if (parsed.type && parsed.type !== 'success') {
      logFailure(template, dealId, `msg91_${parsed.type}`, raw)
      return { ok: false, reason: `msg91_${parsed.type}` }
    }

    return { ok: true }
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network_error'
    logFailure(template, dealId, reason, err instanceof Error ? err.message : String(err))
    return { ok: false, reason }
  }
}

/**
 * Log a delivery failure. Never includes the auth key, the recipient's phone,
 * or message variables — those can carry names and deal amounts.
 */
function logFailure(template: string, dealId: string | undefined, reason: string, detail: string) {
  console.error(
    `[whatsapp] send failed template=${template} deal=${dealId ?? 'n/a'} reason=${reason} detail=${detail.slice(0, 300)}`
  )
}
