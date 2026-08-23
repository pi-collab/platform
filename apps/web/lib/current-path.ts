import 'server-only'
import { headers } from 'next/headers'

/**
 * The path being rendered, including its query string.
 *
 * Next gives server components no way to read their own URL, so middleware puts
 * it on the request as `x-pathname`. Both auth helpers need it to build a
 * `next` when they bounce someone to a login page.
 *
 * It lived in creator-auth, which is why the brand side never used it and brand
 * redirects lost their destination. One concept, one home.
 *
 * Returns null where the header is absent (a server action, for instance),
 * which callers should read as "no particular destination".
 */
export function currentPath(): string | null {
  return headers().get('x-pathname')
}
