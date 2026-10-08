'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import StatusChip, { type ChipTone } from '@/components/StatusChip'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { CHANNELS, formatRupees } from '@/lib/experience-request'
import type { ConsoleProspect } from '@/lib/experience-console-server'
import {
  addProspectAction, decideProspectAction, dropProspectAction, editProspectAction, linkProspectAction, setProspectStatusAction,
  type ProspectForm,
} from '../../actions'

/**
 * Creators NOT on Guapd yet (0541), on the "Add creators" page. Staff record
 * their Instagram handle, name, expected cost and where things stand
 * (contacted → agreed → onboarding), and the brand's yes or no with the
 * channel. They are not on the roster: they cannot be locked or sent a deal,
 * and the P&L shows them as an estimate only. Once they join and are vetted,
 * "Link to their account" puts them on the roster with the brand's decision.
 *
 * Nothing here messages anyone: staff send the sign-up link themselves.
 * Staff only; the brand never sees this list.
 */
const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  contacted:  { label: 'Contacted', tone: 'neutral' },
  agreed:     { label: 'Agreed', tone: 'blue' },
  onboarding: { label: 'Onboarding', tone: 'amber' },
  linked:     { label: 'On Guapd · on the roster', tone: 'green' },
  dropped:    { label: 'Dropped', tone: 'red' },
}
const BRAND: Record<string, string> = { pending: 'Brand: no answer yet', accepted: 'Brand accepted', rejected: 'Brand rejected' }
const DECISION_CHANNELS = CHANNELS.filter(([k]) => k !== 'portal')
const SIGNUP = `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')}/signup/creator`
const empty: ProspectForm = { fullName: '', handle: '', phone: '', costBasis: 'per_day', dayRate: '', days: '1', flat: '', note: '' }

export default function ProspectsSection({ experienceId, editable, prospects, linkable }: {
  experienceId: string
  editable: boolean
  prospects: ConsoleProspect[]
  /** Bookable creators not yet on this roster, to link an entry to. */
  linkable: { id: string; name: string; handle: string }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [deciding, setDeciding] = useState<ConsoleProspect | null>(null)
  const [decision, setDecision] = useState<'accepted' | 'rejected'>('accepted')
  const [channel, setChannel] = useState('whatsapp')
  const [dropping, setDropping] = useState<ConsoleProspect | null>(null)
  const [reason, setReason] = useState('')
  const [linking, setLinking] = useState<ConsoleProspect | null>(null)
  const [linkTo, setLinkTo] = useState('')

  const live = prospects.filter((p) => p.status !== 'dropped')
  const dropped = prospects.filter((p) => p.status === 'dropped')
  const open = live.filter((p) => p.status !== 'linked')
  const estimate = open.filter((p) => p.brand_decision !== 'rejected').reduce((t, p) => t + p.expected_total_paise, 0)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void, msg?: string) => {
    setError(null); setNotice(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) { setError(r.error ?? 'Something went wrong'); return }
      after?.(); if (msg) setNotice(msg); router.refresh()
    })
  }
  const copySignup = async () => { try { await navigator.clipboard.writeText(SIGNUP); setNotice('Sign-up link copied. Send it to them yourself.') } catch { setNotice(SIGNUP) } }

  return (
    <section id="not-on-guapd" className="surface" style={{ marginTop: 28, padding: 'clamp(20px, 2.4vw, 28px)', borderRadius: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, margin: 0 }}>Not on Guapd yet</h2>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)', margin: '6px 0 0', maxWidth: 640, lineHeight: 1.5 }}>
            Creators you want for this shoot who haven&rsquo;t joined Guapd. Track them here; they join the roster when you link their Guapd account,
            and only then can they be locked and sent a deal.{estimate > 0 ? ` Expected cost if they all come on: ${formatRupees(estimate)} (an estimate, not in the margin).` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={btn} onClick={copySignup}>Copy sign-up link</button>
          {editable && editing !== 'new' && <button type="button" style={{ ...btn, background: 'var(--lime-400)', borderColor: 'var(--lime-400)' }} onClick={() => { setError(null); setEditing('new') }}>Add someone not on Guapd</button>}
        </div>
      </div>

      {editing === 'new' && (
        <Editor busy={pending} onCancel={() => setEditing(null)} onSave={(f) => run(() => addProspectAction(experienceId, f), () => setEditing(null), `${f.fullName} added. Send them the sign-up link.`)} />
      )}

      <div style={{ marginTop: 16 }}>
        {live.length === 0 && editing !== 'new' && <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-faint)', margin: 0 }}>No one yet.</p>}
        {live.map((p) => {
          const st = STATUS[p.status]
          const active = p.status !== 'linked'
          return (
            <div key={p.id} style={{ borderTop: '1px solid var(--hairline, #EAEAE3)', padding: '14px 0' }}>
              <div className="xp-prospect-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1.2fr) 280px', gap: 14, alignItems: 'start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{p.full_name}</div>
                  <a href={`https://instagram.com/${p.instagram_handle}`} target="_blank" rel="noreferrer noopener" style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)' }}>@{p.instagram_handle}</a>
                  {p.phone && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)' }}> · {p.phone}</span>}
                  {p.note && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)', marginTop: 4 }}>{p.note}</div>}
                </div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink)', display: 'grid', gap: 3 }}>
                  <span>{p.cost_basis === 'per_day' ? `${formatRupees(p.expected_day_rate_paise)}/day × ${p.expected_days} = ` : 'Flat fee '}<b>{formatRupees(p.expected_total_paise)}</b> <span style={{ color: 'var(--ink-faint)' }}>expected</span></span>
                  <span style={{ color: p.brand_decision === 'accepted' ? '#3F6212' : p.brand_decision === 'rejected' ? '#9C4147' : 'var(--ink-soft)' }}>
                    {BRAND[p.brand_decision]}{p.decision_channel ? ` (${CHANNELS.find(([k]) => k === p.decision_channel)?.[1] ?? p.decision_channel})` : ''}
                  </span>
                  {p.status === 'linked' && <span style={{ color: 'var(--ink-soft)' }}>Linked to {p.linked_creator_name ?? 'their account'}; manage them on the roster.</span>}
                  {active && p.match && (
                    <span style={{ color: p.match.bookable ? '#3F6212' : '#8C6417' }}>
                      {p.match.bookable ? `${p.match.full_name} (@${p.instagram_handle}) is on Guapd now: link them.` : `@${p.instagram_handle} has signed up and is waiting to be vetted.`}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <StatusChip label={st.label} tone={st.tone} />
                  {editable && active && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <select aria-label="Where things stand" value={p.status} disabled={pending}
                        onChange={(e) => run(() => setProspectStatusAction(experienceId, p.id, e.target.value))}
                        style={{ height: 30, borderRadius: 999, border: '1px solid #EAEAE3', padding: '0 10px', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, background: 'var(--card)' }}>
                        <option value="contacted">Contacted</option><option value="agreed">Agreed</option><option value="onboarding">Onboarding</option>
                      </select>
                      <button type="button" style={small} onClick={() => { setDecision(p.brand_decision === 'rejected' ? 'rejected' : 'accepted'); setChannel(p.decision_channel ?? 'whatsapp'); setDeciding(p) }}>Brand&rsquo;s answer</button>
                      <button type="button" style={small} onClick={() => { setError(null); setEditing(p.id) }}>Edit</button>
                      <button type="button" style={{ ...small, background: 'var(--lime-400)', borderColor: 'var(--lime-400)' }}
                        onClick={() => { setLinkTo(p.match?.bookable && !p.match.on_roster ? p.match.creator_id : ''); setLinking(p) }}>Link to their account</button>
                      <button type="button" style={{ ...small, color: '#9C4147' }} onClick={() => { setReason(''); setDropping(p) }}>Drop</button>
                    </div>
                  )}
                </div>
              </div>
              {editing === p.id && (
                <Editor initial={p} busy={pending} onCancel={() => setEditing(null)} onSave={(f) => run(() => editProspectAction(experienceId, p.id, f), () => setEditing(null))} />
              )}
            </div>
          )
        })}
        {dropped.length > 0 && (
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)', margin: '10px 0 0' }}>
            Dropped: {dropped.map((p) => `${p.full_name} (${p.dropped_reason})`).join('; ')}
          </p>
        )}
      </div>

      {notice && <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: '#3F6212', margin: '12px 0 0' }}>{notice}</p>}
      {error && <p role="alert" style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: '#9B3030', margin: '12px 0 0' }}>{error}</p>}

      <ConfirmDialog open={!!deciding} title={`The brand's answer on ${deciding?.full_name ?? ''}`}
        body="Recorded with how the brand told us. It carries over to the roster when you link their account."
        detail={<div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <label><span style={label}>Answer</span>
            <select className="dinput" value={decision} onChange={(e) => setDecision(e.target.value as 'accepted' | 'rejected')}><option value="accepted">Accepted</option><option value="rejected">Rejected</option></select></label>
          <label><span style={label}>How they told us</span>
            <select className="dinput" value={channel} onChange={(e) => setChannel(e.target.value)}>{DECISION_CHANNELS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>}
        confirmLabel="Record answer" busy={pending}
        onConfirm={() => deciding && run(() => decideProspectAction(experienceId, deciding.id, decision, channel), () => setDeciding(null))}
        onCancel={() => setDeciding(null)} />
      <ConfirmDialog open={!!dropping} title={`Drop ${dropping?.full_name ?? ''}`} tone="danger" body="They come off this list and out of the estimate. The entry is kept with your reason."
        detail={<div style={{ marginTop: 12 }}><label style={label} htmlFor="drop-why">Why</label>
          <input id="drop-why" className="dinput" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Not available on the shoot date" /></div>}
        confirmLabel="Drop" busy={pending}
        onConfirm={() => dropping && run(() => dropProspectAction(experienceId, dropping.id, reason), () => setDropping(null))}
        onCancel={() => setDropping(null)} />
      <ConfirmDialog open={!!linking} title={`Link ${linking?.full_name ?? ''} to their Guapd account`}
        body="They join this roster with the brand's answer carried over. Then it is the normal flow: their day rate, the lock, their deal."
        detail={<div style={{ marginTop: 12 }}><label style={label} htmlFor="link-to">Their Guapd account (vetted creators not on this roster)</label>
          <select id="link-to" className="dinput" value={linkTo} onChange={(e) => setLinkTo(e.target.value)}>
            <option value="">Pick a creator</option>
            {linkable.map((c) => <option key={c.id} value={c.id}>{c.name}{c.handle ? ` (${c.handle})` : ''}</option>)}
          </select></div>}
        confirmLabel="Link and add to the roster" busy={pending}
        onConfirm={() => linking && run(() => linkProspectAction(experienceId, linking.id, linkTo), () => setLinking(null), 'Linked: they are on the roster now.')}
        onCancel={() => setLinking(null)} />

      <style dangerouslySetInnerHTML={{ __html: `@media (max-width: 860px) { .xp-prospect-row, .xp-prospect-form { grid-template-columns: 1fr !important; } .xp-prospect-row > :last-child { align-items: flex-start !important; } .xp-prospect-row > :last-child > div { justify-content: flex-start !important; } }` }} />
    </section>
  )
}

const btn: React.CSSProperties = { height: 36, padding: '0 14px', borderRadius: 999, border: '1px solid #EAEAE3', background: 'var(--card)', fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer' }
const small: React.CSSProperties = { ...btn, height: 30, padding: '0 11px', fontSize: 12 }
const label: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block', fontFamily: 'var(--font-ui)' }

function Editor({ initial, busy, onSave, onCancel }: { initial?: ConsoleProspect; busy: boolean; onSave: (f: ProspectForm) => void; onCancel: () => void }) {
  const [f, setF] = useState<ProspectForm>(initial ? {
    fullName: initial.full_name, handle: initial.instagram_handle, phone: initial.phone ?? '', costBasis: initial.cost_basis,
    dayRate: initial.expected_day_rate_paise != null ? String(initial.expected_day_rate_paise / 100) : '', days: initial.expected_days != null ? String(initial.expected_days) : '1',
    flat: initial.cost_basis === 'flat' ? String(initial.expected_total_paise / 100) : '', note: initial.note ?? '',
  } : empty)
  const set = (k: keyof ProspectForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: '#F7F7F3', display: 'grid', gap: 10 }}>
      <div className="xp-prospect-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <label><span style={label}>Name</span><input className="dinput" value={f.fullName} onChange={set('fullName')} maxLength={120} /></label>
        <label><span style={label}>Instagram handle</span><input className="dinput" value={f.handle} onChange={set('handle')} placeholder="@handle" maxLength={100} /></label>
        <label><span style={label}>Phone (optional)</span><input className="dinput" value={f.phone} onChange={set('phone')} inputMode="tel" maxLength={20} /></label>
        <label><span style={label}>Expected cost</span>
          <select className="dinput" value={f.costBasis} onChange={set('costBasis')}><option value="per_day">Day rate × days</option><option value="flat">Flat fee</option></select></label>
        {f.costBasis === 'per_day' ? <>
          <label><span style={label}>Day rate (₹)</span><input className="dinput" value={f.dayRate} onChange={set('dayRate')} inputMode="decimal" /></label>
          <label><span style={label}>Days</span><input className="dinput" value={f.days} onChange={set('days')} inputMode="decimal" /></label>
        </> : <label><span style={label}>Fee (₹)</span><input className="dinput" value={f.flat} onChange={set('flat')} inputMode="decimal" /></label>}
      </div>
      <label><span style={label}>Note (optional)</span><input className="dinput" value={f.note} onChange={set('note')} maxLength={1000} placeholder="Found via @kirobeauty's tags; agreed over DM" /></label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={busy} onClick={() => onSave(f)} style={{ ...btn, background: 'var(--lime-400)', borderColor: 'var(--lime-400)' }}>{initial ? 'Save' : 'Add'}</button>
        <button type="button" onClick={onCancel} style={btn}>Cancel</button>
      </div>
    </div>
  )
}
