'use client'

export default function CookiePrefsLink() {
  return (
    <button
      onClick={() => {
        localStorage.removeItem('guapd_analytics_consent')
        window.dispatchEvent(new Event('guapd_consent_change'))
        // Hard reload. posthog-js cannot fully unload itself in-page — opt_out
        // + reset stop capture, but the SDK, its listeners and any in-flight
        // session recording stay resident until the document is torn down.
        // Under DPDP a withdrawal of consent has to take effect immediately,
        // not "mostly, until you navigate", so force it.
        window.location.reload()
      }}
      className="footer__legal-link"
      style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit', padding: 0 }}
    >
      Cookie preferences
    </button>
  )
}
