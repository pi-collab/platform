'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { creatorLegTerms } from '@/lib/experience-money'
import { DELIVERABLE_TYPES, countOf, formatRupees, rupeesToPaise } from '@/lib/experience-request'
import type { ConsoleExtra } from '@/lib/experience-console-server'
import { sendExtraAction, withdrawExtraAction } from './actions'

/**
 * 0555: extra deliverables for one creator, on the console deal page. Guapd
 * sends what it adds, priced at a rate per item x count or a flat amount; the
 * creator receives that less the platform fee at the % locked on this deal
 * (the preview uses the same creatorLegTerms the database checks against).
 * Never more than the brand bought: the database refuses it and says to send
 * the brand an add-on first. While unanswered: revise (replaces) or withdraw.
 */
const STATUS: Record<string, string> = { open: 'Waiting for the creator', superseded: 'Replaced', accepted: 'Accepted', declined: 'Declined', withdrawn: 'Withdrawn' }
const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
const label: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 6 }
const btn: React.CSSProperties = { height: 38, padding: '0 14px', borderRadius: 11, border: '1px solid var(--border-hairline, #EAEAE3)', background: 'var(--card)', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }

export default function ConsoleExtras({ experienceId, dealId, creatorName, track, extras, canSend }: {
  experienceId: string
  dealId: string
  creatorName: string
  /** The creator deal's locked track: sets the fee % (as at send). */
  track: 'growth' | 'deals'
  extras: ConsoleExtra[]
  canSend: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [rows, setRows] = useState<{ type: string; count: string }[]>([{ type: 'UGC video', count: '' }])
  const [pricing, setPricing] = useState<'per_item' | 'flat'>('per_item')
  const [unit, setUnit] = useState('')
  const [flat, setFlat] = useState('')
  const [message, setMessage] = useState('')

  const open = extras.find((x) => x.status === 'open') ?? null
  const shown = extras.filter((x) => x.status !== 'superseded')
  const filled = rows.filter((r) => r.count.trim() !== '')
  const items = filled.reduce((n, r) => n + (Number(r.count) || 0), 0)
  const unitP = pricing === 'per_item' ? rupeesToPaise(unit) : null
  const flatP = pricing === 'flat' ? rupeesToPaise(flat) : null
  const gross = pricing === 'per_item' ? (unitP && items ? unitP * items : null) : flatP
  const t = gross && gross > 0 ? creatorLegTerms({ grossPaise: gross, track }) : null

  const startCompose = () => {
    setError(null)
    if (open) {
      setRows(open.deliverables.map((d) => ({ type: d.type, count: String(d.count) })))
      setPricing(open.pricing)
      setUnit(open.unit_paise ? String(open.unit_paise / 100) : '')
      setFlat(open.pricing === 'flat' ? String(open.gross_paise / 100) : '')
      setMessage(open.message ?? '')
    } else { setRows([{ type: 'UGC video', count: '' }]); setPricing('per_item'); setUnit(''); setFlat(''); setMessage('') }
    setComposing(true)
  }
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) { setError(r.error ?? 'Something went wrong.'); return }
      after?.(); router.refresh()
    })
  }

  return (
    <div className="surface" style={{ padding: '22px 24px' }} id="extras">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Extra deliverables</h3>
        {canSend && !composing && (
          <button type="button" className="neonbtn" onClick={startCompose}
            style={{ height: 40, padding: '0 18px', borderRadius: 11, border: 'none', background: 'var(--neon)', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>
            {open ? 'Revise the extra' : 'Request extra deliverables'}
          </button>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
        More from {creatorName.split(' ')[0]}&rsquo;s shoot, on top of their deal. It cannot take the creators past what the brand bought: send the brand an add-on first.
      </p>

      {composing && (
        <div style={{ marginTop: 14, padding: 16, borderRadius: 14, background: '#F7F7F4', display: 'grid', gap: 14 }}>
          <div>
            <span style={label}>What it adds</span>
            <div style={{ display: 'grid', gap: 8 }}>
              {rows.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select className="dinput" style={{ width: 180 }} aria-label={`Extra ${i + 1} type`} value={r.type} onChange={(e) => setRows(rows.map((y, k) => k === i ? { ...y, type: e.target.value } : y))}>
                    {DELIVERABLE_TYPES.map((tt) => <option key={tt} value={tt}>{tt}</option>)}
                  </select>
                  <input className="dinput" style={{ width: 110 }} aria-label={`Extra ${i + 1} count`} inputMode="numeric" placeholder="How many" value={r.count}
                    onChange={(e) => setRows(rows.map((y, k) => k === i ? { ...y, count: e.target.value.replace(/\D/g, '') } : y))} />
                  {rows.length > 1 && <button type="button" style={btn} onClick={() => setRows(rows.filter((_, k) => k !== i))}>Remove</button>}
                </div>
              ))}
            </div>
            {rows.length < DELIVERABLE_TYPES.length && <button type="button" style={{ ...btn, marginTop: 8 }} onClick={() => setRows([...rows, { type: DELIVERABLE_TYPES.find((tt) => !rows.some((r) => r.type === tt)) ?? 'Story', count: '' }])}>+ Add a deliverable</button>}
          </div>
          <div>
            <span style={label}>Price for the creator</span>
            <div role="radiogroup" style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {(['per_item', 'flat'] as const).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={pricing === p} onClick={() => setPricing(p)}
                  style={{ ...btn, background: pricing === p ? 'var(--ink)' : 'var(--card)', color: pricing === p ? '#fff' : 'var(--ink)' }}>
                  {p === 'per_item' ? 'Rate per item' : 'Flat amount'}
                </button>
              ))}
            </div>
            {pricing === 'per_item'
              ? <input className="dinput" style={{ maxWidth: 220 }} aria-label="Rate per item in rupees" inputMode="decimal" placeholder="₹ per video or item" value={unit} onChange={(e) => setUnit(e.target.value)} />
              : <input className="dinput" style={{ maxWidth: 220 }} aria-label="Flat amount in rupees" inputMode="decimal" placeholder="₹ for all of it" value={flat} onChange={(e) => setFlat(e.target.value)} />}
          </div>
          <div>
            <label style={label} htmlFor="xx-msg">Message to {creatorName.split(' ')[0]} (optional)</label>
            <textarea id="xx-msg" className="dinput" rows={2} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} style={{ width: '100%', height: 'auto', padding: '10px 12px' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13 }}>
              {t ? <>{pricing === 'per_item' ? `${items} × ${formatRupees(unitP!)} = ` : ''}{formatRupees(t.creatorGrossPaise)} · fee {t.platformPct}% −{formatRupees(t.platformFeePaise)} · <b>creator receives {formatRupees(t.creatorNetPaise)}</b></> : 'Add what it adds and the price.'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={btn} onClick={() => setComposing(false)}>Cancel</button>
              <button type="button" className="neonbtn" disabled={pending || !t || filled.length === 0}
                onClick={() => run(() => sendExtraAction({ experienceId, dealId, deliverables: filled, pricing, unit, flat, message, expectedGrossPaise: t!.creatorGrossPaise, expectedNetPaise: t!.creatorNetPaise, revising: !!open }), () => setComposing(false))}
                style={{ height: 40, padding: '0 18px', borderRadius: 11, border: 'none', background: 'var(--neon)', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>
                {pending ? 'Sending…' : open ? 'Send revised extra' : 'Send to creator'}
              </button>
            </div>
          </div>
        </div>
      )}
      {error && <p role="alert" style={{ margin: '10px 0 0', fontSize: 12.5, color: '#9C4147' }}>{error}</p>}

      <div style={{ marginTop: 12 }}>
        {shown.length === 0 && !composing && <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>No extras.</p>}
        {shown.map((x) => (
          <div key={x.id} style={{ borderTop: '1px solid var(--border-hairline, #EAEAE3)', padding: '12px 0', display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontFamily: 'var(--font-ui)' }}>
              <b style={{ fontSize: 14 }}>Extra #{x.number} · {x.deliverables.map((d) => countOf(d.count, d.type)).join(' + ')}</b>
              <span style={{ fontSize: 12, fontWeight: 600, color: x.status === 'open' ? '#8C6417' : 'var(--ink-soft)' }}>{STATUS[x.status] ?? x.status}</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
              {x.pricing === 'per_item' && x.unit_paise ? `${x.items} × ${formatRupees(x.unit_paise)} = ` : 'Flat '}{formatRupees(x.gross_paise)} · fee {Number(x.platform_pct)}% · creator receives <b style={{ color: 'var(--ink)' }}>{formatRupees(x.net_paise)}</b>
              {' · '}sent {fmt(x.created_at)}{x.created_by_name ? ` by ${x.created_by_name}` : ''}{x.decided_at && x.status !== 'open' ? ` · ${(STATUS[x.status] ?? '').toLowerCase()} ${fmt(x.decided_at)}` : ''}
            </div>
            {x.decline_reason && <div style={{ fontSize: 12.5, color: '#9C4147' }}>Creator: “{x.decline_reason}”</div>}
            {x.status === 'open' && canSend && (
              <div><button type="button" style={btn} disabled={pending} onClick={() => run(() => withdrawExtraAction(experienceId, dealId, x.id))}>Withdraw</button></div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
