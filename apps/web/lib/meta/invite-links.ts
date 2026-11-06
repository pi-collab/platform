/** Client-safe link builders for invite routes (no secrets, no crypto). */

export const instagramProfileUrl = (u: string) => `https://www.instagram.com/${encodeURIComponent(u)}/`
export const instagramMessageUrl = (u: string) => `https://ig.me/m/${encodeURIComponent(u)}`

/** wa.me needs digits only, country code first. Indian 10-digit numbers get 91. */
export function whatsappUrl(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, '')
  const full = digits.length === 10 && /^[6-9]/.test(digits) ? `91${digits}` : digits
  if (full.length < 11 || full.length > 15) return null
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`
}
