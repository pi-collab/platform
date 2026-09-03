/**
 * Matching a pasted Instagram URL to a post on the creator's own account.
 *
 * ── Why the SHORTCODE and not the URL ───────────────────────────────────────
 * The same post is reachable at /p/{code}/ and /reel/{code}/, with or without
 * www, with or without a trailing slash, and with whatever tracking query
 * Instagram's share sheet attached that week. `permalink` from /me/media is one
 * of those forms; what the creator pastes is usually another. Comparing URLs
 * would miss real matches constantly and there would be nothing on screen to
 * explain why.
 *
 * The shortcode is the post's identity. Two URLs with the same shortcode are the
 * same post, whatever else differs.
 *
 * No `server-only` marker: this is pure string work with no I/O, and the editor
 * uses it to validate before submitting.
 */

/** Path segments Instagram uses for an addressable post. `tv` is the retired
 *  IGTV form, still live on old links. Stories are deliberately absent: they
 *  expire, so a deliverable pointing at one cannot be verified later. */
const POST_SEGMENTS = new Set(['p', 'reel', 'reels', 'tv'])

const INSTAGRAM_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
])

/**
 * The post's shortcode, or null if this is not an Instagram permalink we can
 * resolve.
 *
 * Parsed with URL rather than a regex, because the browser and Instagram both
 * parse it, and a regex that disagrees with them is a bug waiting for an
 * unusual link.
 */
export function instagramShortcode(raw: string | null | undefined): string | null {
  if (!raw) return null

  const trimmed = raw.trim()
  if (!trimmed) return null

  let url: URL
  try {
    // A creator may paste "instagram.com/reel/abc" without a scheme. Adding one
    // is safe here because the host is checked immediately after.
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())) return null

  const parts = url.pathname.split('/').filter(Boolean)

  // Two shapes: /p/{code} and /{username}/p/{code}. Find the segment that names
  // a post type and take what follows it, rather than assuming a position.
  const i = parts.findIndex((p) => POST_SEGMENTS.has(p.toLowerCase()))
  if (i === -1 || i + 1 >= parts.length) return null

  const code = parts[i + 1]
  // Instagram shortcodes are base64url-ish. Length is not fixed, so this checks
  // the alphabet rather than a count.
  return /^[A-Za-z0-9_-]{5,32}$/.test(code) ? code : null
}

/** True when both URLs address the same post, whatever form each is in. */
export function isSamePost(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = instagramShortcode(a)
  const y = instagramShortcode(b)
  return x !== null && x === y
}

/**
 * Find the creator's own media whose permalink is this post.
 *
 * Returns null rather than a guess. A near miss is a miss: attaching a brand's
 * performance numbers to the wrong post is worse than showing none.
 */
export function findMediaByPermalink<T extends { permalink?: string | null }>(
  media: T[],
  postedUrl: string,
): T | null {
  const target = instagramShortcode(postedUrl)
  if (!target) return null
  return media.find((m) => instagramShortcode(m.permalink) === target) ?? null
}
