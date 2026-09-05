'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { logFeedback, setFeedbackStatus } from './actions'
import {
  FEEDBACK_CATEGORIES, FEEDBACK_STATUSES,
  FEEDBACK_CATEGORY_LABEL, FEEDBACK_STATUS_LABEL,
} from '@/lib/pipeline'

/**
 * Objections and feature requests heard during outreach.
 *
 * Categorised rather than free text so the counts at the top mean something —
 * "eleven brands raised pricing" is the output that justifies logging any of
 * this. A diary of paragraphs would not be read twice.
 */

interface FeedbackRow {
  id: string
  kind: 'brand' | 'creator'
  source_name: string | null
  category: string
  body: string
  status: string
  logged_by: string | null
  created_at: string
}

export default function FeedbackLog({ rows }: { rows: FeedbackRow[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('')
  const [pending, startTransition] = useTransition()

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) setError(res.error ?? 'Something went wrong.')
      else router.refresh()
    })
  }

  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.category, (counts.get(r.category) ?? 0) + 1)

  const shown = filter ? rows.filter((r) => r.category === filter) : rows
  const openCount = rows.filter((r) => r.status === 'open').length

  return (
    <div>
      {error && <div role="alert" style={errorBox}>{error}</div>}

      <section style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {FEEDBACK_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(filter === c ? '' : c)}
            style={{
              ...chip,
              background: filter === c ? '#111' : '#f4f4f5',
              color: filter === c ? '#fff' : '#374151',
              borderColor: filter === c ? '#111' : '#e5e7eb',
            }}
          >
            {FEEDBACK_CATEGORY_LABEL[c]} <strong>{counts.get(c) ?? 0}</strong>
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#6b7280', alignSelf: 'center' }}>
          {openCount} open &middot; {rows.length} logged
        </span>
      </section>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <button onClick={() => setAdding((v) => !v)} style={primaryBtn}>
          {adding ? 'Cancel' : 'Log feedback'}
        </button>
        {pending && <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Saving…</span>}
      </div>

      {adding && (
        <form
          style={formBox}
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            run(async () => {
              const res = await logFeedback(fd)
              if (res.ok) setAdding(false)
              return res
            })
          }}
        >
          <div style={grid}>
            <label style={fieldWrap}>
              <span style={fieldLabel}>From</span>
              <select name="kind" style={input} defaultValue="brand">
                <option value="brand">A brand</option>
                <option value="creator">A creator</option>
              </select>
            </label>
            <label style={fieldWrap}>
              <span style={fieldLabel}>Who (optional)</span>
              <input name="source_name" style={input} placeholder="Company or handle" />
            </label>
            <label style={fieldWrap}>
              <span style={fieldLabel}>Category</span>
              <select name="category" style={input} defaultValue="objection">
                {FEEDBACK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{FEEDBACK_CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </label>
          </div>
          <label style={{ ...fieldWrap, marginTop: '0.6rem' }}>
            <span style={fieldLabel}>What they said</span>
            <textarea name="body" rows={3} required style={{ ...input, resize: 'vertical' }} />
          </label>
          <button type="submit" style={{ ...primaryBtn, marginTop: '0.6rem' }}>Log it</button>
        </form>
      )}

      {shown.length === 0 ? (
        <p style={{ color: '#888', fontSize: '0.875rem' }}>
          {filter ? 'Nothing in this category yet.' : 'Nothing logged yet.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {shown.map((r) => (
            <div key={r.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                <span style={{ ...tag, background: r.kind === 'brand' ? '#e0f2fe' : '#fef3c7', color: r.kind === 'brand' ? '#075985' : '#92400e' }}>
                  {r.kind}
                </span>
                <span style={{ ...tag, background: '#f4f4f5', color: '#374151' }}>
                  {FEEDBACK_CATEGORY_LABEL[r.category] ?? r.category}
                </span>
                {r.source_name && <strong style={{ fontSize: '0.8125rem' }}>{r.source_name}</strong>}
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <select
                    value={r.status}
                    disabled={pending}
                    onChange={(e) => run(() => setFeedbackStatus(r.id, e.target.value))}
                    style={{ ...input, width: 'auto', fontSize: '0.75rem', padding: '0.2rem 0.4rem' }}
                  >
                    {FEEDBACK_STATUSES.map((s) => (
                      <option key={s} value={s}>{FEEDBACK_STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.55, color: '#1f2937', whiteSpace: 'pre-wrap' }}>
                {r.body}
              </p>
              <div style={{ marginTop: '0.35rem', fontSize: '0.6875rem', color: '#9ca3af' }}>
                {r.logged_by ? `${r.logged_by.split('@')[0]} · ` : ''}
                {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const chip: React.CSSProperties = {
  padding: '0.3rem 0.7rem', borderRadius: 999, border: '1px solid #e5e7eb',
  fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
}
const card: React.CSSProperties = {
  padding: '0.7rem 0.85rem', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff',
}
const tag: React.CSSProperties = {
  padding: '0.1rem 0.45rem', borderRadius: 999, fontSize: '0.6875rem',
  fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em',
}
const input: React.CSSProperties = {
  padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #e5e7eb',
  fontSize: '0.8125rem', background: '#fff', width: '100%', fontFamily: 'inherit',
}
const fieldWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.2rem' }
const fieldLabel: React.CSSProperties = {
  fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '.04em', color: '#6b7280',
}
const grid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.6rem',
}
const formBox: React.CSSProperties = {
  padding: '0.9rem 1rem', border: '1px solid #e5e7eb', borderRadius: 10,
  background: '#fff', marginBottom: '1rem',
}
const primaryBtn: React.CSSProperties = {
  padding: '0.35rem 0.9rem', borderRadius: 6, border: '1px solid #111',
  background: '#111', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer',
}
const errorBox: React.CSSProperties = {
  padding: '0.6rem 0.85rem', borderRadius: 8, background: '#fef2f2',
  border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.8125rem',
  fontWeight: 500, marginBottom: '0.75rem',
}
