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
      // Styled as one of the footer links beside it; app/footer.css carries a
      // button.gf-link rule that strips the native button chrome.
      className="gf-link"
    >
      Cookie preferences
    </button>
  )
}
