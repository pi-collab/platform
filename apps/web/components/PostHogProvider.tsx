'use client'

import { useEffect, useRef, ReactNode, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'

/**
 * PostHog bootstrap, gated on analytics consent (DPDP).
 *
 * THE GATE IS "DO NOT INITIALISE", not "initialise then opt out". Before
 * consent no SDK boots, no autocapture runs, no session replay starts, and no
 * network request is made. That is stricter than PostHog's opt-out API and is
 * what the "no posthog requests on first load" test asserts.
 *
 * `opt_out_capturing_by_default` + an explicit `opt_in_capturing()` is a
 * SECOND layer: if some future code path imports posthog-js directly and
 * calls it, it still cannot capture until opted in.
 *
 * Consent lives in localStorage under `guapd_analytics_consent`, values
 * 'granted' | 'denied' | absent. CookieConsent writes it and dispatches
 * `guapd_consent_change`; this provider listens.
 *
 * NOTE: trackEvent/identify live in lib/analytics.ts. They are deliberately
 * NOT re-exported here — there used to be a second copy in this file, unused
 * but importable, which is exactly how two diverging analytics paths start.
 */

const CONSENT_KEY = 'guapd_analytics_consent'

function getConsent(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(CONSENT_KEY)
}

function initPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
  if (!key || !host) return

  posthog.init(key, {
    api_host: host,
    persistence: 'localStorage+cookie',

    // Second consent layer — see the header comment.
    opt_out_capturing_by_default: true,

    // App Router does not emit $pageview on client navigations, so the initial
    // one is captured here and route changes are handled by the hook below.
    // Leaving this to fire automatically on every SPA nav is not possible; a
    // single pageview per session would make every funnel wrong.
    capture_pageview: false,

    session_recording: {
      // Inputs are masked by default, but set explicitly so a future SDK
      // default change cannot silently start recording what people type.
      maskAllInputs: true,
      maskInputOptions: {
        password: true,
        email: true,
        tel: true,
      },
      // TEXT is NOT masked by default. Anything rendering PII as text —
      // creator phone numbers in /ops, team member emails, exact deal
      // amounts — must carry data-ph-mask.
      maskTextSelector: '[data-ph-mask]',
    },
  })

  // Explicit opt-in now that consent is confirmed.
  posthog.opt_in_capturing()

  // Initial pageview, since capture_pageview is off.
  posthog.capture('$pageview')

  ;(window as unknown as { __posthog?: typeof posthog }).__posthog = posthog
}

function shutdownPostHog() {
  try {
    if (posthog.__loaded) {
      posthog.opt_out_capturing()
      posthog.reset()
    }
  } catch {
    /* no-op */
  }
  ;(window as unknown as { __posthog?: unknown }).__posthog = undefined
}

/**
 * Emit $pageview on App Router client navigations.
 *
 * Only runs once PostHog exists, so it inherits the consent gate.
 */
function usePageviews() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const firstRun = useRef(true)

  useEffect(() => {
    // init() already captured the first pageview; don't double-count it.
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const ph = (window as unknown as { __posthog?: typeof posthog }).__posthog
    if (!ph) return
    ph.capture('$pageview')
  }, [pathname, searchParams])
}

function PostHogPageviews() {
  usePageviews()
  return null
}

export default function PostHogProvider({ children }: { children: ReactNode }) {
  const initialized = useRef(false)

  useEffect(() => {
    if (getConsent() === 'granted' && !initialized.current) {
      initPostHog()
      initialized.current = true
    }

    function handleConsentChange() {
      const consent = getConsent()
      if (consent === 'granted' && !initialized.current) {
        initPostHog()
        initialized.current = true
      } else if (consent !== 'granted' && initialized.current) {
        shutdownPostHog()
        initialized.current = false
      }
    }

    window.addEventListener('guapd_consent_change', handleConsentChange)
    return () => window.removeEventListener('guapd_consent_change', handleConsentChange)
  }, [])

  return (
    <>
      {/*
        useSearchParams() must sit inside Suspense. This provider is mounted in
        the ROOT layout, so without the boundary every page in the app would be
        forced out of static rendering and the build would error on prerender.
      */}
      <Suspense fallback={null}>
        <PostHogPageviews />
      </Suspense>
      {children}
    </>
  )
}
