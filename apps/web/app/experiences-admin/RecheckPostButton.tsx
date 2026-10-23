'use client'

import { useState, useTransition } from 'react'
import { recheckPostNumbers } from './actions'

/** 0577: ask for a collab post's numbers to be read again from Instagram. */
export default function RecheckPostButton({ experienceId, dealId, postId }: { experienceId: string; dealId: string; postId: string }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button type="button" disabled={pending}
        onClick={() => start(async () => { setMsg(null); const r = await recheckPostNumbers(experienceId, dealId, postId); setMsg(r.ok ? 'Checked' : (r.error ?? 'Could not re-check')) })}
        style={{ border: '1px solid var(--line, rgba(18,21,28,.14))', background: '#fff', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 700, color: 'var(--ink)', cursor: pending ? 'default' : 'pointer' }}>
        {pending ? 'Checking…' : 'Re-check numbers'}
      </button>
      {msg && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{msg}</span>}
    </span>
  )
}
