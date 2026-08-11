/**
 * Open-redirect guard for `next` redirect targets.
 *
 * Same intent as the check already used by the brand callback
 * (`app/auth/callback/route.ts`), but resolved through the WHATWG URL parser
 * rather than prefix-matching, so the browser's own normalisation rules
 * decide what counts as same-origin.
 *
 * Rejected (each would leave guapd.com when concatenated onto an origin):
 *   `https://evil.com`  — absolute URL (no leading `/`)
 *   `//evil.com`        — protocol-relative
 *   `/\evil.com`        — the parser normalises `\` to `/`, making it `//evil.com`
 *   `/%0A//evil.com`    — control characters the parser strips before resolving
 *
 * NOT marked `server-only`: the login page validates server-side and passes
 * the result down to client components as a plain prop.
 */
const SENTINEL_ORIGIN = 'https://next.invalid'

export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith('/')) return fallback

  try {
    const resolved = new URL(next, SENTINEL_ORIGIN)
    // If resolution escaped the sentinel origin, `next` pointed off-site.
    if (resolved.origin !== SENTINEL_ORIGIN) return fallback
    return resolved.pathname + resolved.search + resolved.hash
  } catch {
    return fallback
  }
}

/**
 * Build the creator login URL, preserving where the creator was headed.
 * An unsafe or absent `next` yields a bare `/login/creator`.
 */
export function creatorLoginUrl(next?: string | null): string {
  const target = safeNext(next, '')
  return target ? `/login/creator?next=${encodeURIComponent(target)}` : '/login/creator'
}
