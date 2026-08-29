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

/** Where the creator lands after connecting, succeeded or not. */
export function instagramReturnPath(params?: Record<string, string>): string {
  const q = params ? `&${new URLSearchParams(params)}` : ''
  return `/creator/settings?tab=profile${q}`
}
