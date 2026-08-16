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
 * India first because that is the roster, then the places Indian creators
 * actually have second numbers — the Gulf, the UK, North America, Singapore
 * and Australia — then the rest alphabetically.
 *
 * `iso` is what the closed field shows, because "IN +91" fits a narrow control
 * and "India" does not. The full name appears in the open list, where a
 * two-letter code alone would be unreadable for anyone who does not already
 * know AE from AU.
 *
 * Not all ~200 countries: a list nobody can scan is worse than a short one,
 * and adding a row is one line.
 */
export const DIAL_CODES: { code: string; iso: string; label: string }[] = [
  { code: '+91', iso: 'IN', label: 'India' },
  { code: '+971', iso: 'AE', label: 'United Arab Emirates' },
  { code: '+44', iso: 'UK', label: 'United Kingdom' },
  { code: '+1', iso: 'US', label: 'United States / Canada' },
  { code: '+65', iso: 'SG', label: 'Singapore' },
  { code: '+61', iso: 'AU', label: 'Australia' },
  { code: '+966', iso: 'SA', label: 'Saudi Arabia' },
  { code: '+974', iso: 'QA', label: 'Qatar' },
  { code: '+965', iso: 'KW', label: 'Kuwait' },
  { code: '+968', iso: 'OM', label: 'Oman' },
  { code: '+973', iso: 'BH', label: 'Bahrain' },
  { code: '+60', iso: 'MY', label: 'Malaysia' },
  { code: '+62', iso: 'ID', label: 'Indonesia' },
  { code: '+66', iso: 'TH', label: 'Thailand' },
  { code: '+63', iso: 'PH', label: 'Philippines' },
  { code: '+84', iso: 'VN', label: 'Vietnam' },
  { code: '+81', iso: 'JP', label: 'Japan' },
  { code: '+82', iso: 'KR', label: 'South Korea' },
  { code: '+86', iso: 'CN', label: 'China' },
  { code: '+852', iso: 'HK', label: 'Hong Kong' },
  { code: '+64', iso: 'NZ', label: 'New Zealand' },
  { code: '+49', iso: 'DE', label: 'Germany' },
  { code: '+33', iso: 'FR', label: 'France' },
  { code: '+34', iso: 'ES', label: 'Spain' },
  { code: '+39', iso: 'IT', label: 'Italy' },
  { code: '+31', iso: 'NL', label: 'Netherlands' },
  { code: '+41', iso: 'CH', label: 'Switzerland' },
  { code: '+46', iso: 'SE', label: 'Sweden' },
  { code: '+47', iso: 'NO', label: 'Norway' },
  { code: '+45', iso: 'DK', label: 'Denmark' },
  { code: '+353', iso: 'IE', label: 'Ireland' },
  { code: '+351', iso: 'PT', label: 'Portugal' },
  { code: '+48', iso: 'PL', label: 'Poland' },
  { code: '+7', iso: 'RU', label: 'Russia / Kazakhstan' },
  { code: '+90', iso: 'TR', label: 'Turkey' },
  { code: '+27', iso: 'ZA', label: 'South Africa' },
  { code: '+234', iso: 'NG', label: 'Nigeria' },
  { code: '+254', iso: 'KE', label: 'Kenya' },
  { code: '+20', iso: 'EG', label: 'Egypt' },
  { code: '+55', iso: 'BR', label: 'Brazil' },
  { code: '+52', iso: 'MX', label: 'Mexico' },
  { code: '+54', iso: 'AR', label: 'Argentina' },
  { code: '+94', iso: 'LK', label: 'Sri Lanka' },
  { code: '+977', iso: 'NP', label: 'Nepal' },
  { code: '+880', iso: 'BD', label: 'Bangladesh' },
  { code: '+92', iso: 'PK', label: 'Pakistan' },
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


/**
 * Split a stored E.164 number back into a dial code and the national part,
 * so a saved number can be shown in the control it was entered with.
 *
 * Longest prefix wins: +1 would otherwise swallow numbers belonging to +91,
 * and +9 shapes overlap heavily (+91, +92, +94, +971, +977).
 *
 * Falls back to the default dial code with the digits intact rather than
 * returning null — showing a number under the wrong flag is recoverable by
 * the user; showing them an empty field after they saved one is not.
 */
export function splitE164(
  stored: string | null | undefined,
  fallbackDial = '+91',
): { dial: string; national: string } {
  if (!stored) return { dial: fallbackDial, national: '' }

  const digits = stored.replace(/\D/g, '')
  const match = [...DIAL_CODES]
    .sort((a, b) => b.code.length - a.code.length)
    .find((d) => digits.startsWith(d.code.replace('+', '')))

  if (!match) return { dial: fallbackDial, national: digits }
  return { dial: match.code, national: digits.slice(match.code.length - 1) }
}
