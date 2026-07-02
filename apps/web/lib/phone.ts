/**
 * Normalize an Indian phone number to +91XXXXXXXXXX format.
 * Strips spaces, dashes, dots, parens. Adds +91 if missing.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-\.\(\)]/g, '')

  // Already has +91
  if (digits.startsWith('+91') && digits.length === 13) return digits

  // Has 91 prefix without +
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`

  // Just 10 digits
  if (/^\d{10}$/.test(digits)) return `+91${digits}`

  // 0-prefixed (trunk)
  if (digits.startsWith('0') && digits.length === 11) return `+91${digits.slice(1)}`

  return null // invalid
}
