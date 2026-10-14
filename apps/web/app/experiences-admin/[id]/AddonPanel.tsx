'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import StatusChip, { type ChipTone } from '@/components/StatusChip'
import { CHANNELS, DELIVERABLE_TYPES, countOf, formatRupees, isVideoType, rupeesToPaise } from '@/lib/experience-request'
import type { ConsoleAddon } from '@/lib/experience-console-server'
import { recordAddonAnswerAction, sendAddonAction, withdrawAddonAction } from '../actions'
import ExtrasEditor, { extrasPaise, type ExtraRow } from '../ExtrasEditor'
import { card, fieldLabel, formError, neonBtn, pillBtn } from '../ui'

/**
 * 0554: add-ons to the agreed brand price. When the brand wants more after
 * agreeing (say 10 more videos from the shoot), finance sends an add-on: what
 * it adds and its price. The brand accepts it on Guapd (or finance records the
 * answer). On accept the agreed total and the videos bought go up, and the
 * creator deals can then carry the extra work. One open add-on at a time;
 * sending a new one replaces it.
 */
const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  open: { label: 'Waiting for the brand', tone: 'blue' },
  superseded: { label: 'Replaced', tone: 'neutral' },
  accepted: { label: 'Accepted', tone: 'lime' },
  declined: { label: 'Declined', tone: 'red' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
}
const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const adds = (a: ConsoleAddon) => [
  ...a.deliverables.map((d) => countOf(d.count, d.type)),
  ...(a.extras ?? []).map((x) => `${x.label} ${formatRupees(Number(x.amount_paise))}`),
  ...(a.extras == null && a.extras_count > 0 ? [`${a.extras_count} extra${a.extras_count === 1 ? '' : 's'}`] : []),
].join(' · ')

export default function AddonPanel({ experienceId, addons, canSend, windowOpen, agreedTotalPaise }: {
  experienceId: string
  addons: ConsoleAddon[]
  /** Finance only (0537): sending, answering and every amount. */
  canSend: boolean
  /** The price is agreed and the Experience is not complete. */
  windowOpen: boolean
  agreedTotalPaise: number | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [rows, setRows] = useState<{ type: string; count: string }[]>([{ type: 'UGC video', count: '' }])
  const [perVideo, setPerVideo] = useState('')
  const [extras, setExtras] = useState<ExtraRow[]>([])
  const [message, setMessage] = useState('')
  const [answering, setAnswering] = useState<string | null>(null)
  const [answer, setAnswer] = useState<{ accept: boolean | null; channel: string; note: string }>({ accept: null, channel: '', note: '' })

  const open = addons.find((a) => a.status === 'open') ?? null
  const shown = addons.filter((a) => a.status !== 'superseded')
  const filled = rows.filter((r) => r.count.trim() !== '')
  const videos = filled.filter((r) => isVideoType(r.type)).reduce((n, r) => n + (Number(r.count) || 0), 0)
  const pv = videos > 0 ? rupeesToPaise(perVideo) : 0
  const ex = extrasPaise(extras, rupeesToPaise)
  const total = pv !== null && ex !== null && (videos === 0 || (pv ?? 0) > 0) ? (pv ?? 0) * videos + ex : null

  const startCompose = () => {
    setError(null)
    if (open) {
      setRows(open.deliverables.length ? open.deliverables.map((d) => ({ type: d.type, count: String(d.count) })) : [{ type: 'UGC video', count: '' }])
      setPerVideo(open.per_video_paise ? String(open.per_video_paise / 100) : '')
      setExtras((open.extras ?? []).map((x) => ({ label: x.label, amount: String(x.amount_paise / 100) })))
      setMessage(open.message ?? '')
    } else {
      setRows([{ type: 'UGC video', count: '' }]); setPerVideo(''); setExtras([]); setMessage('')
    }
    setComposing(true)
  }
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) { setError(r.error ?? 'Something went wrong.'); return }
      after?.()
      router.refresh()
    })
  }
  const send = () => run(() => sendAddonAction({ experienceId, deliverables: filled, perVideo, extras, message, expectedTotalPaise: total ?? -1 }), () => setComposing(false))

  return (
    <section className="surface" style={card} aria-labelledby="xp-addons">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 id="xp-addons" className="sect-head">Add-ons to the agreed price</h2>
          <div className="sect-rule" />
        </div>
        {canSend && windowOpen && !composing && (
          <button type="button" className="neonbtn" style={{ ...neonBtn, height: 40 }} onClick={startCompose}>{open ? 'Revise the add-on' : 'Send an add-on'}</button>
        )}
      </div>
      <p className="t-body" style={{ margin: '12px 0 0', fontSize: 13 }}>
        When the brand wants more after agreeing, for example extra videos from the shoot. The brand accepts it on Guapd; then the agreed total and the videos bought go up, and the creator deals can carry the extra work.
      </p>

      {composing && (
        <div style={{ marginTop: 16, padding: 18, borderRadius: 16, background: '#F7F7F4' }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14 }}>{open ? `Revised add-on (replaces #${open.number})` : 'New add-on'}</div>
          <div style={{ marginTop: 14 }}>
            <span style={fieldLabel}>What it adds</span>
            <div style={{ display: 'grid', gap: 8 }}>
              {rows.map((r, i) => (
                <div key={i} className="xp-addrow" style={{ display: 'grid', gridTemplateColumns: '200px 120px auto', gap: 8, alignItems: 'center' }}>
                  <select className="dinput" aria-label={`Deliverable ${i + 1} type`} value={r.type} onChange={(e) => setRows(rows.map((y, k) => k === i ? { ...y, type: e.target.value } : y))}>
                    {DELIVERABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input className="dinput" aria-label={`Deliverable ${i + 1} count`} inputMode="numeric" placeholder="How many" value={r.count}
                    onChange={(e) => setRows(rows.map((y, k) => k === i ? { ...y, count: e.target.value.replace(/\D/g, '') } : y))} />
                  <button type="button" style={{ ...pillBtn, height: 36, padding: '0 12px', justifySelf: 'start' }} onClick={() => setRows(rows.filter((_, k) => k !== i))}>Remove</button>
                </div>
              ))}
            </div>
            {rows.length < DELIVERABLE_TYPES.length && <button type="button" style={{ ...pillBtn, height: 34, marginTop: 8 }} onClick={() => setRows([...rows, { type: DELIVERABLE_TYPES.find((t) => !rows.some((r) => r.type === t)) ?? 'Story', count: '' }])}>+ Add a deliverable</button>}
          </div>
          {videos > 0 && (
            <div style={{ marginTop: 14, maxWidth: 260 }}>
              <label style={fieldLabel} htmlFor="ad-pv">Price per video (₹)</label>
              <input id="ad-pv" className="dinput" inputMode="decimal" placeholder="3,500" value={perVideo} onChange={(e) => setPerVideo(e.target.value)} />
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <span style={fieldLabel}>Extras (optional)</span>
            <ExtrasEditor rows={extras} onChange={setExtras} hint="Anything else with a price: express edit, extra location, travel…" />
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={fieldLabel} htmlFor="ad-msg">Message to the brand (optional)</label>
            <textarea id="ad-msg" className="dinput" rows={2} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} style={{ height: 'auto', padding: '10px 12px' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13 }}>
              Add-on <b style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginLeft: 6 }}>{total != null && total > 0 ? formatRupees(total) : '—'}</b>
              {total != null && total > 0 && agreedTotalPaise != null && <span style={{ color: 'var(--wg-500)', marginLeft: 8, fontSize: 12.5 }}>New agreed total {formatRupees(agreedTotalPaise + total)} if accepted</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={pillBtn} onClick={() => setComposing(false)}>Cancel</button>
              <button type="button" className="neonbtn" style={{ ...neonBtn, height: 40 }} disabled={pending || total == null || total <= 0} onClick={send}>{pending ? 'Sending…' : open ? 'Send revised add-on' : 'Send add-on'}</button>
            </div>
          </div>
        </div>
      )}

      {error && <p role="alert" style={{ ...formError, marginTop: 12 }}>{error}</p>}

      <div style={{ marginTop: 14 }}>
        {shown.length === 0 && !composing && <p className="t-body" style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 13 }}>No add-ons.</p>}
        {shown.map((a) => {
          const st = STATUS[a.status] ?? { label: a.status, tone: 'neutral' as ChipTone }
          return (
            <div key={a.id} style={{ borderTop: '1px solid var(--hairline)', padding: '14px 0', display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14 }}>Add-on #{a.number}{a.total_paise != null ? ` · ${formatRupees(a.total_paise)}` : ''}</div>
                <StatusChip label={st.label} tone={st.tone} />
              </div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink)' }}>Adds {adds(a) || '—'}{a.per_video_paise ? ` · ${formatRupees(a.per_video_paise)} per video` : ''}</div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)' }}>
                Sent {fmt(a.created_at)}{a.created_by_name ? ` by ${a.created_by_name}` : ''}
                {a.decided_at && a.status !== 'open' ? ` · ${st.label.toLowerCase()} ${fmt(a.decided_at)}${a.recorded_channel ? (a.recorded_channel === 'portal' ? ' on Guapd' : ` (recorded: ${CHANNELS.find(([v]) => v === a.recorded_channel)?.[1] ?? a.recorded_channel})`) : ''}` : ''}
              </div>
              {a.message && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)' }}>“{a.message}”</div>}
              {a.brand_note && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: '#9C4147' }}>Brand: “{a.brand_note}”</div>}
              {a.status === 'open' && canSend && (
                answering === a.id ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
                    <select className="dinput" style={{ width: 150, height: 34 }} aria-label="The brand's answer" value={answer.accept == null ? '' : answer.accept ? 'yes' : 'no'}
                      onChange={(e) => setAnswer({ ...answer, accept: e.target.value === '' ? null : e.target.value === 'yes' })}>
                      <option value="">Answer…</option><option value="yes">Accepted</option><option value="no">Declined</option>
                    </select>
                    <select className="dinput" style={{ width: 150, height: 34 }} aria-label="How the brand answered" value={answer.channel} onChange={(e) => setAnswer({ ...answer, channel: e.target.value })}>
                      <option value="">Sent via…</option>{CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    {answer.accept === false && <input className="dinput" style={{ height: 34, flex: 1, minWidth: 180 }} placeholder="What the brand said (optional)" value={answer.note} onChange={(e) => setAnswer({ ...answer, note: e.target.value })} />}
                    <button type="button" style={{ ...pillBtn, height: 34 }} disabled={pending || answer.accept == null || !answer.channel}
                      onClick={() => run(() => recordAddonAnswerAction(experienceId, a.id, !!answer.accept, answer.channel, answer.note), () => setAnswering(null))}>Save answer</button>
                    <button type="button" style={{ ...pillBtn, height: 34 }} onClick={() => setAnswering(null)}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    <button type="button" style={{ ...pillBtn, height: 34 }} onClick={() => { setAnswering(a.id); setAnswer({ accept: null, channel: '', note: '' }) }}>Record brand&apos;s answer</button>
                    <button type="button" style={{ ...pillBtn, height: 34 }} disabled={pending} onClick={() => run(() => withdrawAddonAction(experienceId, a.id))}>Withdraw</button>
                  </div>
                )
              )}
            </div>
          )
        })}
      </div>
      <style>{`@media (max-width: 720px) { .xp-addrow { grid-template-columns: 1fr 100px !important; } .xp-addrow button { grid-column: 1 / -1; } }`}</style>
    </section>
  )
}
