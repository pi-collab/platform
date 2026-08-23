/**
 * Social handles, stored inconsistently.
 *
 * Measured on staging: 17 of 21 handles inside `creators.social_accounts` keep
 * the leading "@" the creator typed, and `creator_products.handle` is worse —
 * 23 of 25. Nothing normalises on write, so every reader has to.
 *
 * Where that was missed it produced "@@aaravmoney" on the shopfront, and a
 * YouTube link of youtube.com/@@handle that goes nowhere. Five files already
 * carry their own `startsWith('@') ? h : '@' + h`; this is that, once.
 *
 * Normalising on write would be better, but it means a migration over live rows
 * plus every writer, and a wrong link today is worth fixing today.
 */

/** Strip a leading "@". Safe to call on a handle that has none. */
export function bareHandle(handle: string | null | undefined): string {
  return (handle ?? '').trim().replace(/^@+/, '')
}

/** Display form — exactly one leading "@". */
export function atHandle(handle: string | null | undefined): string {
  const bare = bareHandle(handle)
  return bare ? `@${bare}` : ''
}

/** The creator's page on that platform. */
export function profileUrl(platform: string, handle: string | null | undefined): string | null {
  const bare = bareHandle(handle)
  if (!bare) return null
  switch (platform?.trim().toLowerCase()) {
    case 'instagram': return `https://instagram.com/${bare}`
    case 'youtube':   return `https://youtube.com/@${bare}`
    case 'twitter':   return `https://x.com/${bare}`
    case 'linkedin':  return `https://linkedin.com/in/${bare}`
    default:          return null
  }
}
