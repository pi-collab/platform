'use client'

import { useState } from 'react'
import { saveUpiId } from './upi-actions'

/**
 * The payout destination row.
 *
 * The export draws this as static text — "UPI · utkarsh@upi · verified". Here
 * it is the control for setting it, because a creator with no UPI ID has no way
 * to be paid and the payments screen is where they will look for it.
 *
 * It does NOT say "verified". Verifying a UPI ID means a penny-drop through a
 * payment aggregator, which v1 deliberately stays out of — so the word would be
 * a lie in the one place a creator most needs the truth about their money.
 */
export default function UpiRow({ initialUpiId }: { initialUpiId: string | null }) {
  const [saved, setSaved] = useState(initialUpiId)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialUpiId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const res = await saveUpiId(value)
    setBusy(false)
    if (!res.ok) {
      setError(res.message)
      return
    }
    setSaved(res.upiId)
    setValue(res.upiId)
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="sr msurface" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', minWidth: 0, overflowWrap: 'anywhere' }}>
            {saved ? (
              <>
                UPI &middot; {saved} &middot;{' '}
                {/* Stated plainly rather than dressed up. A creator who thinks
                    this was checked will not check it themselves. */}
                <span style={{ color: 'var(--wg-400)' }}>not verified yet</span>
              </>
            ) : (
              'No payout method yet'
            )}
          </span>

          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              flexShrink: 0,
              padding: '7px 14px',
              borderRadius: 999,
              border: '1px solid var(--line)',
              background: '#fff',
              fontFamily: 'var(--font-ui)',
              fontSize: 11.5,
              fontWeight: 600,
              color: 'var(--ink)',
              cursor: 'pointer',
            }}
          >
            {saved ? 'Change' : 'Add UPI ID'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="sr msurface" style={{ padding: '18px 20px' }} onSubmit={submit}>
      <label
        htmlFor="upi-id"
        style={{
          display: 'block',
          fontSize: 11.5,
          fontWeight: 600,
          color: 'var(--ink)',
          marginBottom: 8,
        }}
      >
        Your UPI ID
      </label>

      <input
        id="upi-id"
        value={value}
        onChange={(e) => { setValue(e.target.value); setError('') }}
        placeholder="yourname@bank"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode="email"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          // 16px: anything smaller and Safari zooms the page on focus.
          fontSize: 16,
          fontFamily: 'var(--font-ui)',
          color: 'var(--ink)',
          padding: '11px 13px',
          borderRadius: 10,
          border: `1px solid ${error ? '#E5484D' : 'var(--line)'}`,
          background: '#fff',
        }}
      />

      {error && (
        <p role="alert" style={{ margin: '8px 0 0', fontSize: 12, color: '#B4262A' }}>
          {error}
        </p>
      )}

      <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--wg-400)', lineHeight: 1.5 }}>
        This is where your payouts are sent. Check it carefully: money sent to a
        wrong UPI ID cannot be recovered.
      </p>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: '9px 18px',
            borderRadius: 999,
            border: 'none',
            background: 'var(--ink)',
            color: '#fff',
            fontFamily: 'var(--font-ui)',
            fontWeight: 700,
            fontSize: 12.5,
            cursor: 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>

        <button
          type="button"
          onClick={() => { setEditing(false); setValue(saved ?? ''); setError('') }}
          style={{
            padding: '9px 18px',
            borderRadius: 999,
            border: '1px solid var(--line)',
            background: '#fff',
            fontFamily: 'var(--font-ui)',
            fontWeight: 600,
            fontSize: 12.5,
            color: 'var(--ink)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
