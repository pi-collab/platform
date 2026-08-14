'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

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
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#181C24',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        flexWrap: 'wrap',
        fontFamily: 'var(--font-inter), system-ui, sans-serif',
        fontSize: '14px',
        color: 'rgba(255,255,255,0.8)',
      }}
    >
      <p style={{ margin: 0, maxWidth: '600px', lineHeight: 1.5 }}>
        We use cookies to keep you signed in (essential) and, with your consent, to understand how
        the platform is used (analytics).{' '}
        <Link
          href="/privacy"
          style={{ color: '#DAFE0C', textDecoration: 'underline' }}
        >
          Privacy Policy
        </Link>
      </p>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={handleAccept}
          style={{
            background: '#DAFE0C',
            color: '#181C24',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 16px',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Accept analytics
        </button>
        <button
          onClick={handleDecline}
          style={{
            background: 'transparent',
            color: 'rgba(255,255,255,0.8)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '8px',
            padding: '8px 16px',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Decline
        </button>
      </div>
    </div>
  )
}
