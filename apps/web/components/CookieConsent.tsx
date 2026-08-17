'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)
  const bar = useRef<HTMLDivElement>(null)

  /**
   * Publish the bar's height as --consent-bar-h so full-height screens can lay
   * out above it.
   *
   * The bar is position:fixed, so it covers content without adding any page
   * height — a screen can measure as fitting perfectly while its buttons sit
   * underneath and cannot be tapped. That is exactly what happened on the
   * offer page, on a first visit, which is every creator arriving from a
   * WhatsApp link. Measured rather than hard-coded because the height depends
   * on how the copy wraps at a given width.
   */
  useEffect(() => {
    const el = bar.current
    const root = document.documentElement
    if (!visible || !el) { root.style.removeProperty('--consent-bar-h'); return }

    const publish = () => root.style.setProperty(
      '--consent-bar-h', `${Math.ceil(el.getBoundingClientRect().height)}px`)
    publish()

    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => { ro.disconnect(); root.style.removeProperty('--consent-bar-h') }
  }, [visible])

  useEffect(() => {
    const consent = localStorage.getItem('guapd_analytics_consent')
    if (!consent) setVisible(true)

    function handleConsentChange() {
      const current = localStorage.getItem('guapd_analytics_consent')
      if (!current) {
        setVisible(true)
      }
    }

    window.addEventListener('guapd_consent_change', handleConsentChange)
    return () => {
      window.removeEventListener('guapd_consent_change', handleConsentChange)
    }
  }, [])

  function handleAccept() {
    localStorage.setItem('guapd_analytics_consent', 'granted')
    window.dispatchEvent(new Event('guapd_consent_change'))
    setVisible(false)
  }

  function handleDecline() {
    localStorage.setItem('guapd_analytics_consent', 'denied')
    window.dispatchEvent(new Event('guapd_consent_change'))
    setVisible(false)
    // If PostHog was running from a previous 'granted' choice, a hard reload
    // is the only way to fully unload it — see CookiePrefsLink. Declining from
    // a clean first visit never initialised it, so nothing to tear down.
    if ((window as unknown as { __posthog?: unknown }).__posthog) {
      window.location.reload()
    }
  }

  if (!visible) return null

  return (
    <div ref={bar} className="cookie-bar" role="region" aria-label="Cookie consent">
      {/* Two phrasings of the same disclosure. The full sentence wraps to
          three lines on a phone, which pushed the bar to ~119px and left it
          covering the offer page's own buttons; the short form says the same
          two things (essential cookies, analytics only by consent) in one. */}
      <p className="cookie-bar__text">
        <span className="cookie-bar__long">
          We use cookies to keep you signed in (essential) and, with your consent, to understand
          how the platform is used (analytics).
        </span>
        <span className="cookie-bar__short">
          Cookies keep you signed in. Analytics only with your consent.
        </span>{' '}
        <Link href="/privacy" className="cookie-bar__link">
          Privacy Policy
        </Link>
      </p>
      <div className="cookie-bar__actions">
        <button onClick={handleAccept} className="cookie-bar__btn cookie-bar__btn--accept">
          Accept analytics
        </button>
        {/* "Only essential", not "Decline". On the offer page this bar sits
            directly beneath the offer's own Decline button, and two adjacent
            buttons reading the same word — one refusing analytics, one
            refusing a paid deal — is a mis-tap waiting to happen. */}
        <button onClick={handleDecline} className="cookie-bar__btn">
          Only essential
        </button>
      </div>
    </div>
  )
}
