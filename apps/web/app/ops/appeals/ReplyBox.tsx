'use client'

import { useState } from 'react'
import { replyToAppeal } from './actions'

/**
 * Reply to one appeal.
 *
 * The templates are STARTING POINTS that land in an editable box, not canned
 * sends. Someone has written to ask us to reconsider rejecting them; a reply
 * that is visibly a form letter is worse than a short one that is visibly
 * written. So there is no "send template" button — picking one fills the box and
 * the cursor is left in it.
 *
 * Each template names the actual reason, because "you were not a fit" tells a
 * creator nothing they can act on, and the follow-up question it produces lands
 * back in this same queue.
 */
const TEMPLATES: { key: string; label: string; subject: string; body: (name: string) => string }[] = [
  {
    key: 'followers',
    label: 'Audience too small',
    subject: 'About your Guapd application',
    body: () =>
      `Thanks for writing back, and for asking us to look again.\n\n` +
      `The reason we could not approve the account yet is audience size. Brands booking through Guapd are currently looking for creators with a larger following, so we would not have deals to send you at the moment, and we would rather say that than have you waiting on an empty inbox.\n\n` +
      `This is not a permanent no. Come back to us when your following has grown and we will review it again, and there is no limit on how many times you can reapply.`,
  },
  {
    key: 'engagement',
    label: 'Engagement too low',
    subject: 'About your Guapd application',
    body: () =>
      `Thanks for writing back, and for asking us to look again.\n\n` +
      `We reviewed the account again. The follower count is in range, but the engagement on recent posts is lower than the brands booking through us are looking for, and that is the number they price against rather than followers alone.\n\n` +
      `This is worth reapplying for. If your recent posts start seeing stronger comments and saves, send us another application and we will take a fresh look.`,
  },
  {
    key: 'reconsidered',
    label: 'Decision reversed',
    subject: 'Good news about your Guapd account',
    body: () =>
      `Thanks for writing back, and for the extra context.\n\n` +
      `We have looked at your account again and reversed the decision. You are approved, and you can sign in and set up your shopfront now.\n\n` +
      `Sorry for the back and forth, and thanks for pushing us to take another look.`,
  },
  {
    key: 'custom',
    label: 'Write from scratch',
    subject: 'About your Guapd application',
    body: () => '',
  },
]

export default function ReplyBox({ creatorId, creatorName }: {
  creatorId: string
  creatorName: string
}) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('About your Guapd application')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const firstName = creatorName.split(' ')[0] || 'there'

  function applyTemplate(key: string) {
    const t = TEMPLATES.find((x) => x.key === key)
    if (!t) return
    setSubject(t.subject)
    setMessage(t.body(firstName))
    setMsg(null)
  }

  async function send() {
    setBusy(true)
    setMsg(null)
    const res = await replyToAppeal(creatorId, subject, message)
    setBusy(false)
    if (res.ok) {
      setMsg({ ok: true, text: 'Sent.' })
      setMessage('')
      // Left open on purpose: the confirmation is inside this box, and closing
      // it would hide the only thing saying the send worked.
    } else {
      setMsg({ ok: false, text: res.message })
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          marginTop: '0.7rem', padding: '0.3rem 0.7rem', borderRadius: 6,
          border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer',
          fontSize: '0.8125rem', fontWeight: 600, color: '#111',
        }}
      >
        Reply by email
      </button>
    )
  }

  return (
    <div style={{ marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid #f0f0f0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.6rem' }}>
        {TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => applyTemplate(t.key)}
            style={{
              padding: '0.25rem 0.6rem', borderRadius: 999,
              border: '1px solid #e5e7eb', background: '#fafafa', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 600, color: '#374151',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        aria-label="Subject"
        style={{ width: '100%', padding: '0.4rem 0.55rem', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: '0.8125rem', marginBottom: '0.5rem' }}
      />

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={8}
        placeholder={`Write to ${firstName}, or pick a starting point above.`}
        aria-label="Message"
        style={{ width: '100%', padding: '0.55rem', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: '0.8125rem', lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit' }}
      />

      <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
        Sends from the Guapd account address. They see &ldquo;Hi {firstName},&rdquo; above your message.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.6rem' }}>
        <button
          type="button"
          onClick={send}
          disabled={busy || !message.trim() || !subject.trim()}
          style={{
            padding: '0.35rem 0.85rem', borderRadius: 6, border: '1px solid #111',
            background: '#111', color: '#fff', fontWeight: 600, fontSize: '0.8125rem',
            cursor: busy || !message.trim() ? 'default' : 'pointer',
            opacity: busy || !message.trim() || !subject.trim() ? 0.5 : 1,
          }}
        >
          {busy ? 'Sending…' : 'Send reply'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setMsg(null) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: '#6b7280' }}
        >
          Cancel
        </button>
        {msg && (
          <span style={{ fontSize: '0.8125rem', color: msg.ok ? '#166534' : '#b91c1c' }} role="status">
            {msg.text}
          </span>
        )}
      </div>
    </div>
  )
}
