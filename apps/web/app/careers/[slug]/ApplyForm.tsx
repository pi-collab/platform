'use client'

import { useState } from 'react'
import { submitApplication } from '@/app/careers/actions'

/**
 * The application form.
 *
 * A client component because it holds submitting/success state and shows the
 * chosen filename — but the submit itself is a server action taking FormData,
 * so the file never round-trips through JSON and the validation that matters
 * runs on the server.
 */
export default function ApplyForm({ slug, title }: { slug: string; title: string }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')

  if (done) {
    return (
      <div style={doneStyle} role="status">
        <p style={{ margin: 0, fontWeight: 700, color: 'var(--ink)' }}>Application received.</p>
        <p style={{ margin: '8px 0 0' }}>
          Thanks for applying for {title}. If it looks like a fit we will be in touch by email.
        </p>
      </div>
    )
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const data = new FormData(e.currentTarget)
    data.set('role', slug)
    try {
      const res = await submitApplication(data)
      if (res.status === 'ok') setDone(true)
      else setError(res.message)
    } catch {
      // A network failure or a payload the platform rejected outright. The
      // generic line is deliberate: the specifics are in the server log and
      // would mean nothing to an applicant.
      setError('Something went wrong sending that. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} style={formStyle}>
      <label style={labelStyle}>
        Your name
        <input name="name" required maxLength={120} style={inputStyle} placeholder="Priya Sharma" />
      </label>

      <label style={labelStyle}>
        Email
        <input name="email" type="email" required style={inputStyle} placeholder="you@example.com" />
      </label>

      <label style={labelStyle}>
        Phone <span style={optionalStyle}>(optional)</span>
        <input name="phone" type="tel" maxLength={32} style={inputStyle} placeholder="+91 98765 43210" />
      </label>

      <label style={labelStyle}>
        Anything you want us to know <span style={optionalStyle}>(optional)</span>
        <textarea name="note" rows={5} maxLength={4000} style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="A link to something you have built, or why this role." />
      </label>

      <label style={labelStyle}>
        CV
        <input
          name="resume"
          type="file"
          required
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
          style={{ ...inputStyle, padding: '10px 12px' }}
        />
        <span style={hintStyle}>
          {fileName ? `Selected: ${fileName}` : 'PDF or Word, up to 4 MB.'}
        </span>
      </label>

      {error && <p style={errorStyle} role="alert">{error}</p>}

      <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Sending…' : 'Submit application'}
      </button>
    </form>
  )
}

const formStyle: React.CSSProperties = { display: 'grid', gap: 18, maxWidth: 520 }
const labelStyle: React.CSSProperties = {
  display: 'grid', gap: 6, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)',
}
const optionalStyle: React.CSSProperties = { fontWeight: 500, color: 'var(--ink-faint)' }
const inputStyle: React.CSSProperties = {
  // 16px: anything smaller and Safari zooms the page when the field is focused.
  fontSize: 16, fontFamily: 'var(--font-ui)', fontWeight: 400, color: 'var(--ink)',
  padding: '12px 14px', borderRadius: 10,
  border: '1px solid var(--hairline, rgba(24,28,36,.18))', background: '#fff',
}
const hintStyle: React.CSSProperties = { fontSize: 12.5, fontWeight: 500, color: 'var(--ink-faint)' }
const errorStyle: React.CSSProperties = {
  margin: 0, padding: '10px 12px', borderRadius: 10, fontSize: 13.5,
  background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5',
}
const buttonStyle: React.CSSProperties = {
  justifySelf: 'start', padding: '13px 26px', borderRadius: 999, border: 'none',
  background: 'var(--ink)', color: '#fff', fontFamily: 'var(--font-ui)',
  fontWeight: 700, fontSize: 14, cursor: 'pointer',
}
const doneStyle: React.CSSProperties = {
  padding: '20px 22px', borderRadius: 14, fontSize: 15,
  border: '1px solid var(--hairline, rgba(24,28,36,.12))', background: '#F7FAF0',
}
