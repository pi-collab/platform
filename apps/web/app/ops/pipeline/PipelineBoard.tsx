'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createLead, updateLead, deleteLead, linkLead } from './actions'
import {
  LEAD_STAGES, STAGE_LABEL, STAGE_TONE, LEAD_SOURCES, SOURCE_LABEL,
  daysSince, type LeadRow,
} from '@/lib/pipeline'

/**
 * The board. A table rather than drag-and-drop columns: three people work this
 * list, and the questions they ask of it — who owns this, when did anyone last
 * touch it, which ones have gone quiet — are answered by sorting rows, not by
 * moving cards between piles.
 */
export default function PipelineBoard({
  kind, leads, activation, owners, currentUserEmail,
}: {
  kind: 'brand' | 'creator'
  leads: LeadRow[]
  activation: Record<string, { label: string; ok: boolean }[]>
  owners: string[]
  currentUserEmail: string
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) setError(res.error ?? 'Something went wrong.')
      else router.refresh()
    })
  }

  return (
    <div>
      {error && (
        <div role="alert" style={errorBox}>{error}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <button onClick={() => setAdding((v) => !v)} style={primaryBtn}>
          {adding ? 'Cancel' : `Add ${kind}`}
        </button>
        {pending && <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Saving…</span>}
      </div>

      {adding && (
        <LeadForm
          kind={kind}
          owners={owners}
          currentUserEmail={currentUserEmail}
          onSubmit={(fd) => run(async () => {
            const res = await createLead(fd)
            if (res.ok) setAdding(false)
            return res
          })}
        />
      )}

      {leads.length === 0 ? (
        <p style={{ color: '#888', fontSize: '0.875rem' }}>
          Nothing here yet. Add the first {kind} to start tracking.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>{kind === 'brand' ? 'Brand' : 'Creator'}</th>
                <th style={th}>Contact</th>
                {kind === 'creator' && <th style={th}>Platform</th>}
                <th style={th}>Owner</th>
                <th style={th}>Source</th>
                <th style={th}>Stage</th>
                <th style={th}>Activation</th>
                <th style={th}>Last touch</th>
                <th style={th}>Notes</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const steps = activation[l.id]
                const stale = daysSince(l.last_touch_at)
                const isOpen = editing === l.id
                return (
                  <>
                    <tr key={l.id}>
                      <td style={td}>
                        <strong>{l.name}</strong>
                        {l.handle && <div style={sub}>@{l.handle.replace(/^@/, '')}</div>}
                        {(l.brand_id || l.creator_id) && (
                          <Link
                            href={l.brand_id ? `/ops/brands` : `/ops/creators/${l.creator_id}`}
                            style={{ ...sub, color: '#2563eb', textDecoration: 'none', display: 'inline-block' }}
                          >
                            linked ↗
                          </Link>
                        )}
                      </td>
                      <td style={td} data-ph-mask>
                        {l.contact_email || '—'}
                        {l.contact_phone && <div style={sub}>{l.contact_phone}</div>}
                      </td>
                      {kind === 'creator' && (
                        <td style={td}>
                          {l.platform || '—'}
                          {l.followers != null && <div style={sub}>{l.followers.toLocaleString('en-IN')} followers</div>}
                          {l.niche && <div style={sub}>{l.niche}</div>}
                        </td>
                      )}
                      <td style={td}>{l.owner_email ? l.owner_email.split('@')[0] : '—'}</td>
                      <td style={td}>{l.source ? (SOURCE_LABEL[l.source] ?? l.source) : '—'}</td>
                      <td style={td}>
                        {/* Inline, because moving a stage is the action this
                            page exists for and it should not need a form. */}
                        <select
                          value={l.stage}
                          disabled={pending}
                          onChange={(e) => {
                            const fd = new FormData()
                            fd.set('id', l.id)
                            fd.set('stage', e.target.value)
                            run(() => updateLead(fd))
                          }}
                          style={{
                            ...select,
                            background: STAGE_TONE[l.stage].bg,
                            color: STAGE_TONE[l.stage].fg,
                            fontWeight: 700,
                          }}
                        >
                          {LEAD_STAGES.map((s) => (
                            <option key={s} value={s}>{STAGE_LABEL[s]}</option>
                          ))}
                        </select>
                      </td>
                      <td style={td}>
                        {steps ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.15rem 0.5rem' }}>
                            {steps.map((s) => (
                              <span key={s.label} style={{ fontSize: '0.6875rem', color: s.ok ? '#166534' : '#9ca3af', whiteSpace: 'nowrap' }}>
                                {s.ok ? '✓' : '○'} {s.label}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ ...sub, fontStyle: 'italic' }}>not linked</span>
                        )}
                      </td>
                      <td style={td}>
                        <span style={{ color: stale > 21 ? '#b45309' : '#374151', fontWeight: stale > 21 ? 700 : 400 }}>
                          {stale === 0 ? 'today' : `${stale}d ago`}
                        </span>
                      </td>
                      <td style={{ ...td, maxWidth: 220 }}>
                        <span style={{ fontSize: '0.75rem', color: '#4b5563' }}>
                          {l.notes ? (l.notes.length > 90 ? `${l.notes.slice(0, 90)}…` : l.notes) : '—'}
                        </span>
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button onClick={() => setEditing(isOpen ? null : l.id)} style={miniBtn}>
                            {isOpen ? 'Close' : 'Edit'}
                          </button>
                          <button
                            onClick={() => {
                              if (!confirm(`Delete the pipeline entry for ${l.name}? This removes the outreach history only — it does not touch their platform account.`)) return
                              run(() => deleteLead(l.id))
                            }}
                            style={{ ...miniBtn, color: '#b91c1c', borderColor: '#fca5a5' }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${l.id}-edit`}>
                        <td colSpan={kind === 'creator' ? 10 : 9} style={{ ...td, background: '#fafafa' }}>
                          <LeadForm
                            kind={kind}
                            lead={l}
                            owners={owners}
                            currentUserEmail={currentUserEmail}
                            onSubmit={(fd) => run(async () => {
                              fd.set('id', l.id)
                              const res = await updateLead(fd)
                              if (res.ok) setEditing(null)
                              return res
                            })}
                            onLink={(targetId) => run(() => linkLead(l.id, targetId))}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LeadForm({
  kind, lead, owners, currentUserEmail, onSubmit, onLink,
}: {
  kind: 'brand' | 'creator'
  lead?: LeadRow
  owners: string[]
  currentUserEmail: string
  onSubmit: (fd: FormData) => void
  onLink?: (targetId: string) => void
}) {
  const [linkId, setLinkId] = useState('')

  return (
    <div style={formBox}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(new FormData(e.currentTarget))
        }}
      >
        <input type="hidden" name="kind" value={kind} />
        <div style={grid}>
          <Field label={kind === 'brand' ? 'Company name' : 'Name'} name="name" defaultValue={lead?.name} required />
          <Field label={kind === 'brand' ? 'Contact name' : 'Handle'} name="handle" defaultValue={lead?.handle ?? ''} />
          <Field label="Email" name="contact_email" type="email" defaultValue={lead?.contact_email ?? ''} />
          <Field label="Phone" name="contact_phone" defaultValue={lead?.contact_phone ?? ''} />
          {kind === 'creator' && (
            <>
              <Field label="Platform" name="platform" defaultValue={lead?.platform ?? ''} placeholder="instagram" />
              <Field label="Followers" name="followers" defaultValue={lead?.followers != null ? String(lead.followers) : ''} />
              <Field label="Niche" name="niche" defaultValue={lead?.niche ?? ''} />
            </>
          )}
          <label style={fieldWrap}>
            <span style={fieldLabel}>Owner</span>
            <input
              name="owner_email"
              list="pipeline-owners"
              defaultValue={lead?.owner_email ?? currentUserEmail}
              style={input}
            />
            <datalist id="pipeline-owners">
              {owners.map((o) => <option key={o} value={o} />)}
            </datalist>
          </label>
          <label style={fieldWrap}>
            <span style={fieldLabel}>Source</span>
            <select name="source" defaultValue={lead?.source ?? ''} style={input}>
              <option value="">—</option>
              {LEAD_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
            </select>
          </label>
          <label style={fieldWrap}>
            <span style={fieldLabel}>Stage</span>
            <select name="stage" defaultValue={lead?.stage ?? 'contacted'} style={input}>
              {LEAD_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
          </label>
        </div>

        <label style={{ ...fieldWrap, marginTop: '0.6rem' }}>
          <span style={fieldLabel}>Notes</span>
          <textarea name="notes" defaultValue={lead?.notes ?? ''} rows={2} style={{ ...input, resize: 'vertical' }} />
        </label>

        <button type="submit" style={{ ...primaryBtn, marginTop: '0.6rem' }}>
          {lead ? 'Save' : `Add ${kind}`}
        </button>
      </form>

      {lead && onLink && !lead.brand_id && !lead.creator_id && (
        <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
          <span style={fieldLabel}>Link to their platform account</span>
          <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: '0.2rem 0 0.4rem', maxWidth: 460, lineHeight: 1.5 }}>
            Paste the {kind}&rsquo;s id from the {kind === 'brand' ? 'Brands' : 'Creators'} tab. Linking is
            manual on purpose — matching on email or handle automatically would eventually attach
            one company&rsquo;s outreach history to another&rsquo;s record, and nothing downstream would look
            wrong enough to notice. Linking also moves the lead to Signed up.
          </p>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
              placeholder="uuid"
              style={{ ...input, width: 320 }}
            />
            <button
              type="button"
              disabled={!linkId.trim()}
              onClick={() => onLink(linkId.trim())}
              style={{ ...primaryBtn, opacity: linkId.trim() ? 1 : 0.5 }}
            >
              Link
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({
  label, name, defaultValue, type = 'text', required = false, placeholder,
}: {
  label: string; name: string; defaultValue?: string; type?: string; required?: boolean; placeholder?: string
}) {
  return (
    <label style={fieldWrap}>
      <span style={fieldLabel}>{label}{required && <span style={{ color: '#dc2626' }}> *</span>}</span>
      <input name={name} type={type} defaultValue={defaultValue} required={required} placeholder={placeholder} style={input} />
    </label>
  )
}

const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }
const th: React.CSSProperties = {
  textAlign: 'left', padding: '0.5rem 0.6rem', borderBottom: '2px solid #e5e5e5',
  fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '.04em', color: '#6b7280', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '0.55rem 0.6rem', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' }
const sub: React.CSSProperties = { fontSize: '0.7rem', color: '#9ca3af' }
const select: React.CSSProperties = {
  padding: '0.25rem 0.4rem', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: '0.75rem',
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
const miniBtn: React.CSSProperties = {
  padding: '0.2rem 0.5rem', borderRadius: 5, border: '1px solid #e5e7eb',
  background: '#fff', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', color: '#374151',
}
const errorBox: React.CSSProperties = {
  padding: '0.6rem 0.85rem', borderRadius: 8, background: '#fef2f2',
  border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.8125rem',
  fontWeight: 500, marginBottom: '0.75rem',
}
