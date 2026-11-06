'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

/** The one-tap link to the Guapd AI search switch (Settings → Connected
 *  accounts). Used by this banner and by the WhatsApp / email ask. */
export const GUAPD_AI_OPT_IN_PATH = '/creator/settings?tab=connected#guapd-ai'

const DISMISS_KEY = 'guapd-ai-optin-dismissed'

/**
 * "Show up when brands search": on the creator home, until the creator switches
 * Guapd AI search on. Rendered only when CREATOR_SEARCH is on and they have not
 * opted in (decided on the server). Dismissible per browser; if storage is
 * unavailable it simply stays.
 */
export default function GuapdAiOptInBanner() {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    try { if (window.localStorage.getItem(DISMISS_KEY)) setHidden(true) } catch { /* storage blocked */ }
  }, [])
  if (hidden) return null

  const dismiss = () => {
    setHidden(true)
    try { window.localStorage.setItem(DISMISS_KEY, '1') } catch { /* storage blocked */ }
  }

  return (
    <section
      style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        borderRadius: 16, background: 'var(--card, #fff)',
        border: '1px solid rgba(160,190,40,.35)',
        boxShadow: '0 1px 2px rgba(24,28,36,.05), 0 18px 40px -28px rgba(24,28,36,.28)',
        padding: '16px clamp(16px, 2.4vw, 22px)', marginTop: 12,
      }}
    >
      <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--lime-50, #F6FCE6)', color: '#5F7A00' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" /><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" /></svg>
      </span>
      <div style={{ flex: '1 1 220px', minWidth: 0, fontFamily: 'var(--font-ui)' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>Get found by brands on Guapd AI</div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.45 }}>
          Brands describe the creators they want and we suggest matches. Switch it on to be suggested. Brands see your name, photo, city, niches and numbers, never your phone or email.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Link href={GUAPD_AI_OPT_IN_PATH} style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, padding: '9px 14px', borderRadius: 999, background: 'var(--ink)', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          Switch it on
        </Link>
        <button type="button" onClick={dismiss} aria-label="Dismiss" style={{ border: 0, background: 'none', color: 'var(--ink-faint)', fontSize: 18, cursor: 'pointer', padding: 6 }}>×</button>
      </div>
    </section>
  )
}
