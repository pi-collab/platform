'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Role, ApplicationQuestion } from '@/lib/careers'
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

  // Questions are the one repeater on this form — an ordered list with a
  // per-item toggle cannot be a textarea. Held in state and serialised into the
  // FormData on submit, so the surrounding form stays a plain post and both
  // actions keep a single input shape.
  const [questions, setQuestions] = useState<ApplicationQuestion[]>(role?.questions ?? [])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    const data = new FormData(e.currentTarget)
    data.set('application_questions', JSON.stringify(questions))
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

      <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Application questions</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: -4 }}>
          Asked on this role&apos;s application form, in this order, each answered in a text box.
          Every applicant already gives their name, email and CV. These are on top of that.
        </div>

        {questions.length === 0 && (
          <p style={{ margin: '4px 0', fontSize: 13, color: '#888' }}>None yet. The form asks for the basics only.</p>
        )}

        {questions.map((q, i) => (
          <div key={q.id} style={{
            display: 'grid', gap: 8, padding: '10px 12px',
            border: '1px solid #e4e4e7', borderRadius: 8, background: '#fafafa',
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#888', width: 16 }}>{i + 1}</span>
              <input
                value={q.prompt}
                maxLength={200}
                placeholder="e.g. Link to something you have built"
                onChange={e => setQuestions(qs => qs.map((x, j) => j === i ? { ...x, prompt: e.target.value } : x))}
                style={{ ...input, flex: 1 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingLeft: 24 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, fontWeight: 500, color: '#111' }}>
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={e => setQuestions(qs => qs.map((x, j) => j === i ? { ...x, required: e.target.checked } : x))}
                />
                Required
              </label>
              {i > 0 && (
                <button type="button" onClick={() => setQuestions(qs => {
                  const n = [...qs]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n
                })} style={tinyBtn}>Move up</button>
              )}
              <button type="button" onClick={() => setQuestions(qs => qs.filter((_, j) => j !== i))}
                style={{ ...tinyBtn, color: '#991b1b' }}>Remove</button>
            </div>
          </div>
        ))}

        <button
          type="button"
          disabled={questions.length >= 10}
          onClick={() => setQuestions(qs => [...qs, {
            // A stable id, minted here and kept for the life of the question, so
            // an answer stays tied to it after a reorder or a reworded prompt.
            id: crypto.randomUUID(),
            prompt: '',
            required: false,
          }])}
          style={{ ...ghost, justifySelf: 'start', opacity: questions.length >= 10 ? 0.5 : 1 }}
        >
          {questions.length >= 10 ? 'Ten questions is the limit' : 'Add a question'}
        </button>
      </div>

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
const tinyBtn: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  fontSize: 12.5, fontWeight: 600, color: '#111', textDecoration: 'underline',
}
const errorBox: React.CSSProperties = {
  margin: 0, padding: '9px 12px', borderRadius: 6, fontSize: 13,
  background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5',
}
