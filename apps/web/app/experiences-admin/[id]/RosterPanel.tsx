'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import StatusChip, { type ChipTone } from '@/components/StatusChip'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { CHANNELS, DELIVERABLE_TYPES, channelLabel, countOf } from '@/lib/experience-request'
import type { ConsoleReconcile, ConsoleRosterRow } from '@/lib/experience-console-server'
import { lockRoster, recordRosterDecision, removeFromRoster, setRosterNote, setRosterPlan } from '../actions'
import { card, fieldLabel, formError, kpiLabel, neonBtn, pillBtn } from '../ui'

/**
 * The Experience roster (staff console). Names, each creator's planned
 * deliverables, the brand's decision (recorded by staff, with the channel) and
 * Guapd's private note. No rate, payout or amount: those belong to the creator
 * leg (stage 3b). Table layout transcribed from the campaign roster.
 *
 * The reconciliation strip is the contract check: everyone not rejected, added
 * together, against what the brand bought. Individual creators may differ from
 * the template; only the combined total has to match.
 */
const DECISION: Record<string, { label: string; tone: ChipTone }> = {
  pending:  { label: 'Awaiting brand', tone: 'neutral' },
  accepted: { label: 'Brand accepted', tone: 'lime' },
  rejected: { label: 'Brand rejected', tone: 'red' },
}
const COLS = '40px 1.5fr 1.4fr 150px 34px'

export default function RosterPanel({ experienceId, editable, roster, reconcile }: {
  experienceId: string
  /** Building roster or Confirmed: creators can still be added (add-after-lock). */
  editable: boolean
  roster: ConsoleRosterRow[]
  reconcile: ConsoleReconcile | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [panel, setPanel] = useState<{ id: string; kind: 'accepted' | 'rejected' | 'plan' | 'note' } | null>(null)
  const [channel, setChannel] = useState('')
  const [planRows, setPlanRows] = useState<{ type: string; count: string }[]>([])
  const [note, setNote] = useState('')
  const [confirmLock, setConfirmLock] = useState(false)
  const [removing, setRemoving] = useState<ConsoleRosterRow | null>(null)

  const run = (fn: () => Promise<{ ok: boolean; error?: string } | { error?: string | null }>, after?: () => void) => {
    setError(null)
    start(async () => {
      const r = await fn()
      if ('ok' in r && !r.ok) { setError(r.error ?? 'Something went wrong'); return }
      if (!('ok' in r) && r.error) { setError(r.error); return }
      after?.(); setPanel(null); setMenu(null); router.refresh()
    })
  }

  const openPanel = (row: ConsoleRosterRow, kind: 'accepted' | 'rejected' | 'plan' | 'note') => {
    setMenu(null); setError(null); setPanel({ id: row.id, kind })
    setChannel(''); setNote(row.note ?? '')
    setPlanRows((row.planned_deliverables ?? []).map((d) => ({ type: d.type, count: String(d.count) })))
  }

  const unlocked = roster.filter((r) => !r.locked)
  const pendingCount = unlocked.filter((r) => r.brand_decision === 'pending').length
  const toLock = unlocked.filter((r) => r.brand_decision === 'accepted').length
  const lockBlocked = reconcile?.reason === 'no_agreed_plan' ? 'No agreed plan to lock against.'
    : !reconcile?.ok ? 'The roster does not add up to what the brand bought yet.'
    : pendingCount ? `Record the brand's decision on ${pendingCount} creator${pendingCount === 1 ? '' : 's'} first.`
    : !toLock ? 'No newly accepted creators to lock.' : null

  return (
    <section className="surface" style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="sect-head">Roster <span style={{ color: 'var(--wg-500)', fontWeight: 500, marginLeft: 6 }}>{roster.filter((r) => r.brand_decision !== 'rejected').length}{reconcile?.creators_planned ? ` of ${reconcile.creators_planned} planned` : ''}</span></h2>
          <div className="sect-rule" />
        </div>
        {editable && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Both open the creator pool (the Growth pool's layout, with each
                creator's shoot day rate on the card). The brand's picks are
                recorded with the channel they came through, chosen there. */}
            <Link href={`/experiences-admin/${experienceId}/pool?as=brand`} style={{ ...pillBtn, height: 44 }}>Add brand&apos;s picks</Link>
            <Link href={`/experiences-admin/${experienceId}/pool`} className="neonbtn" style={{ ...neonBtn, height: 44 }}>Add creators</Link>
          </div>
        )}
      </div>

      {/* ── The contract check: everyone not rejected, against what was sold ── */}
      {reconcile && reconcile.ok !== undefined && reconcile.reason !== 'no_agreed_plan' && (
        <div role="status" style={{
          marginTop: 18, padding: '14px 16px', borderRadius: 14,
          background: reconcile.ok ? '#F4FBDC' : '#FCF6E4', border: `1px solid ${reconcile.ok ? '#8FAF1F40' : '#C89A3C40'}`,
        }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
            {reconcile.ok ? 'Adds up to what the brand bought' : 'Does not add up to what the brand bought'}
            <span style={{ fontWeight: 500, color: 'var(--ink-soft)', marginLeft: 8 }}>{reconcile.videos_planned} of {reconcile.videos_sold} videos planned</span>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)' }}>
            {(reconcile.lines ?? []).filter((l) => !l.is_video || (reconcile.lines ?? []).filter((x) => x.is_video).reduce((t, x) => t + x.target, 0) === reconcile.videos_sold).map((l) => (
              <span key={l.type} style={{ color: l.planned === l.target ? 'var(--ink-soft)' : '#8C6417' }}>
                {l.type}: {l.planned} / {l.target}
              </span>
            ))}
          </div>
          {!reconcile.ok && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: '#8C6417', marginTop: 6 }}>Adjust a creator&apos;s plan, add or remove creators until the totals match. One creator may do more if another does fewer.</div>}
        </div>
      )}

      {reconcile?.reason === 'no_agreed_plan' && (
        <div role="status" style={{ marginTop: 18, padding: '14px 16px', borderRadius: 14, background: '#FCF6E4', border: '1px solid #C89A3C40', fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink)' }}>
          <b>No agreed plan to check against.</b> This Experience was priced before requests carried a per-creator plan, so the roster cannot be reconciled or locked. Record the request again as a new Experience.
        </div>
      )}

      {error && <div role="alert" style={{ ...formError, marginTop: 14 }}>{error}</div>}

      {roster.length === 0 ? (
        <p className="t-body" style={{ margin: '18px 0 0' }}>No creators yet. Add creators, or the brand&apos;s suggestions; each one starts from the agreed per-creator plan.</p>
      ) : (
        <div style={{ marginTop: 18 }}>
          <div className="xp-rhead" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center', padding: '0 4px 12px', borderBottom: '1px solid var(--hairline)' }}>
            <span /><span className="t-meta">Creator</span><span className="t-meta">Plan</span><span className="t-meta">Brand</span><span />
          </div>
          {roster.map((r) => {
            const d = DECISION[r.brand_decision]
            const isOpen = panel?.id === r.id
            return (
              <div key={r.id} style={{ borderTop: '1px solid var(--hairline)', opacity: r.brand_decision === 'rejected' ? 0.55 : 1 }}>
                <div className="xp-rrow" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center', padding: '16px 4px' }}>
                  <Avatar name={r.full_name} url={r.profile_photo_url} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.full_name}</div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)', marginTop: 2 }}>
                      {r.handle ? `@${r.handle.replace(/^@/, '')} · ` : ''}{r.added_by === 'brand' ? `Brand's pick${r.decision_channel && r.brand_decision === 'pending' ? ` (${channelLabel(r.decision_channel)})` : ''}` : 'Added by Guapd'}
                    </div>
                    {r.note && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.note}>Note: {r.note}</div>}
                  </div>
                  <div className="t-body" style={{ fontSize: 13.5, minWidth: 0 }}>
                    {(r.planned_deliverables ?? []).length ? r.planned_deliverables.map((x) => countOf(Number(x.count), x.type)).join(' · ') : 'Nothing planned'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                    {r.locked ? <StatusChip label="Locked" tone="green" /> : <StatusChip label={d.label} tone={d.tone} />}
                    {r.brand_decision !== 'pending' && r.decision_channel && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--ink-faint)' }}>via {channelLabel(r.decision_channel)}</span>}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <button type="button" aria-label="Actions" onClick={() => setMenu(menu === r.id ? null : r.id)} style={kebab(menu === r.id)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
                    </button>
                    {menu === r.id && (
                      <div style={menuBox}>
                        {!r.locked && <MenuItem onClick={() => openPanel(r, 'accepted')}>Brand accepted…</MenuItem>}
                        {!r.locked && <MenuItem onClick={() => openPanel(r, 'rejected')}>Brand rejected…</MenuItem>}
                        {!r.locked && r.brand_decision !== 'pending' && <MenuItem onClick={() => run(() => recordRosterDecision(experienceId, r.id, 'pending', null))}>Back to awaiting</MenuItem>}
                        {!r.locked && <MenuItem onClick={() => openPanel(r, 'plan')}>Adjust plan</MenuItem>}
                        <MenuItem onClick={() => openPanel(r, 'note')}>{r.note ? 'Edit note' : 'Add note'}</MenuItem>
                        {!r.locked && <MenuItem danger onClick={() => { setMenu(null); setRemoving(r) }}>Remove</MenuItem>}
                        {r.locked && <div style={{ padding: '8px 10px', fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)' }}>Locked: only the note can change.</div>}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Inline editor for the chosen action ── */}
                {isOpen && panel && (
                  <div style={{ margin: '0 4px 16px', padding: 16, borderRadius: 14, background: '#F7F7F4' }}>
                    {(panel.kind === 'accepted' || panel.kind === 'rejected') && (
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 220 }}>
                          <label style={fieldLabel} htmlFor={`ch-${r.id}`}>The brand {panel.kind === 'accepted' ? 'accepted' : 'rejected'} {r.full_name.split(' ')[0]} via</label>
                          <select id={`ch-${r.id}`} className="dinput" value={channel} onChange={(e) => setChannel(e.target.value)}>
                            <option value="">Select…</option>
                            {CHANNELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                          </select>
                        </div>
                        <button type="button" style={pillBtn} onClick={() => setPanel(null)}>Cancel</button>
                        <button type="button" className="neonbtn" style={{ ...neonBtn, height: 40 }} disabled={pending}
                          onClick={() => run(() => recordRosterDecision(experienceId, r.id, panel.kind as 'accepted' | 'rejected', channel || null))}>
                          {pending ? 'Saving…' : 'Record'}
                        </button>
                      </div>
                    )}
                    {panel.kind === 'plan' && (
                      <div>
                        <div style={kpiLabel}>{r.full_name.split(' ')[0]} makes</div>
                        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                          {planRows.map((p, i) => (
                            <div key={i} style={{ display: 'flex', gap: 10 }}>
                              <select className="dinput" aria-label="Type" value={p.type} style={{ flex: 2 }} onChange={(e) => setPlanRows(planRows.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}>
                                {DELIVERABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                              </select>
                              <input className="dinput" aria-label="How many" inputMode="numeric" value={p.count} style={{ flex: 1 }} onChange={(e) => setPlanRows(planRows.map((x, j) => j === i ? { ...x, count: e.target.value.replace(/\D/g, '') } : x))} />
                              <button type="button" style={{ ...pillBtn, height: 46 }} onClick={() => setPlanRows(planRows.filter((_, j) => j !== i))}>Remove</button>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                          <button type="button" style={pillBtn} onClick={() => setPlanRows([...planRows, { type: DELIVERABLE_TYPES[0], count: '' }])}>+ Add type</button>
                          <span style={{ flex: 1 }} />
                          <button type="button" style={pillBtn} onClick={() => setPanel(null)}>Cancel</button>
                          <button type="button" className="neonbtn" style={{ ...neonBtn, height: 40 }} disabled={pending}
                            onClick={() => run(() => setRosterPlan(experienceId, r.id, planRows))}>{pending ? 'Saving…' : 'Save plan'}</button>
                        </div>
                      </div>
                    )}
                    {panel.kind === 'note' && (
                      <div>
                        <label style={fieldLabel} htmlFor={`note-${r.id}`}>Guapd note: only the Guapd team ever sees this</label>
                        <textarea id={`note-${r.id}`} className="dinput" rows={3} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)}
                          placeholder="Call notes, availability, anything the team should know" style={{ height: 'auto', padding: '12px 14px', lineHeight: 1.5 }} />
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                          <button type="button" style={pillBtn} onClick={() => setPanel(null)}>Cancel</button>
                          <button type="button" className="neonbtn" style={{ ...neonBtn, height: 40 }} disabled={pending}
                            onClick={() => run(() => setRosterNote(experienceId, r.id, note))}>{pending ? 'Saving…' : 'Save note'}</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editable && roster.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--hairline)', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: lockBlocked ? 'var(--wg-500)' : 'var(--ink)' }}>
            {lockBlocked ?? `${toLock} accepted creator${toLock === 1 ? '' : 's'} ready to lock.`}
          </span>
          <button type="button" className="neonbtn" style={{ ...neonBtn, opacity: lockBlocked ? 0.5 : 1, cursor: lockBlocked ? 'not-allowed' : 'pointer' }}
            disabled={!!lockBlocked || pending} onClick={() => setConfirmLock(true)}>
            Lock roster
          </button>
        </div>
      )}

      <ConfirmDialog open={confirmLock} title="Lock the roster"
        body={`This locks ${toLock} accepted creator${toLock === 1 ? '' : 's'}. Locked creators cannot be changed or removed; you can still add more creators later.${roster.some((r) => r.locked) ? '' : ' The Experience moves to Confirmed.'}`}
        confirmLabel="Lock" busy={pending}
        onConfirm={() => run(() => lockRoster(experienceId), () => setConfirmLock(false))}
        onCancel={() => setConfirmLock(false)} />
      <ConfirmDialog open={!!removing} title={`Remove ${removing?.full_name ?? ''}`} tone="danger"
        body="They come off this Experience's roster, with their plan and note." confirmLabel="Remove" busy={pending}
        onConfirm={() => removing && run(() => removeFromRoster(experienceId, removing.id), () => setRemoving(null))}
        onCancel={() => setRemoving(null)} />

      <style>{`
        @media (max-width: 720px) {
          .xp-rhead { display: none !important; }
          .xp-rrow { grid-template-columns: 40px 1fr 34px !important; }
          .xp-rrow > :nth-child(3), .xp-rrow > :nth-child(4) { grid-column: 2 / 3; }
        }
      `}</style>
    </section>
  )
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
    : <span style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, color: 'var(--ink-soft)', background: '#F7F4FB' }}>{initials}</span>
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="pmi" style={{
      display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'none',
      fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: danger ? '#C4494F' : 'var(--ink)', cursor: 'pointer',
    }}>{children}</button>
  )
}

const kebab = (open: boolean): React.CSSProperties => ({
  width: 34, height: 34, borderRadius: 9, background: open ? 'var(--sec-2)' : 'transparent', border: 'none',
  cursor: 'pointer', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
})
const menuBox: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 190, borderRadius: 12, background: '#FFFFFF',
  boxShadow: '0 4px 16px rgba(22,23,15,.12)', border: '1px solid var(--hairline)', padding: 6, zIndex: 10,
}
