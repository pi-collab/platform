'use client'

import Link from 'next/link'
import { useState } from 'react'
import { trackEvent } from '@/lib/analytics'

/**
 * "New: Guapd AI" pointing at the sparkle icon, on the brand home only.
 * Shown once per brand USER: dismissing it, or opening Guapd AI (the icon, or
 * "Try it"), records that on the server (brand_user_ai_onboarding), so it does
 * not come back on another device. Says only that Guapd AI finds creators.
 */
export const AI_HIGHLIGHT_TEXT = 'New: Guapd AI. Describe the creators you want and get matches in seconds.'

export default function AiHighlight({ align = 'right' }: { align?: 'right' | 'center' }) {
  const [open, setOpen] = useState(true)
  if (!open) return null
  const done = () => fetch('/api/ai/onboarding', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: 'highlight' }) }).catch(() => {})
  return (
    <div role="dialog" aria-label="New: Guapd AI" className="ai-highlight" style={{
      position: 'absolute', top: 'calc(100% + 10px)', ...(align === 'right' ? { right: -8 } : { left: '50%', transform: 'translateX(-50%)' }),
      width: 260, zIndex: 300, background: '#1A1B16', color: '#fff', borderRadius: 14, padding: '12px 14px',
      boxShadow: '0 18px 40px -16px rgba(24,28,36,.45)', fontFamily: 'var(--font-ui)', textAlign: 'left',
    }}>
      <span aria-hidden="true" style={{ position: 'absolute', top: -6, ...(align === 'right' ? { right: 20 } : { left: 'calc(50% - 6px)' }), width: 12, height: 12, background: '#1A1B16', transform: 'rotate(45deg)', borderRadius: 2 }} />
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45 }}>{AI_HIGHLIGHT_TEXT}</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <Link href="/ai" onClick={() => { trackEvent('ai_highlight_clicked'); done() }} style={{ background: 'var(--lime, #E8FF66)', color: '#1A1B16', fontWeight: 700, fontSize: 13, padding: '7px 12px', borderRadius: 999, textDecoration: 'none' }}>Try it</Link>
        <button type="button" onClick={() => { setOpen(false); done() }} style={{ border: 0, background: 'none', color: 'rgba(255,255,255,.75)', fontSize: 13, cursor: 'pointer', padding: '6px 4px' }}>Not now</button>
      </div>
    </div>
  )
}
