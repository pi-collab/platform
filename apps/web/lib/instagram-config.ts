import 'server-only'

/**
 * The redirect URI, in one place.
 *
 * Meta matches this EXACTLY against the list registered in the App Dashboard:
 * a trailing slash, a different host, or http instead of https is a rejected
 * authorisation rather than a warning. It is also sent twice — once on the
 * authorize URL and again on the code exchange — and the two must agree, so it
 * is derived here rather than written out at each call site.
 *
 * Built from NEXT_PUBLIC_SITE_URL so staging and production each produce their
 * own, and both are registered.
 */
export function instagramRedirectUri(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')
  return `${base}/api/instagram/callback`
}

/**
 * Where the creator lands after connecting, succeeded or not.
 *
 * An ALLOWLIST, not a path taken from the query string. The connect route is
 * authenticated and ends in a redirect, so echoing back a caller-supplied URL
 * would let a crafted link bounce a signed-in creator to an attacker's page
 * carrying our own origin as the referrer. Only these two screens offer the
 * connect action, so only these two are reachable, and anything unrecognised
 * falls back to settings rather than being honoured.
 */
const RETURN_TARGETS = {
  settings: '/creator/settings?tab=profile',
  storefront: '/creator/storefront?step=audience',
} as const

export type InstagramReturnTarget = keyof typeof RETURN_TARGETS

export function isReturnTarget(v: string | undefined | null): v is InstagramReturnTarget {
  return v === 'settings' || v === 'storefront'
}

export function instagramReturnPath(
  params?: Record<string, string>,
  target: InstagramReturnTarget = 'settings',
): string {
  const q = params ? `&${new URLSearchParams(params)}` : ''
  return `${RETURN_TARGETS[target]}${q}`
}
