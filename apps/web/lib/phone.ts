/**
 * Indian mobile numbers are ten digits beginning 6, 7, 8 or 9. The lower
 * ranges are landline and service codes, so a number starting 0-5 is not a
 * mobile and cannot receive an SMS code.
 *
 * Checking this matters before we spend a send: without it, a mistyped number
 * is accepted, an OTP is dispatched into nowhere, and the creator sits waiting
 * for a code that was never deliverable — with nothing on screen to suggest
 * the number was the problem.
 */
const INDIAN_MOBILE = /^[6-9]\d{9}$/

/**
 * Normalize an Indian mobile number to +91XXXXXXXXXX, or null if it isn't one.
 *
 * Accepts the shapes people actually type: bare ten digits, +91 or 91
 * prefixed, and 0-prefixed trunk dialling. Strips spaces, dashes, dots and
 * parens first, so "+91 98765-43210" and "09876543210" both resolve.
 *
 * Every path ends at the same INDIAN_MOBILE check, so a prefixed number can't
 * smuggle in a subscriber part that a bare one would have been rejected for.
 */
export function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-.()]/g, '')

  let local: string | null = null

  if (cleaned.startsWith('+91') && cleaned.length === 13) local = cleaned.slice(3)
  else if (cleaned.startsWith('91') && cleaned.length === 12) local = cleaned.slice(2)
  else if (cleaned.startsWith('0') && cleaned.length === 11) local = cleaned.slice(1)
  else if (/^\d{10}$/.test(cleaned)) local = cleaned

  if (!local || !INDIAN_MOBILE.test(local)) return null

  return `+91${local}`
}

/** True when `raw` is a usable Indian mobile number. */
export function isValidIndianMobile(raw: string): boolean {
  return normalizePhone(raw) !== null
}


/**
 * Dial codes offered for a WhatsApp number.
 *
 * India first because that is the roster, but a creator with an Indian login
 * number may well read WhatsApp on a foreign one — that is exactly what this
 * exists for. Deliberately a short list rather than all ~200: a long select is
 * worse to use, and anything missing can be added in a line.
 */
export const DIAL_CODES: { code: string; label: string }[] = [
  { code: '+91', label: 'India' },
  { code: '+44', label: 'United Kingdom' },
  { code: '+1', label: 'United States / Canada' },
  { code: '+971', label: 'United Arab Emirates' },
  { code: '+65', label: 'Singapore' },
  { code: '+61', label: 'Australia' },
  { code: '+60', label: 'Malaysia' },
  { code: '+49', label: 'Germany' },
  { code: '+33', label: 'France' },
  { code: '+31', label: 'Netherlands' },
  { code: '+62', label: 'Indonesia' },
  { code: '+94', label: 'Sri Lanka' },
  { code: '+977', label: 'Nepal' },
  { code: '+880', label: 'Bangladesh' },
]

/**
 * Normalize an international number to +<digits>, or null.
 *
 * Used for the WhatsApp recipient, NOT for login. normalizePhone stays
 * India-only on purpose: that number is the identity the OTP is sent to, and
 * OTP delivery is Indian. This one only has to be somewhere WhatsApp reaches.
 *
 * 8 to 15 digits is E.164's own range, and matches what toMsg91Number will
 * accept downstream — so a number that passes here cannot be rejected later
 * for its shape.
 */
export function normalizeE164(dialCode: string, nationalNumber: string): string | null {
  const cc = dialCode.replace(/\D/g, '')
  const national = nationalNumber.replace(/\D/g, '').replace(/^0+/, '')
  if (!cc || !national) return null

  const full = `${cc}${national}`
  if (full.length < 8 || full.length > 15) return null

  return `+${full}`
}
