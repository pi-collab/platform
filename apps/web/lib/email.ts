import 'server-only'

/**
 * Resend transactional email channel.
 *
 * Sends deal notifications to BRANDS only (creators are notified by WhatsApp;
 * that split is a product decision, not an implementation detail).
 *
 * ── CONTRACT: this module NEVER throws and NEVER hangs. ────────────────────
 * Every entry point returns a result object. An email send is a side effect of
 * a deal action, never part of its transaction — if Resend is down, slow,
 * misconfigured, or returns garbage, the deal state change must still succeed.
 * Callers rely on this; do not introduce a throw path.
 *
 * ── EVERY non-ok path logs before returning. ──────────────────────────────
 * This is not stylistic. The WhatsApp sender originally returned early on an
 * unusable recipient with no log at all, and three triggered events produced
 * no message and no trace of why — an hour of blind debugging. Route every
 * failure through fail().
 *
 * ── API (Resend) ──────────────────────────────────────────────────────────
 *   POST https://api.resend.com/emails
 *   Authorization: Bearer <RESEND_API_KEY>
 *   { from, to: string[], subject, html, text, reply_to }
 *   → { id: "49a3999c-..." }
 *
 * `to` accepts at most 50 addresses. An optional Idempotency-Key header is
 * honoured for 24h — see sendDealEmail.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/** Hard ceiling on how long a deal action can be delayed by Resend. */
const TIMEOUT_MS = 4000

/** Resend's documented per-request recipient cap. */
const MAX_RECIPIENTS = 50

export type EmailResult =
  | { ok: true; id?: string }
  | { ok: false; reason: string }

interface EmailConfig {
  apiKey: string
  from: string
  replyTo: string | null
}

/**
 * Read config, or null when email is not fully configured.
 *
 * Deliberately OPT-IN: `EMAIL_ENABLED` must be exactly 'true'. Unset means no
 * sends AT ALL — not failed sends, no HTTP request. Local `.env.local` points
 * at the shared Supabase project holding real brand rows with real addresses,
 * so without this switch a single test click emails an actual customer.
 */
function readConfig(): EmailConfig | null {
  if (process.env.EMAIL_ENABLED !== 'true') return null

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) return null

  return {
    apiKey,
    from,
    replyTo: process.env.EMAIL_REPLY_TO || null,
  }
}

export function isEmailConfigured(): boolean {
  return readConfig() !== null
}

/** Mask an address for logs — identifiable, not harvestable. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  const head = local.slice(0, 2)
  return `${head}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`
}

/** Cheap sanity check — Resend rejects malformed addresses for the whole call. */
export function isPlausibleEmail(email: string | null | undefined): email is string {
  if (!email) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export interface SendDealEmailParams {
  /** Recipient addresses. Invalid ones should be filtered before calling. */
  to: string[]
  subject: string
  html: string
  /** Plain-text alternative. Always send one — text-only clients and spam filters both want it. */
  text: string
  /**
   * Value for Resend's Idempotency-Key header (24h window).
   *
   * Makes the SEND idempotent: if this exact call is retried — by our own
   * retry, a fetch-level replay, or a double-invoked server action reusing the
   * same key — Resend delivers once. It does NOT deduplicate two genuinely
   * distinct events, which is correct; two counter-offers should send two
   * emails.
   */
  idempotencyKey?: string
  /** Deal id, for log correlation only. */
  dealId?: string
}

/**
 * Send one transactional email to one or more brand members.
 *
 * Resolves `{ok:false, reason}` for every failure mode — missing config, no
 * recipients, network error, timeout, HTTP error, or an unparseable body.
 * Never rejects.
 */
export async function sendDealEmail(params: SendDealEmailParams): Promise<EmailResult> {
  const { to, subject, html, text, idempotencyKey, dealId } = params

  try {
    const config = readConfig()
    if (!config) {
      return fail(dealId, 'not_configured', 'EMAIL_ENABLED is not exactly "true", or RESEND_API_KEY / EMAIL_FROM is missing')
    }

    const recipients = to.filter(isPlausibleEmail).map((e) => e.trim())
    if (recipients.length === 0) {
      return fail(dealId, 'no_valid_recipients', `${to.length} address(es) supplied, none usable`)
    }

    // One malformed address fails the entire Resend call, so cap rather than
    // let a large brand silently lose the whole notification.
    const capped = recipients.slice(0, MAX_RECIPIENTS)
    if (recipients.length > MAX_RECIPIENTS) {
      console.warn(`[email] recipient list truncated deal=${dealId ?? 'n/a'} ${recipients.length} → ${MAX_RECIPIENTS}`)
    }

    if (!subject.trim() || !html.trim()) {
      return fail(dealId, 'empty_content', 'subject or html body is blank')
    }

    console.info(
      `[email] → sending deal=${dealId ?? 'n/a'} to=${capped.map(maskEmail).join(',')} subject="${subject.slice(0, 60)}"`
    )

    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    }
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

    const body: Record<string, unknown> = {
      from: config.from,
      to: capped,
      subject,
      html,
      text,
    }
    if (config.replyTo) body.reply_to = config.replyTo

    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })

    const raw = await res.text().catch(() => '')

    if (!res.ok) {
      return fail(dealId, `http_${res.status}`, raw)
    }

    let parsed: { id?: string; message?: string; name?: string } = {}
    try {
      parsed = raw ? JSON.parse(raw) : {}
    } catch {
      // Accepted but unparseable: treat as sent rather than raise a false alarm.
      console.info(`[email] ✓ accepted deal=${dealId ?? 'n/a'} (unparseable body)`)
      return { ok: true }
    }

    // Resend signals errors with a `name` (e.g. "validation_error") and no id.
    // Do not trust the status code alone — the WhatsApp integration shipped a
    // bug by checking only one field that real responses did not contain.
    if (!parsed.id) {
      return fail(dealId, `resend_${parsed.name ?? 'no_id'}`, raw)
    }

    console.info(`[email] ✓ accepted deal=${dealId ?? 'n/a'} id=${parsed.id}`)
    return { ok: true, id: parsed.id }
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network_error'
    return fail(dealId, reason, err instanceof Error ? err.message : String(err))
  }
}

/**
 * Log a delivery failure. Never includes the API key or full recipient
 * addresses; message bodies are never logged.
 */
function logFailure(dealId: string | undefined, reason: string, detail: string) {
  console.error(
    `[email] ✗ send failed deal=${dealId ?? 'n/a'} reason=${reason} detail=${detail.slice(0, 300)}`
  )
}

/** Log and return a failure in one step, so no early return can skip the log. */
function fail(dealId: string | undefined, reason: string, detail: string): EmailResult {
  logFailure(dealId, reason, detail)
  return { ok: false, reason }
}


/**
 * Send an account-level email (approval, rejection) to one or more addresses.
 *
 * Delegates to the same transport as sendDealEmail — which is generic despite
 * its name, taking dealId only for log correlation. This exists so account
 * call sites do not read as if they were sending about a deal.
 */
export async function sendAccountEmail(params: {
  to: string[]
  subject: string
  html: string
  text: string
  idempotencyKey?: string
}): Promise<EmailResult> {
  return sendDealEmail(params)
}
