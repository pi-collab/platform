'use client'

import { useState, useTransition } from 'react'
import { previewBroadcast, sendBroadcast, type BroadcastPreview } from './actions'
import type { BroadcastAudience } from '@/lib/creator-broadcast'

const AUDIENCES: { id: BroadcastAudience; label: string }[] = [
  { id: 'deals', label: 'Creators in deals (vetted)' },
  { id: 'growth', label: 'Growth creators' },
  { id: 'all_vetted', label: 'Both' },
]

const SKIP_LABEL: Record<string, string> = {
  no_phone: 'no phone number',
  opted_out: 'turned WhatsApp off',
  already_sent: 'already sent this campaign',
}

export default function BroadcastClient() {
  const [template, setTemplate] = useState('storefront_update')
  const [campaignId, setCampaignId] = useState('')
  const [audience, setAudience] = useState<BroadcastAudience>('deals')
  const [buttonValue, setButtonValue] = useState('')
  const [preview, setPreview] = useState<BroadcastPreview | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  /* Typed back, not a checkbox. A checkbox next to a button that messages the
     whole roster is one mis-click; typing the count is a deliberate act. */
  const [confirm, setConfirm] = useState('')
  const [pending, start] = useTransition()

  const input = { template, campaignId, audience, buttonValue: buttonValue.trim() || undefined }

  function doPreview() {
    setMsg(null); setPreview(null); setConfirm('')
    start(async () => {
      const r = await previewBroadcast(input)
      if ('error' in r) { setMsg({ kind: 'err', text: r.error }); return }
      setPreview(r)
    })
  }

  function doSend() {
    if (!preview) return
    setMsg(null)
    start(async () => {
      const r = await sendBroadcast(input)
      if ('error' in r) { setMsg({ kind: 'err', text: r.error }); return }
      setMsg({ kind: r.ok ? 'ok' : 'err', text: r.message })
      setConfirm('')
      const again = await previewBroadcast(input)
      if (!('error' in again)) setPreview(again)
    })
  }

  const count = preview?.sendable.length ?? 0
  const armed = !!preview && count > 0 && !preview.overCap && confirm.trim() === String(count)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <label style={label}>MSG91 template name
        <input style={inp} value={template} onChange={(e) => setTemplate(e.target.value)} placeholder="storefront_update" />
      </label>

      <label style={label}>Campaign id
        <input style={inp} value={campaignId} onChange={(e) => setCampaignId(e.target.value)} placeholder="storefront-update-2026-09" />
        <span style={hint}>Identifies this run. Re-running with the same id skips anyone who already got it.</span>
      </label>

      <label style={label}>Audience
        <select style={inp} value={audience} onChange={(e) => setAudience(e.target.value as BroadcastAudience)}>
          {AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </label>

      <label style={label}>Button suffix (optional)
        <input style={inp} value={buttonValue} onChange={(e) => setButtonValue(e.target.value)} placeholder="leave empty for a static button" />
        <span style={hint}>
          Only if the template declares a DYNAMIC url button. Sending a value for a static
          button is rejected outright &mdash; that is what broke two status_update sends.
        </span>
      </label>

      <div>
        <button onClick={doPreview} disabled={pending || !campaignId.trim()} style={btn}>
          {pending ? 'Working…' : 'Preview recipients'}
        </button>
      </div>

      {preview && (
        <div style={card}>
          <strong style={{ fontSize: '1.05rem' }}>
            {count} {count === 1 ? 'creator' : 'creators'} would receive this
          </strong>
          {preview.overCap && (
            <p style={{ color: '#b91c1c', margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
              Over the {preview.cap} per-send cap. Narrow the audience.
            </p>
          )}
          <ul style={list}>
            {preview.sendable.map((r) => (
              <li key={r.creatorId}>{r.fullName} <span style={{ color: '#6b7280' }}>&rarr; {r.firstName}</span></li>
            ))}
          </ul>

          {preview.skipped.length > 0 && (
            <>
              <div style={{ marginTop: '1rem', fontWeight: 600, fontSize: '0.9rem' }}>
                {preview.skipped.length} skipped
              </div>
              <ul style={{ ...list, color: '#6b7280' }}>
                {preview.skipped.map((r) => (
                  <li key={r.creatorId}>{r.fullName} &mdash; {SKIP_LABEL[r.skip ?? ''] ?? r.skip}</li>
                ))}
              </ul>
            </>
          )}

          {count > 0 && !preview.overCap && (
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <label style={label}>Type <strong>{count}</strong> to confirm
                <input style={{ ...inp, maxWidth: 120 }} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </label>
              <button onClick={doSend} disabled={!armed || pending} style={{ ...btn, background: armed ? '#dc2626' : '#d1d5db', marginTop: '0.75rem' }}>
                {pending ? 'Sending…' : `Send to ${count}`}
              </button>
            </div>
          )}
        </div>
      )}

      {msg && (
        <p style={{ color: msg.kind === 'ok' ? '#15803d' : '#b91c1c', fontWeight: 600 }}>{msg.text}</p>
      )}
    </div>
  )
}

const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 600, color: '#374151' }
const inp: React.CSSProperties = { padding: '0.5rem 0.65rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.9rem', fontWeight: 400, maxWidth: 420 }
const hint: React.CSSProperties = { fontWeight: 400, fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.5, maxWidth: 420 }
const btn: React.CSSProperties = { padding: '0.55rem 1.1rem', borderRadius: 6, border: 'none', background: '#111827', color: '#fff', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }
const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: '1rem 1.25rem', background: '#fafafa' }
const list: React.CSSProperties = { margin: '0.5rem 0 0', paddingLeft: '1.1rem', fontSize: '0.85rem', lineHeight: 1.7 }
