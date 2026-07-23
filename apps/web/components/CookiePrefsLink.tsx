'use client'

export default function CookiePrefsLink() {
  return (
    <button
      onClick={() => {
        localStorage.removeItem('guapd_analytics_consent')
        window.dispatchEvent(new Event('guapd_consent_change'))
      }}
      className="footer__legal-link"
      style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit', padding: 0 }}
    >
      Cookie preferences
    </button>
  )
}
