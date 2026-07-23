'use client'

import { useEffect, useRef, ReactNode } from 'react'
import posthog from 'posthog-js'

function getConsent(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('guapd_analytics_consent')
}

function initPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
  if (!key || !host) return

  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    persistence: 'localStorage+cookie',
  })

  ;(window as any).__posthog = posthog
}

function shutdownPostHog() {
  if (posthog.__loaded) {
    posthog.opt_out_capturing()
    posthog.reset()
  }
  ;(window as any).__posthog = undefined
}

export function trackEvent(name: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  try {
    const ph = (window as any).__posthog
    if (ph?.capture) ph.capture(name, properties)
  } catch {}
}

export default function PostHogProvider({ children }: { children: ReactNode }) {
  const initialized = useRef(false)

  useEffect(() => {
    // Initialize based on current consent
    if (getConsent() === 'granted' && !initialized.current) {
      initPostHog()
      initialized.current = true
    }

    // Listen for consent changes
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
    return () => {
      window.removeEventListener('guapd_consent_change', handleConsentChange)
    }
  }, [])

  return <>{children}</>
}
