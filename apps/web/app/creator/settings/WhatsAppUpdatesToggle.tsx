'use client'

import { useState, useTransition } from 'react'
import { setWhatsAppUpdates } from './actions'

/** "Product updates on WhatsApp": optional, off unless the creator ticked it.
 *  Deal notifications and login codes are separate and not affected. */
export default function WhatsAppUpdatesToggle({ consentAt }: { consentAt: string | null }) {
  const [on, setOn] = useState(consentAt !== null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-hairline)', fontFamily: 'var(--font-ui)' }}>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="checkbox" checked={on} disabled={pending} style={{ marginTop: 3 }}
          onChange={(e) => {
            const next = e.target.checked
            setOn(next); setError(null)
            start(async () => { const r = await setWhatsAppUpdates(next); if (r.error) { setOn(!next); setError(r.error) } })
          }} />
        <span>
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>Product updates on WhatsApp</span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 2 }}>Optional. New features and tips, now and then. Your deal messages and login codes are separate and not affected.</span>
        </span>
      </label>
      {error && <p role="alert" style={{ margin: '6px 0 0', fontSize: 12.5, color: '#9A2B2B' }}>{error}</p>}
    </div>
  )
}
