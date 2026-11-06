'use client'

import { useState, useTransition } from 'react'
import { setSearchVisible } from './actions'
import { BRANDS_NEVER_SEE, BRANDS_SEE, SEARCH_SWITCH, SWITCH_OFF_CONFIRM } from '@/lib/ai/search-visibility-copy'

/**
 * "Show me in Guapd AI search": on by default. Turning it ON saves at once;
 * turning it OFF first asks, with "Keep me visible" as the default, because
 * the creator should see what they lose before they lose it.
 */
export default function SearchVisibility({ hiddenAt }: { hiddenAt: string | null }) {
  const [on, setOn] = useState(hiddenAt === null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const save = (visible: boolean) => {
    setOn(visible); setError(null); setConfirming(false)
    start(async () => {
      const res = await setSearchVisible(visible)
      if (res.error) { setOn(!visible); setError(res.error) }
    })
  }

  return (
    <div style={{ marginTop: 22, paddingTop: 22, borderTop: '1px solid var(--border-hairline)' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14 }}>{SEARCH_SWITCH.label}</div>
          <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.5 }}>{SEARCH_SWITCH.hint}</p>
          <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
            <strong style={{ fontWeight: 600 }}>Brands see:</strong> {BRANDS_SEE}.
            <br />
            <strong style={{ fontWeight: 600 }}>Brands never see:</strong> {BRANDS_NEVER_SEE}.
          </p>
          {error && <p role="alert" style={{ margin: '6px 0 0', fontSize: 12.5, color: '#9A2B2B' }}>{error}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={SEARCH_SWITCH.label}
          disabled={pending || confirming}
          onClick={() => (on ? setConfirming(true) : save(true))}
          style={{
            flex: 'none', width: 46, height: 28, borderRadius: 999, border: 0, padding: 3, cursor: 'pointer',
            background: on ? 'var(--ink)' : 'var(--border-hairline)', transition: 'background 160ms',
            display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
          }}
        >
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: on ? 'var(--lime)' : '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </button>
      </div>

      {confirming && (
        <div role="alertdialog" aria-labelledby="gai-off-title" aria-describedby="gai-off-body"
          style={{ marginTop: 14, padding: 16, borderRadius: 14, border: '1px solid rgba(216,154,46,.35)', background: 'var(--card, #fff)', fontFamily: 'var(--font-ui)' }}>
          <div id="gai-off-title" style={{ fontWeight: 700, fontSize: 14 }}>{SWITCH_OFF_CONFIRM.title}</div>
          <p id="gai-off-body" style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-soft)' }}>{SWITCH_OFF_CONFIRM.body}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" autoFocus onClick={() => setConfirming(false)}
              style={{ border: 0, borderRadius: 999, padding: '9px 16px', background: 'var(--ink)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
              {SWITCH_OFF_CONFIRM.keep}
            </button>
            <button type="button" onClick={() => save(false)}
              style={{ border: '1px solid var(--border-hairline)', borderRadius: 999, padding: '9px 16px', background: 'var(--card, #fff)', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>
              {SWITCH_OFF_CONFIRM.off}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
