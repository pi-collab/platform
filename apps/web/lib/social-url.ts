/**
 * A creator's handle, and where it points.
 *
 * The platform is read from `social_accounts`, NOT from `primary_platform`:
 * that column is null for every creator on production — nothing has ever
 * written it — while social_accounts carries the real value, instagram for the
 * overwhelming majority and youtube for the rest.
 *
 * Tolerant like followerRangeOf, and for the same reason: social_accounts is
 * jsonb written by onboarding, the ops editor, and rows that predate parts of
 * the shape. Anything unexpected reads as "no link" rather than throwing inside
 * a page render.
 */

export interface PrimaryAccount {
  platform: string | null
  handle: string | null
}

export function primaryAccount(socialAccounts: unknown): PrimaryAccount {
  if (!Array.isArray(socialAccounts)) return { platform: null, handle: null }
  for (const entry of socialAccounts) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    const handle = typeof row.handle === 'string' ? row.handle.trim().replace(/^@/, '') : ''
    if (!handle) continue
    const platform = typeof row.platform === 'string' ? row.platform.trim().toLowerCase() : null
    return { platform, handle }
  }
  return { platform: null, handle: null }
}

/**
 * Public profile URL for a handle on a platform.
 *
 * Returns null rather than guessing when the platform is unknown — a link to a
 * URL that 404s is worse than plain text, because it looks checkable and is not.
 */
/**
 * The username inside whatever was typed into a handle field.
 *
 * Creators sometimes paste their whole profile link, share-tracking query and
 * all ("https://www.instagram.com/bapu_ai?stkn=…&utm_source=qr"). Shown raw,
 * that is one unbreakable string that widens an ops table until the approve
 * buttons scroll off screen. For a profile link on a platform we know, this
 * returns the username ("bapu_ai"); anything else comes back trimmed, without
 * a leading @. Display only: the stored value is not changed.
 */
const PROFILE_HOSTS = /^(?:www\.|m\.)?(instagram\.com|youtube\.com|x\.com|twitter\.com|tiktok\.com|linkedin\.com)$/i

export function handleFromInput(raw: string | null | undefined): string {
  const v = (raw ?? '').trim().replace(/^@+/, '')
  if (!/^(https?:\/\/|www\.)/i.test(v) && !PROFILE_HOSTS.test(v.split('/')[0] ?? '')) return v
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`)
    if (!PROFILE_HOSTS.test(u.hostname)) return v
    const parts = u.pathname.split('/').filter(Boolean)
    // linkedin.com/in/<name>; youtube.com/@name or /c/<name>; the rest /<name>
    const seg = (parts[0] === 'in' || parts[0] === 'c' || parts[0] === 'user') ? parts[1] : parts[0]
    return seg ? decodeURIComponent(seg).replace(/^@+/, '') : v
  } catch {
    return v
  }
}

export function socialProfileUrl(platform: string | null | undefined, handle: string | null | undefined): string | null {
  const h = handleFromInput(handle)
  if (!h) return null

  // A handle should not contain a slash or a space. If it does, someone pasted
  // a URL or a sentence into the field, and appending it to a domain would
  // produce something misleading.
  if (/[\s/?#]/.test(h)) return null

  switch ((platform ?? '').trim().toLowerCase()) {
    case 'instagram':
      return `https://instagram.com/${h}`
    // YouTube handles are @-prefixed in their URL form, which is why the @ is
    // stripped above and added back only here.
    case 'youtube':
      return `https://youtube.com/@${h}`
    case 'x':
    case 'twitter':
      return `https://x.com/${h}`
    case 'tiktok':
      return `https://tiktok.com/@${h}`
    case 'linkedin':
      return `https://linkedin.com/in/${h}`
    default:
      return null
  }
}
