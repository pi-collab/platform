/**
 * Addresses we mint ourselves, and what to do with them at the edges.
 *
 * A creator who signs up by phone has no email, but GoTrue requires one, so we
 * mint `creator_<phone>@auth.guapd.internal`. It is a routing artefact, not a
 * fact about the person. Two consequences, and this module owns both:
 *
 *   1. Nothing may be SENT there. auth.guapd.internal has no MX record, so
 *      every message is a hard bounce, and enough of those get a sending domain
 *      throttled. lib/email.ts enforces that.
 *
 *   2. Nothing may be SHOWN there. It leaked into the creator sidebar's profile
 *      dropdown, where someone who has never given us an email address was told
 *      that this was theirs.
 *
 * Deliberately client-safe — no `server-only` import. lib/email.ts is
 * server-only, so a component rendering an address in the browser could not
 * share its list, and the alternative was a second copy of the domain that
 * would drift. Same split as creator-onboarding-labels vs creator-onboarding.
 */

export const SYNTHETIC_EMAIL_DOMAINS = ['@auth.guapd.internal']

export function isSyntheticEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const e = email.trim().toLowerCase()
  return SYNTHETIC_EMAIL_DOMAINS.some(d => e.endsWith(d))
}

/**
 * The address to show a person, or null when there is nothing honest to show.
 *
 * Returns null rather than a placeholder string on purpose: callers already
 * guard on falsy before rendering, so an empty result removes the row instead
 * of replacing it with "no email", which is a sentence nobody asked for in a
 * dropdown.
 */
export function displayEmail(email: string | null | undefined): string | null {
  if (!email) return null
  return isSyntheticEmail(email) ? null : email
}
