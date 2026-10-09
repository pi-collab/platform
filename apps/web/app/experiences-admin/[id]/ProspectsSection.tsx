'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import StatusChip, { type ChipTone } from '@/components/StatusChip'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { CHANNELS, formatRupees } from '@/lib/experience-request'
import type { ConsoleProspect } from '@/lib/experience-console-server'
import {
  addProspectAction, decideProspectAction, dropProspectAction, editProspectAction, linkProspectAction, setProspectStatusAction,
  type ProspectForm,
} from '../actions'
import { fieldLabel, neonBtn, pillBtn } from '../ui'
import { Avatar, MenuItem, kebab, menuBox, ROSTER_COLS } from './roster-bits'

/**
 * Creators NOT on Guapd yet (0541), listed inside the roster panel under the
 * roster itself, in the same columns. Staff record their Instagram handle,
 * name, expected cost and where things stand (contacted → agreed →
 * onboarding), and the brand's yes or no with the channel. They are not on
 * the roster: they cannot be locked or sent a deal, and the P&L shows them as
 * an estimate only. Once they join and are vetted, "Link to their account"
 * puts them on the roster with the brand's decision.
 *
 * The "Add someone not on Guapd" button sits in the roster header (RosterPanel
 * owns `adding`). Nothing here messages anyone: staff send the sign-up link
 * themselves. Staff only; the brand never sees this list.
 */
const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  not_contacted: { label: 'Not contacted yet', tone: 'neutral' },
  contacted:  { label: 'Contacted', tone: 'blue' },
  agreed:     { label: 'Agreed', tone: 'lime' },
  onboarding: { label: 'Onboarding', tone: 'amber' },
  linked:     { label: 'On the roster', tone: 'green' },
  dropped:    { label: 'Dropped', tone: 'red' },
}
const BRAND: Record<string, string> = { pending: 'Brand: no answer yet', accepted: 'Brand accepted', rejected: 'Brand rejected' }
const DECISION_CHANNELS = CHANNELS.filter(([k]) => k !== 'portal')
const SIGNUP = `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')}/signup/creator`
const OPEN = ['not_contacted', 'contacted', 'agreed', 'onboarding'] as const
const empty: ProspectForm = { fullName: '', handle: '', phone: '', costBasis: 'per_day', dayRate: '', days: '1', flat: '', note: '', status: 'not_contacted' }

export default function ProspectsSection({ experienceId, editable, prospects, linkable, adding, onAddingChange }: {
  experienceId: string
  editable: boolean
  prospects: ConsoleProspect[]
  /** Bookable creators not yet on this roster, to link an entry to. */
  linkable: { id: string; name: string; handle: string }[]
  /** The add form is open (the button is in the roster header). */
  adding: boolean
  onAddingChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [deciding, setDeciding] = useState<ConsoleProspect | null>(null)
  const [decision, setDecision] = useState<'accepted' | 'rejected'>('accepted')
  const [channel, setChannel] = useState('whatsapp')
  const [dropping, setDropping] = useState<ConsoleProspect | null>(null)
  const [reason, setReason] = useState('')
  const [linking, setLinking] = useState<ConsoleProspect | null>(null)
  const [linkTo, setLinkTo] = useState('')
  const top = useRef<HTMLDivElement>(null)
  // The add button is up in the roster header; bring the form into view.
  useEffect(() => { if (adding) top.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [adding])

  // Linked entries are on the roster above now; only the open ones list here.
  const open = prospects.filter((p) => p.status !== 'dropped' && p.status !== 'linked')
  const dropped = prospects.filter((p) => p.status === 'dropped')
  const estimate = open.filter((p) => p.brand_decision !== 'rejected').reduce((t, p) => t + p.expected_total_paise, 0)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void, msg?: string) => {
    setError(null); setNotice(null); setMenu(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) { setError(r.error ?? 'Something went wrong'); return }
      after?.(); if (msg) setNotice(msg); router.refresh()
    })
  }
  const copySignup = async () => { try { await navigator.clipboard.writeText(SIGNUP); setNotice('Sign-up link copied. Send it to them yourself.') } catch { setNotice(SIGNUP) } }

  if (open.length === 0 && dropped.length === 0 && !adding && !notice) return null

  return (
    <div id="not-on-guapd" ref={top} style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingBottom: 12, borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
            Not on Guapd yet <span style={{ color: 'var(--wg-500)', fontWeight: 500, marginLeft: 4 }}>{open.length}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3, lineHeight: 1.5 }}>
            Not counted on the roster until you link their Guapd account.{estimate > 0 ? ` Expected cost: ${formatRupees(estimate)} (an estimate, not in the margin).` : ''}
          </div>
        </div>
        <button type="button" style={{ ...pillBtn, height: 34, fontSize: 12.5 }} onClick={copySignup}>Copy sign-up link</button>
      </div>

      {adding && (
        <Editor busy={pending} onCancel={() => onAddingChange(false)}
          onSave={(f) => run(() => addProspectAction(experienceId, f), () => onAddingChange(false), `${f.fullName} added. Send them the sign-up link.`)} />
      )}

      {open.length > 0 && (
        <div className="xp-rhead" style={{ display: 'grid', gridTemplateColumns: ROSTER_COLS, gap: 16, alignItems: 'center', padding: '12px 4px' }}>
          <span /><span className="t-meta">Creator</span><span className="t-meta">Expected cost</span><span className="t-meta">Status</span><span />
        </div>
      )}

      {open.map((p) => {
        const st = STATUS[p.status]
        return (
          <div key={p.id} style={{ borderTop: '1px solid var(--hairline)', opacity: p.brand_decision === 'rejected' ? 0.55 : 1 }}>
            <div className="xp-rrow" style={{ display: 'grid', gridTemplateColumns: ROSTER_COLS, gap: 16, alignItems: 'center', padding: '16px 4px' }}>
              <Avatar name={p.full_name} url={null} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.full_name}</div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <a href={`https://instagram.com/${p.instagram_handle}`} target="_blank" rel="noreferrer noopener" style={{ color: 'inherit' }}>@{p.instagram_handle}</a>
                  {p.phone ? ` · ${p.phone}` : ''} · Not on Guapd
                </div>
                {p.note && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.note}>Note: {p.note}</div>}
              </div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink)', display: 'grid', gap: 3, minWidth: 0 }}>
                <span>{p.cost_basis === 'per_day' ? `${formatRupees(p.expected_day_rate_paise)}/day × ${p.expected_days} = ` : 'Flat fee '}<b>{formatRupees(p.expected_total_paise)}</b> <span style={{ color: 'var(--ink-faint)' }}>expected</span></span>
                {p.match && (
                  <span style={{ fontSize: 12, color: p.match.bookable ? '#3F6212' : '#8C6417' }}>
                    {p.match.bookable ? 'On Guapd now: link them.' : 'Signed up, waiting to be vetted.'}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                {editable
                  ? <select aria-label={`Where things stand with ${p.full_name}`} className="xp-status-select" data-tone={st.tone} value={p.status} disabled={pending}
                      onChange={(e) => run(() => setProspectStatusAction(experienceId, p.id, e.target.value))}>
                      {OPEN.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
                    </select>
                  : <StatusChip label={st.label} tone={st.tone} />}
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: p.brand_decision === 'accepted' ? '#3F6212' : p.brand_decision === 'rejected' ? '#9C4147' : 'var(--ink-faint)' }}>
                  {BRAND[p.brand_decision]}{p.decision_channel ? ` · ${CHANNELS.find(([k]) => k === p.decision_channel)?.[1] ?? p.decision_channel}` : ''}
                </span>
              </div>
              <div style={{ position: 'relative' }}>
                {editable && (
                  <button type="button" aria-label="Actions" onClick={() => setMenu(menu === p.id ? null : p.id)} style={kebab(menu === p.id)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
                  </button>
                )}
                {menu === p.id && (
                  <div style={{ ...menuBox, width: 220 }}>
                    <MenuItem onClick={() => { setMenu(null); setLinkTo(p.match?.bookable && !p.match.on_roster ? p.match.creator_id : ''); setLinking(p) }}>Link to their account…</MenuItem>
                    <MenuItem onClick={() => { setMenu(null); setDecision(p.brand_decision === 'rejected' ? 'rejected' : 'accepted'); setChannel(p.decision_channel ?? 'whatsapp'); setDeciding(p) }}>Brand&rsquo;s answer…</MenuItem>
                    <MenuItem onClick={() => { setMenu(null); setError(null); setEditing(p.id) }}>Edit</MenuItem>
                    <MenuItem danger onClick={() => { setMenu(null); setReason(''); setDropping(p) }}>Drop…</MenuItem>
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
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)', margin: '10px 4px 0' }}>
          Dropped: {dropped.map((p) => `${p.full_name} (${p.dropped_reason})`).join('; ')}
        </p>
      )}
      {notice && <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: '#3F6212', margin: '12px 4px 0' }}>{notice}</p>}
      {error && <p role="alert" style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: '#9B3030', margin: '12px 4px 0' }}>{error}</p>}

      <ConfirmDialog open={!!deciding} title={`The brand's answer on ${deciding?.full_name ?? ''}`}
        body="Recorded with how the brand told us. It carries over to the roster when you link their account."
        detail={<div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <label><span style={fieldLabel}>Answer</span>
            <select className="dinput" value={decision} onChange={(e) => setDecision(e.target.value as 'accepted' | 'rejected')}><option value="accepted">Accepted</option><option value="rejected">Rejected</option></select></label>
          <label><span style={fieldLabel}>How they told us</span>
            <select className="dinput" value={channel} onChange={(e) => setChannel(e.target.value)}>{DECISION_CHANNELS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>}
        confirmLabel="Record answer" busy={pending}
        onConfirm={() => deciding && run(() => decideProspectAction(experienceId, deciding.id, decision, channel), () => setDeciding(null))}
        onCancel={() => setDeciding(null)} />
      <ConfirmDialog open={!!dropping} title={`Drop ${dropping?.full_name ?? ''}`} tone="danger" body="They come off this list and out of the estimate. The entry is kept with your reason."
        detail={<div style={{ marginTop: 12 }}><label style={fieldLabel} htmlFor="drop-why">Why</label>
          <input id="drop-why" className="dinput" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Not available on the shoot date" /></div>}
        confirmLabel="Drop" busy={pending}
        onConfirm={() => dropping && run(() => dropProspectAction(experienceId, dropping.id, reason), () => setDropping(null))}
        onCancel={() => setDropping(null)} />
      <ConfirmDialog open={!!linking} title={`Link ${linking?.full_name ?? ''} to their Guapd account`}
        body="They join this roster with the brand's answer carried over. Then it is the normal flow: their day rate, the lock, their deal."
        detail={<div style={{ marginTop: 12 }}><label style={fieldLabel} htmlFor="link-to">Their Guapd account (vetted creators not on this roster)</label>
          <select id="link-to" className="dinput" value={linkTo} onChange={(e) => setLinkTo(e.target.value)}>
            <option value="">Pick a creator</option>
            {linkable.map((c) => <option key={c.id} value={c.id}>{c.name}{c.handle ? ` (${c.handle})` : ''}</option>)}
          </select></div>}
        confirmLabel="Link and add to the roster" busy={pending}
        onConfirm={() => linking && run(() => linkProspectAction(experienceId, linking.id, linkTo), () => setLinking(null), 'Linked: they are on the roster now.')}
        onCancel={() => setLinking(null)} />
      <style dangerouslySetInnerHTML={{ __html: STATUS_SELECT_CSS }} />
    </div>
  )
}

function Editor({ initial, busy, onSave, onCancel }: { initial?: ConsoleProspect; busy: boolean; onSave: (f: ProspectForm) => void; onCancel: () => void }) {
  const [f, setF] = useState<ProspectForm>(initial ? {
    fullName: initial.full_name, handle: initial.instagram_handle, phone: initial.phone ?? '', costBasis: initial.cost_basis,
    dayRate: initial.expected_day_rate_paise != null ? String(initial.expected_day_rate_paise / 100) : '', days: initial.expected_days != null ? String(initial.expected_days) : '1',
    flat: initial.cost_basis === 'flat' ? String(initial.expected_total_paise / 100) : '', note: initial.note ?? '',
  } : empty)
  const set = (k: keyof ProspectForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const field = (text: string, el: React.ReactNode) => <label style={{ minWidth: 0 }}><span style={fieldLabel}>{text}</span>{el}</label>
  return (
    <div style={{ margin: '14px 0 16px', padding: 16, borderRadius: 14, background: '#F7F7F4', display: 'grid', gap: 12 }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{initial ? `Edit ${initial.full_name}` : 'Add someone not on Guapd'}</div>
      {/* Two rows of three, always: who they are, then what they cost. */}
      <div className="xp-prospect-form" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        {field('Name', <input className="dinput" value={f.fullName} onChange={set('fullName')} maxLength={120} />)}
        {field('Instagram handle', <input className="dinput" value={f.handle} onChange={set('handle')} placeholder="@handle" maxLength={100} />)}
        {field('Phone (optional)', <input className="dinput" value={f.phone} onChange={set('phone')} inputMode="tel" maxLength={20} />)}
        {field('Expected cost', <select className="dinput" value={f.costBasis} onChange={set('costBasis')}><option value="per_day">Day rate × days</option><option value="flat">Flat fee</option></select>)}
        {f.costBasis === 'per_day' ? <>
          {field('Day rate (₹)', <input className="dinput" value={f.dayRate} onChange={set('dayRate')} inputMode="decimal" />)}
          {field('Days', <input className="dinput" value={f.days} onChange={set('days')} inputMode="decimal" />)}
        </> : <div className="xp-prospect-span2" style={{ gridColumn: 'span 2' }}>{field('Fee (₹)', <input className="dinput" value={f.flat} onChange={set('flat')} inputMode="decimal" />)}</div>}
      </div>
      <div className="xp-prospect-form" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        {!initial && field('Where things stand', <select className="dinput" value={f.status} onChange={set('status')}>
          {OPEN.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </select>)}
        <div className="xp-prospect-span2" style={{ gridColumn: initial ? '1 / -1' : 'span 2' }}>
          {field('Note (optional)', <input className="dinput" value={f.note} onChange={set('note')} maxLength={1000} placeholder="Found via the brand's tags; agreed over DM" />)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" onClick={onCancel} style={pillBtn}>Cancel</button>
        <button type="button" className="neonbtn" disabled={busy} onClick={() => onSave(f)} style={{ ...neonBtn, height: 40 }}>{busy ? 'Saving…' : initial ? 'Save' : 'Add'}</button>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `@media (max-width: 720px) { .xp-prospect-form { grid-template-columns: 1fr !important; } .xp-prospect-span2 { grid-column: auto !important; } }` }} />
    </div>
  )
}

/* The row's status as a chip-shaped dropdown: same height, radius and type as
   StatusChip, the chevron inside the right padding. */
const STATUS_SELECT_CSS = `
.xp-status-select { appearance: none; -webkit-appearance: none; height: 28px; border-radius: 999px; border: 1px solid var(--hairline, #EAEAE3);
  padding: 0 28px 0 12px; font-family: var(--font-ui); font-size: 12px; font-weight: 600; color: var(--ink); cursor: pointer; max-width: 100%;
  background: var(--card, #fff) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%234A4F58' stroke-width='2.2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center / 11px 11px; }
.xp-status-select[data-tone="blue"] { background-color: #EEF3FC; border-color: #D5E1F5; }
.xp-status-select[data-tone="lime"] { background-color: #F4FBDC; border-color: #DCEBA8; }
.xp-status-select[data-tone="amber"] { background-color: #FCF6E4; border-color: #EEDDB0; }
.xp-status-select:disabled { opacity: .6; cursor: default; }
`
