/**
 * ANALYTICS — the single entry point for product analytics (PostHog).
 *
 * Components must import from here, never `posthog-js` directly. That keeps
 * one consent-aware surface: if PostHog was never initialised (no consent, or
 * no key configured) every call here is a no-op.
 *
 * CONSENT (DPDP): PostHog is not merely opted-out before consent — it is never
 * initialised at all, so no SDK boots and no network request is made. See
 * components/PostHogProvider.tsx. These helpers read the instance that the
 * provider publishes on `window.__posthog`; before consent that is undefined,
 * so nothing can capture even by accident.
 *
 * PII: event properties must stay non-identifying — slugs, deal refs, counts,
 * bucketed amounts. Never a name, email, phone number, or exact deal value.
 * Users are identified by their `users.id` UUID, nothing else.
 */

/**
 * Known events. A union rather than an enum so adding one is a single line,
 * while a typo in an existing name fails at compile time.
 *
 * NAMES ARE STABLE — renaming breaks continuity with data already collected.
 * The storefront names below predate this file; `deal_created_from_storefront`
 * is the "pitch sent" conversion, despite the wordier name.
 */
export type KnownEvent =
  // Storefront funnel (already live — do not rename)
  | 'storefront_viewed'
  | 'pitch_started'
  | 'pitch_send_attempted'
  | 'deal_created_from_storefront'
  // Deal lifecycle
  | 'offer_sent'
  | 'offer_accepted'
  | 'offer_declined'
  | 'offer_countered'
  | 'deliverable_submitted'
  | 'deliverable_approved'
  | 'payment_released'
  | 'deal_completed'
  // Acquisition / activation
  | 'brand_signed_up'
  | 'creator_onboarded'
  // Retention — the metric that matters most (see docs/build-plan.md §9)
  | 'deal_2_started'

/**
 * Event name. Accepts a KnownEvent with autocomplete and typo-checking, but
 * still allows a new string so a one-off event never requires editing a type.
 */
type EventName = KnownEvent | (string & {})

type Props = Record<string, unknown>

function client(): { capture?: Function; identify?: Function; reset?: Function } | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { __posthog?: never }).__posthog
}

/**
 * Record a product event. No-op without consent.
 *
 * Adding a new event is one line here plus one line at the call site.
 */
export function trackEvent(name: EventName, properties?: Props) {
  try {
    client()?.capture?.(name, properties)
  } catch {
    // Analytics must never break a user flow.
  }
}

/**
 * Tie subsequent events to a known user.
 *
 * Pass the `users.id` UUID — NEVER an email, phone, or name. PostHog stores
 * the distinct ID indefinitely and it appears throughout the UI; a UUID keeps
 * personal data out of a third-party system.
 *
 * Anonymous events captured earlier in the session are merged onto this
 * person, which is what preserves first-touch UTM attribution through signup.
 */
export function identifyUser(userId: string, properties?: Props) {
  if (!userId) return
  try {
    client()?.identify?.(userId, properties)
  } catch {
    /* no-op */
  }
}

/**
 * Clear the identified person. MUST be called on sign-out, or the next person
 * to use the same browser inherits the previous user's identity and their
 * events are attributed to the wrong account.
 */
export function resetAnalytics() {
  try {
    client()?.reset?.()
  } catch {
    /* no-op */
  }
}

/**
 * Bucket a rupee amount for analytics.
 *
 * Exact deal values are commercially sensitive — a creator's rate and a
 * brand's spend are the core of the relationship we host. Buckets preserve the
 * distribution signal without shipping precise figures to a third party.
 *
 * Takes PAISE (money is integer paise everywhere) and returns a coarse label.
 */
export function priceBucket(paise: number | null | undefined): string {
  if (!paise || paise <= 0) return 'unset'
  const rupees = paise / 100
  if (rupees < 10_000) return '<10k'
  if (rupees < 25_000) return '10k-25k'
  if (rupees < 50_000) return '25k-50k'
  if (rupees < 100_000) return '50k-1L'
  if (rupees < 300_000) return '1L-3L'
  if (rupees < 1_000_000) return '3L-10L'
  return '10L+'
}
