'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Role } from '@/lib/careers'
import { createRole, updateRole } from './actions'

/**
 * Create/edit a job role.
 *
 * The three list fields are textareas, one item per line, rather than a
 * repeater with add/remove buttons. Editing a job description is writing, and
 * writing in a textarea beats managing a list of inputs.
 */
export default function RoleForm({ role }: { role?: Role }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    const data = new FormData(e.currentTarget)
    const res = role ? await updateRole(role.id, data) : await createRole(data)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    router.push('/ops/careers')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14, maxWidth: 720 }}>
      <Field label="Title" hint="Shown as the heading on the role page.">
        <input name="title" required defaultValue={role?.title} style={input} placeholder="Founding Engineer" />
      </Field>

      <Field label="URL slug" hint="Left blank, this is built from the title. Changing it breaks any link already shared.">
        <input name="slug" defaultValue={role?.slug} style={input} placeholder="founding-engineer" />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
        <Field label="Team"><input name="team" defaultValue={role?.team} style={input} placeholder="Engineering" /></Field>
        <Field label="Location"><input name="location" defaultValue={role?.location} style={input} placeholder="Delhi NCR / Remote" /></Field>
        <Field label="Type"><input name="employment_type" defaultValue={role?.employmentType ?? 'Full-time'} style={input} /></Field>
      </div>

      <Field label="Summary" hint="One line, shown under the title on the careers list.">
        <input name="summary" defaultValue={role?.summary} style={input} />
      </Field>

      <Field label="About" hint="One paragraph per line.">
        <textarea name="about" rows={4} defaultValue={role?.about.join('\n')} style={{ ...input, resize: 'vertical' }} />
      </Field>

      <Field label="What you will do" hint="One bullet per line.">
        <textarea name="responsibilities" rows={5} defaultValue={role?.responsibilities.join('\n')} style={{ ...input, resize: 'vertical' }} />
      </Field>

      <Field label="What we are looking for" hint="One bullet per line.">
        <textarea name="requirements" rows={5} defaultValue={role?.requirements.join('\n')} style={{ ...input, resize: 'vertical' }} />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
        <Field label="Sort order" hint="Lower sorts first.">
          <input name="sort_order" type="number" defaultValue={role?.sortOrder ?? 100} style={input} />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, alignSelf: 'end', paddingBottom: 10 }}>
          <input type="checkbox" name="is_published" value="yes" defaultChecked={role?.isPublished} />
          Published (visible on the site)
        </label>
      </div>

      {error && <p style={errorBox} role="alert">{error}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" disabled={busy} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Saving…' : role ? 'Save changes' : 'Create role'}
        </button>
        <button type="button" onClick={() => router.push('/ops/careers')} style={ghost}>Cancel</button>
      </div>
    </form>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600, color: '#111' }}>
      {label}
      {children}
      {hint && <span style={{ fontWeight: 400, fontSize: 12, color: '#888' }}>{hint}</span>}
    </label>
  )
}

const input: React.CSSProperties = {
  fontSize: 14, fontFamily: 'inherit', padding: '9px 11px', borderRadius: 6,
  border: '1px solid #d4d4d8', width: '100%', color: '#111',
}
const primary: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 6, border: 'none', background: '#111',
  color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
}
const ghost: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 6, border: '1px solid #d4d4d8',
  background: '#fff', color: '#111', fontWeight: 600, fontSize: 14, cursor: 'pointer',
}
const errorBox: React.CSSProperties = {
  margin: 0, padding: '9px 12px', borderRadius: 6, fontSize: 13,
  background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5',
}
