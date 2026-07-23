// Thin wrapper so components don't import posthog directly.
// If PostHog isn't initialized (no consent), calls are no-ops.

export function trackEvent(name: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  try {
    const posthog = (window as any).__posthog
    if (posthog?.capture) posthog.capture(name, properties)
  } catch {}
}
