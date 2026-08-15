import { redirect } from 'next/navigation'

export const metadata = { robots: { index: false, follow: false } }

/**
 * /login → /login/brand
 *
 * Brand login lived here while creator login sat at /login/creator, which read
 * as though brand were the default and creator the special case. Both are now
 * named.
 *
 * This stub stays indefinitely. /login is not just an internal link: it is in
 * the wild in team invites, anything already shared, and every browser that has
 * ever bookmarked it.
 *
 * A temporary redirect, deliberately. A 308 is cached hard by browsers, so if
 * this ever moves back, testers would keep landing here from cache with no way
 * to tell why. Nothing about this is hot enough to justify that.
 *
 * Search params are carried through — ?error=, ?next= and ?view= all arrive
 * here from auth callbacks and storefront pitches, and dropping them would turn
 * a specific message into a blank form.
 */
export default function LoginRedirect({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') params.set(key, value)
    else if (Array.isArray(value) && value[0]) params.set(key, value[0])
  }
  const qs = params.toString()
  redirect(qs ? `/login/brand?${qs}` : '/login/brand')
}
