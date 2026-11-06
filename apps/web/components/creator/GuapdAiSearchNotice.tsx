'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { dismissSearchNotice } from '@/app/creator/settings/actions'
import { BRANDS_NEVER_SEE, BRANDS_SEE, SEARCH_NOTICE } from '@/lib/ai/search-visibility-copy'

/** Link to the switch (Settings → Connected accounts), scrolled into view. */
export const GUAPD_AI_SWITCH_PATH = '/creator/settings?tab=connected&ai=1'

/**
 * One-time notice on the creator home: brands can now find you through Guapd
 * AI search, and where the switch is. Dismissed on the server
 * (creators.search_notice_dismissed_at), so it stays gone on every device.
 */
export default function GuapdAiSearchNotice() {
  const [hidden, setHidden] = useState(false)
  const [, start] = useTransition()
  if (hidden) return null
  const dismiss = () => { setHidden(true); start(async () => { await dismissSearchNotice() }) }

  return (
    <section role="status" style={card}>
      <span aria-hidden="true" style={chip}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" /><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" /></svg>
      </span>
      <div style={{ flex: '1 1 220px', minWidth: 0, fontFamily: 'var(--font-ui)' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{SEARCH_NOTICE.title}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.45 }}>{SEARCH_NOTICE.body} {SEARCH_NOTICE.settings}</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 4, lineHeight: 1.45 }}>Brands see {BRANDS_SEE}. They never see {BRANDS_NEVER_SEE}.</div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Link href={GUAPD_AI_SWITCH_PATH} style={btn}>{SEARCH_NOTICE.cta}</Link>
        <button type="button" onClick={dismiss} aria-label="Dismiss" style={{ border: 0, background: 'none', color: 'var(--ink-faint)', fontSize: 18, cursor: 'pointer', padding: 6 }}>×</button>
      </div>
    </section>
  )
}

const card: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderRadius: 16, background: 'var(--card, #fff)',
  border: '1px solid rgba(160,190,40,.35)', boxShadow: '0 1px 2px rgba(24,28,36,.05), 0 18px 40px -28px rgba(24,28,36,.28)',
  padding: '16px clamp(16px, 2.4vw, 22px)', marginTop: 12,
}
const chip: React.CSSProperties = { width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--lime-50, #F6FCE6)', color: '#5F7A00' }
const btn: React.CSSProperties = { fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, padding: '9px 14px', borderRadius: 999, background: 'var(--ink)', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }
