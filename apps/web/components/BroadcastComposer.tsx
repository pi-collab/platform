'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/**
 * One message to many creators (6.1 item 10). Used by a brand on a campaign
 * and by Guapd on an Experience. Each creator receives it in THEIR OWN deal
 * thread, as a normal message: nobody sees who else got it, and replies come
 * back one thread at a time. No money is ever part of it.
 */
export default function BroadcastComposer({ title, note, recipients, scopes, send }: {
  title: string
  note: string
  /** How many would receive it (per scope, when there is more than one). */
  recipients: Record<string, number>
  scopes?: { value: string; label: string }[]
  send: (body: string, scope: string) => Promise<{ ok: true; data: number } | { ok: false; error: string }>
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [scope, setScope] = useState(scopes?.[0]?.value ?? 'all')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<number | null>(null)
  const count = recipients[scope] ?? 0

  const submit = () => {
    setError(null); setSent(null)
    start(async () => {
      const r = await send(body, scope)
      if (!r.ok) { setError(r.error); return }
      setSent(r.data); setBody(''); setOpen(false); router.refresh()
    })
  }

  return (
    <div className="bc-wrap">
      <div className="bc-head">
        <div>
          <div className="bc-title">{title}</div>
          <div className="bc-note">{note}</div>
        </div>
        {!open && (
          <button type="button" className="bc-btn" disabled={count === 0} onClick={() => { setOpen(true); setSent(null) }}>
            Message all{count ? ` (${count})` : ''}
          </button>
        )}
      </div>
      {sent != null && <div role="status" className="bc-ok">Sent to {sent} creator{sent === 1 ? '' : 's'}, each in their own thread.</div>}
      {open && (
        <div className="bc-form">
          {scopes && scopes.length > 1 && (
            <div className="bc-seg" role="group" aria-label="Who gets it">
              {scopes.map((s) => (
                <button key={s.value} type="button" className={scope === s.value ? 'on' : ''} aria-pressed={scope === s.value} onClick={() => setScope(s.value)}>
                  {s.label} ({recipients[s.value] ?? 0})
                </button>
              ))}
            </div>
          )}
          <textarea className="dinput" rows={3} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message to all"
            placeholder="Call time moved to 10am. Bring two outfits." style={{ height: 'auto', padding: '10px 12px', lineHeight: 1.45 }} />
          <div className="bc-actions">
            <span className="bc-note">Goes to {count} creator{count === 1 ? '' : 's'} as a normal message in their own thread.</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="bc-ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</button>
              <button type="button" className="bc-btn" disabled={pending || !body.trim() || count === 0} onClick={submit}>{pending ? 'Sending…' : `Send to ${count}`}</button>
            </div>
          </div>
        </div>
      )}
      {error && <div role="alert" className="bc-err">{error}</div>}
      <style dangerouslySetInnerHTML={{ __html: `
        .bc-wrap { border: 1px solid var(--hairline, #EAEAE3); border-radius: 14px; padding: 12px 14px; background: #FBFBF8; }
        .bc-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .bc-title { font-family: var(--font-ui); font-weight: 700; font-size: 14px; color: var(--ink); }
        .bc-note { font-family: var(--font-ui); font-size: 12px; color: var(--ink-faint); margin-top: 2px; }
        .bc-btn { height: 36px; padding: 0 16px; border-radius: 999px; border: 0; background: var(--neon); color: var(--ink); font-family: var(--font-ui); font-weight: 700; font-size: 13px; cursor: pointer; }
        .bc-btn:disabled { opacity: .45; cursor: not-allowed; }
        .bc-ghost { height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--hairline, #EAEAE3); background: #fff; font-family: var(--font-ui); font-weight: 600; font-size: 13px; cursor: pointer; }
        .bc-form { margin-top: 12px; display: grid; gap: 10px; }
        .bc-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
        .bc-seg { display: inline-flex; border: 1px solid var(--hairline, #EAEAE3); border-radius: 10px; padding: 3px; background: #F2F2EC; width: fit-content; }
        .bc-seg button { height: 30px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; font-family: var(--font-ui); font-size: 12.5px; font-weight: 600; color: var(--ink-soft); cursor: pointer; }
        .bc-seg button.on { background: #fff; color: var(--ink); box-shadow: 0 1px 2px rgba(22,23,15,.08); }
        .bc-ok { margin-top: 10px; padding: 8px 12px; border-radius: 10px; background: #F4FBDC; font-family: var(--font-ui); font-size: 12.5px; }
        .bc-err { margin-top: 10px; padding: 8px 12px; border-radius: 10px; background: #FDECEC; color: #9C4147; font-family: var(--font-ui); font-size: 12.5px; }
      ` }} />
    </div>
  )
}
