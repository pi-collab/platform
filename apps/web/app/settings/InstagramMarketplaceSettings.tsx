'use client'

import { useState } from 'react'
import { trackEvent } from '@/lib/analytics'
import { ELIGIBILITY_TEXT, type MetaEligibilityState } from '@/lib/meta/eligibility-copy'

/**
 * Settings → Instagram (only when Creator Marketplace is on in this
 * environment): the connection and why it cannot be used, if Meta said so.
 * The explanation lives here so /ai does not keep prompting.
 */
export interface InstagramSettingsState {
  connected: boolean
  needsReconnect: boolean
  igUsername: string | null
  pageName: string | null
  eligibility: MetaEligibilityState | null
}

export default function InstagramMarketplaceSettings({ state }: { state: InstagramSettingsState }) {
  const [gone, setGone] = useState(false)
  const [busy, setBusy] = useState(false)
  const connected = state.connected && !gone
  const disconnect = async () => {
    setBusy(true)
    const res = await fetch('/api/meta/disconnect', { method: 'POST' }).catch(() => null)
    setBusy(false)
    if (res?.ok) setGone(true)
  }
  const status = connected ? (state.eligibility === 'not_eligible' ? 'Connected, not eligible' : 'Connected')
    : state.needsReconnect && !gone ? 'Needs reconnecting' : state.eligibility ? 'Not connected' : 'Not connected'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18, fontFamily: 'var(--font-ui)' }}>
      <div style={{ fontSize: 13.5 }}><strong>Status:</strong> {status}{connected && state.igUsername ? ` · @${state.igUsername}` : ''}{connected && state.pageName ? ` (Page: ${state.pageName})` : ''}</div>
      {state.eligibility && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>{ELIGIBILITY_TEXT[state.eligibility]}</p>}
      {!state.eligibility && !connected && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
          Optional. Connecting also searches Instagram&apos;s Creator Marketplace from Guapd AI. It needs a Facebook Page linked to your Instagram business account, and Instagram decides which accounts are eligible.
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(!connected || state.eligibility) && (
          <a href="/api/meta/connect" onClick={() => trackEvent('ai_connect_clicked', { from: 'settings' })}
            style={{ textDecoration: 'none', borderRadius: 999, padding: '9px 16px', background: 'var(--ink)', color: '#fff', fontWeight: 700, fontSize: 13 }}>
            {state.eligibility ? 'Try again' : state.needsReconnect ? 'Reconnect' : 'Connect Instagram'}
          </a>
        )}
        {connected && (
          <button type="button" disabled={busy} onClick={disconnect}
            style={{ borderRadius: 999, padding: '9px 16px', background: 'var(--card)', border: '1px solid var(--border-hairline)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Disconnect
          </button>
        )}
      </div>
    </div>
  )
}
