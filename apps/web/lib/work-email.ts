/**
 * Work-email enforcement for BRAND signup.
 *
 * Brands must sign up with a company address. The intent is spam control: the
 * creator side is seeded from Utkarsh's audience, and without this anyone with
 * a free inbox can create a "brand" account and start sending offers.
 *
 * SIGNUP ONLY — never login. Every brand account that exists today uses a free
 * provider, and they must all keep working. Only NEW account creation is gated.
 *
 * Creators are unaffected: they sign up with phone + OTP.
 */

/**
 * Free consumer mail providers. Deliberately a blocklist, not an allowlist —
 * an allowlist of legitimate company domains is unmaintainable.
 *
 * This does NOT cover disposable/burner domains (mailinator, 10minutemail and
 * hundreds more). Those need a maintained list or a third-party service; if
 * burner signups become a real problem, that's the next step, not a longer
 * hand-written list here.
 */
const FREE_EMAIL_DOMAINS = new Set([
  // Google
  'gmail.com', 'googlemail.com',
  // Microsoft
  'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'msn.com',
  // Yahoo
  'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com',
  // Apple
  'icloud.com', 'me.com', 'mac.com',
  // Privacy-focused
  'proton.me', 'protonmail.com', 'tutanota.com', 'tuta.io',
  // India-specific
  'rediffmail.com', 'sify.com', 'indiatimes.com',
  // Other majors
  'aol.com', 'gmx.com', 'gmx.net', 'mail.com', 'yandex.com', 'yandex.ru',
  'zoho.com', 'inbox.com', 'fastmail.com', 'hushmail.com',
])

/**
 * `code` lets the UI react to WHY it failed without string-matching the
 * message — a personal-email rejection deserves a route to a human, an
 * unparseable address does not.
 */
export type EmailCheck =
  | { ok: true }
  | { ok: false; code: 'invalid' | 'personal_email'; message: string }

/** Lowercased domain part, or null if the address is unusable. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 1 || at === email.length - 1) return null
  return email.slice(at + 1).trim().toLowerCase()
}

export function isFreeEmailProvider(email: string): boolean {
  const domain = emailDomain(email)
  return domain !== null && FREE_EMAIL_DOMAINS.has(domain)
}

/**
 * Validate a brand signup address.
 *
 * `bypassList` is the comma-separated OPS_ALLOWED_EMAILS value. Founders are
 * on free providers themselves, so without this they could not create test
 * brand accounts on staging — reusing the existing ops allowlist avoids adding
 * another env var whose only job is to be a back door.
 */
export function validateWorkEmail(email: string, bypassList?: string | null): EmailCheck {
  const trimmed = email.trim().toLowerCase()

  if (!trimmed || !emailDomain(trimmed)) {
    return { ok: false, code: 'invalid', message: 'Please enter a valid email address.' }
  }

  if (bypassList) {
    const allowed = new Set(bypassList.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))
    if (allowed.has(trimmed)) return { ok: true }
  }

  if (isFreeEmailProvider(trimmed)) {
    return {
      ok: false,
      code: 'personal_email',
      message: 'Please use your work email, like you@brand.com.',
    }
  }

  return { ok: true }
}
