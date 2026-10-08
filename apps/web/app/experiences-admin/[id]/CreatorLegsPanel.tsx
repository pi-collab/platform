'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import StatusChip, { type ChipTone } from '@/components/StatusChip'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { DELIVERABLE_TYPES, countOf, isVideoType } from '@/lib/experience-request'
import { creatorLegTerms } from '@/lib/experience-money'
import { formatPaiseINR } from '@/lib/money'
import type { ConsoleLegRow, ConsoleLegsReconcile } from '@/lib/experience-console-server'
import { draftCreatorLeg, saveCreatorBrief, sendCreatorLegs, setDayRateForCreator } from '../actions'
import { card, fieldLabel, formError, kpiLabel, neonBtn, pillBtn } from '../ui'

/**
 * Creator deals (Leg 2), staff console. One row per locked, accepted creator:
 * their shoot day rate, days, deliverable scope (affiliate as a count of their
 * videos) and, once sent, their frozen terms and answer.
 *
 * Operational view: day rate → days → gross → the creator's track % → net,
 * i.e. what Guapd will pay this creator. No brand price, margin or P&L here.
 *
 * Money previews use creatorLegTerms, the same function the send action uses;
 * the database re-derives every figure at send and refuses a mismatch.
 */
const ANSWER: Record<string, { label: string; tone: ChipTone }> = {
  negotiating: { label: 'Awaiting creator', tone: 'amber' },
  agreed:      { label: 'Creator accepted', tone: 'lime' },
  declined:    { label: 'Creator declined', tone: 'red' },
  cancelled:   { label: 'Cancelled', tone: 'neutral' },
}

type Row = { type: string; count: string }

export default function CreatorLegsPanel({ experienceId, editable, legs, reconcile, brief, affiliateSold }: {
  experienceId: string
  /** Confirmed: legs can be drafted and sent. */
  editable: boolean
  legs: ConsoleLegRow[]
  reconcile: ConsoleLegsReconcile | null
  brief: string | null
  /** Did the brand buy affiliate links at all? */
  affiliateSold: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [days, setDays] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [aff, setAff] = useState('0')
  const [rateFor, setRateFor] = useState<string | null>(null)
  const [rate, setRate] = useState('')
  const [confirm, setConfirm] = useState<ConsoleLegRow[] | null>(null)
  const [briefText, setBriefText] = useState(brief ?? '')
  const [briefOpen, setBriefOpen] = useState(false)

  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, after?: (data: unknown) => void) => {
    setError(null); setNotice(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) { setError(r.error ?? 'Something went wrong'); return }
      after?.(r.data)
      router.refresh()
    })
  }

  const effective = (l: ConsoleLegRow) => l.leg_deliverables ?? l.planned_deliverables ?? []
  const videosOf = (items: { type: string; count: number | string }[]) =>
    items.filter((d) => isVideoType(d.type)).reduce((t, d) => t + (Number(d.count) || 0), 0)

  const openEditor = (l: ConsoleLegRow) => {
    setError(null); setNotice(null); setRateFor(null); setEditing(l.roster_id)
    setDays(l.leg_days != null ? String(l.leg_days) : '1')
    setRows(effective(l).map((d) => ({ type: d.type, count: String(d.count) })))
    setAff(String(l.leg_affiliate_count ?? 0))
  }

  const ready = legs.filter((l) => !l.leg_deal_id && l.leg_product_id && l.leg_product_id === l.day_rate_product_id && l.leg_days != null)
  const sentCount = legs.filter((l) => l.leg_deal_id).length
  const toPlace = reconcile && reconcile.videos_sold != null && reconcile.videos_placed != null ? reconcile.videos_sold - reconcile.videos_placed : 0
  const affToPlace = reconcile?.affiliate_target != null && reconcile.affiliate_placed != null ? reconcile.affiliate_target - reconcile.affiliate_placed : 0

  const termsLine = (rateP: number, d: number, track: 'growth' | 'deals') => {
    const t = creatorLegTerms({ dayRatePaise: rateP, days: d, track })
    return `${formatPaiseINR(rateP)}/day × ${d} = ${formatPaiseINR(t.creatorGrossPaise)} → ${t.platformPct}% → ${formatPaiseINR(t.creatorNetPaise)} to the creator`
  }

  return (
    <section className="surface" style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="sect-head">Creator deals <span style={{ color: 'var(--wg-500)', fontWeight: 500, marginLeft: 6 }}>{sentCount} of {legs.length} sent</span></h2>
          <div className="sect-rule" />
        </div>
        {editable && ready.length > 0 && (
          <button type="button" className="neonbtn" style={neonBtn} disabled={pending} onClick={() => setConfirm(ready)}>
            Send all ready ({ready.length})
          </button>
        )}
      </div>

      {/* ── The ceiling: legs against what the brand bought ── */}
      {reconcile && reconcile.reason !== 'no_agreed_plan' && (
        <div role="status" style={{
          marginTop: 18, padding: '14px 16px', borderRadius: 14,
          background: reconcile.over ? '#FDF0F0' : reconcile.ok ? '#F4FBDC' : '#FCF6E4',
          border: `1px solid ${reconcile.over ? '#C4494F40' : reconcile.ok ? '#8FAF1F40' : '#C89A3C40'}`,
        }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
            {reconcile.over ? 'More than the brand bought' : reconcile.ok ? 'Every video the brand bought is placed' : `${toPlace} video${toPlace === 1 ? '' : 's'} still to place`}
            <span style={{ fontWeight: 500, color: 'var(--ink-soft)', marginLeft: 8 }}>{reconcile.videos_placed} of {reconcile.videos_sold} videos</span>
            {(reconcile.affiliate_target ?? 0) > 0 && (
              <span style={{ fontWeight: 500, color: 'var(--ink-soft)', marginLeft: 8 }}>· {reconcile.affiliate_placed} of {reconcile.affiliate_target} with the affiliate link</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)' }}>
            {(reconcile.lines ?? []).filter((l) => !l.is_video || reconcile.per_type).map((l) => (
              <span key={l.type} style={{ color: l.placed === l.target ? 'var(--ink-soft)' : '#8C6417' }}>{l.type}: {l.placed} / {l.target}</span>
            ))}
          </div>
          {!reconcile.ok && !reconcile.over && (
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: '#8C6417', marginTop: 6 }}>
              {toPlace > 0 ? 'Raise another creator, or add one to the roster. ' : ''}
              {affToPlace > 0 ? `${affToPlace} more video${affToPlace === 1 ? '' : 's'} need the affiliate link. ` : ''}
              The total can never go past what was sold; to move a video from one creator to another, lower one first.
            </div>
          )}
        </div>
      )}

      {/* ── What creators on this Experience are told ── */}
      <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 14, background: '#F7F7F4' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={kpiLabel}>Brief creators see</span>
          {editable && !briefOpen && <button type="button" style={{ ...pillBtn, height: 34 }} onClick={() => setBriefOpen(true)}>{brief ? 'Edit' : 'Write the brief'}</button>}
        </div>
        {briefOpen ? (
          <div style={{ marginTop: 10 }}>
            <textarea className="dinput" rows={4} maxLength={4000} value={briefText} onChange={(e) => setBriefText(e.target.value)}
              aria-label="Brief creators see"
              placeholder="What the shoot is, where to be, what to bring. Creators see exactly this; never the brand's own request or price."
              style={{ height: 'auto', padding: '12px 14px', lineHeight: 1.5 }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" style={pillBtn} onClick={() => { setBriefOpen(false); setBriefText(brief ?? '') }}>Cancel</button>
              <button type="button" className="neonbtn" style={{ ...neonBtn, height: 40 }} disabled={pending}
                onClick={() => run(() => saveCreatorBrief(experienceId, briefText), () => setBriefOpen(false))}>{pending ? 'Saving…' : 'Save brief'}</button>
            </div>
          </div>
        ) : (
          <p className="t-body" style={{ margin: '8px 0 0', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{brief || 'No brief yet. Creators see the shoot date, city and their own scope until you write one.'}</p>
        )}
      </div>

      {error && <div role="alert" style={{ ...formError, marginTop: 14 }}>{error}</div>}
      {notice && <div role="status" style={{ marginTop: 14, padding: '10px 14px', borderRadius: 12, background: '#F4FBDC', fontFamily: 'var(--font-ui)', fontSize: 13 }}>{notice}</div>}

      {legs.length === 0 ? (
        <p className="t-body" style={{ margin: '18px 0 0' }}>No locked creators yet. Lock the roster first.</p>
      ) : (
        <div style={{ marginTop: 10 }}>
          {legs.map((l) => {
            const items = effective(l)
            const videos = videosOf(items)
            const affCount = l.leg_affiliate_count ?? 0
            const sent = !!l.leg_deal_id
            const answer = sent ? ANSWER[l.deal_status ?? 'negotiating'] ?? ANSWER.negotiating : null
            const isEditing = editing === l.roster_id
            const rateStale = !sent && l.leg_product_id && l.leg_product_id !== l.day_rate_product_id
            return (
              <div key={l.roster_id} style={{ borderTop: '1px solid var(--hairline)', padding: '16px 4px' }}>
                <div className="xp-lrow" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.4fr 1.6fr auto', gap: 16, alignItems: 'start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{l.full_name}</div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)', marginTop: 2 }}>
                      {l.handle ? `@${l.handle.replace(/^@/, '')} · ` : ''}{l.track === 'growth' ? 'Growth · 30%' : 'Deals · 15%'}
                    </div>
                  </div>
                  <div className="t-body" style={{ fontSize: 13.5 }}>
                    {items.map((x) => countOf(Number(x.count), x.type)).join(' · ')}
                    {affCount > 0 && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2 }}>{affCount} of {videos} with the affiliate link</div>}
                    {l.leg_deliverables && !sent && <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 2 }}>Adjusted from the plan</div>}
                  </div>
                  <div className="t-body" style={{ fontSize: 13 }}>
                    {sent && l.sent_day_rate_paise != null && l.sent_days != null
                      ? termsLine(l.sent_day_rate_paise, l.sent_days, l.track)
                      : l.day_rate_paise == null
                        ? <span style={{ color: '#8C6417' }}>No shoot day rate set</span>
                        : l.leg_days != null && !rateStale
                          ? termsLine(l.day_rate_paise, l.leg_days, l.track)
                          : <span style={{ color: 'var(--ink-soft)' }}>Day rate {formatPaiseINR(l.day_rate_paise)}. {rateStale ? 'It changed; pick it again.' : 'Set the days.'}</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                    {answer ? <StatusChip label={answer.label} tone={answer.tone} /> : <StatusChip label="Not sent" tone="neutral" />}
                    {sent && l.deal_ref && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--ink-faint)' }}>{l.deal_ref}</span>}
                    {editable && !sent && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button type="button" style={{ ...pillBtn, height: 34 }} onClick={() => { setEditing(null); setRateFor(l.roster_id); setRate(l.day_rate_paise ? String(l.day_rate_paise / 100) : '') }}>
                          {l.day_rate_paise == null ? 'Set day rate' : 'Day rate'}
                        </button>
                        {l.day_rate_paise != null && <button type="button" style={{ ...pillBtn, height: 34 }} onClick={() => openEditor(l)}>Prepare</button>}
                        {ready.includes(l) && (
                          <button type="button" className="neonbtn" style={{ ...neonBtn, height: 34, padding: '0 14px' }} disabled={pending} onClick={() => setConfirm([l])}>Send</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Staff set the day rate on the creator's behalf (audited) ── */}
                {rateFor === l.roster_id && (
                  <div style={{ marginTop: 12, padding: 16, borderRadius: 14, background: '#F7F7F4' }}>
                    <label style={fieldLabel} htmlFor={`rate-${l.roster_id}`}>{l.full_name.split(' ')[0]}&apos;s shoot day rate (₹). Saved to their rate card; they can see and change it.</label>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input id={`rate-${l.roster_id}`} className="dinput" inputMode="numeric" value={rate} placeholder="10000" style={{ maxWidth: 200 }}
                        onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))} />
                      <button type="button" style={pillBtn} onClick={() => setRateFor(null)}>Cancel</button>
                      <button type="button" className="neonbtn" style={{ ...neonBtn, height: 40 }} disabled={pending}
                        onClick={() => run(() => setDayRateForCreator(experienceId, l.creator_id, rate), () => setRateFor(null))}>{pending ? 'Saving…' : 'Save day rate'}</button>
                    </div>
                  </div>
                )}

                {/* ── Prepare: day rate, days, scope ── */}
                {isEditing && (
                  <div style={{ marginTop: 12, padding: 16, borderRadius: 14, background: '#F7F7F4' }}>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <div>
                        <span style={fieldLabel}>Shoot day rate</span>
                        <div className="t-body" style={{ fontSize: 14, height: 46, display: 'flex', alignItems: 'center' }}>{formatPaiseINR(l.day_rate_paise ?? 0)}/day</div>
                      </div>
                      <div style={{ width: 140 }}>
                        <label style={fieldLabel} htmlFor={`days-${l.roster_id}`}>Days</label>
                        <input id={`days-${l.roster_id}`} className="dinput" inputMode="decimal" value={days} onChange={(e) => setDays(e.target.value.replace(/[^0-9.]/g, ''))} />
                      </div>
                      <div style={{ flex: 1, minWidth: 220, alignSelf: 'flex-end', paddingBottom: 12, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)' }}>
                        {(() => {
                          const d = Number(days)
                          try { return d > 0 && l.day_rate_paise ? termsLine(l.day_rate_paise, d, l.track) : 'Days drive the money only, never the deliverables.' }
                          catch { return 'Days need at most two decimals.' }
                        })()}
                      </div>
                    </div>

                    <div style={{ ...kpiLabel, marginTop: 14 }}>{l.full_name.split(' ')[0]} makes (the total for this deal, not per day)</div>
                    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                      {rows.map((p, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10 }}>
                          <select className="dinput" aria-label="Type" value={p.type} style={{ flex: 2 }} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}>
                            {DELIVERABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <input className="dinput" aria-label="How many" inputMode="numeric" value={p.count} style={{ flex: 1 }} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, count: e.target.value.replace(/\D/g, '') } : x))} />
                          <button type="button" style={{ ...pillBtn, height: 46 }} onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
                        </div>
                      ))}
                    </div>
                    <button type="button" style={{ ...pillBtn, marginTop: 10 }} onClick={() => setRows([...rows, { type: DELIVERABLE_TYPES[0], count: '' }])}>+ Add type</button>

                    {affiliateSold && (
                      <div style={{ marginTop: 14, maxWidth: 360 }}>
                        <label style={fieldLabel} htmlFor={`aff-${l.roster_id}`}>Videos with the affiliate link (of {videosOf(rows)})</label>
                        <input id={`aff-${l.roster_id}`} className="dinput" inputMode="numeric" value={aff} onChange={(e) => setAff(e.target.value.replace(/\D/g, ''))} />
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
                      <button type="button" style={pillBtn} onClick={() => setEditing(null)}>Cancel</button>
                      <button type="button" className="neonbtn" style={{ ...neonBtn, height: 40 }} disabled={pending}
                        onClick={() => run(() => draftCreatorLeg(experienceId, {
                          rosterId: l.roster_id, productId: l.day_rate_product_id, days, deliverables: rows, affiliateCount: affiliateSold ? aff : 0,
                        }), () => setEditing(null))}>{pending ? 'Saving…' : 'Save'}</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog open={!!confirm} title={confirm && confirm.length === 1 ? `Send ${confirm[0].full_name} their deal` : `Send ${confirm?.length ?? 0} creators their deals`}
        body={`Each creator gets an offer showing the brand as "Managed by Guapd", their day rate, days, platform fee and what they take home, and their scope. Once sent, the terms are frozen. They are told in the app and by email.`}
        confirmLabel="Send" busy={pending}
        onConfirm={() => confirm && run(() => sendCreatorLegs(experienceId, confirm.map((c) => c.roster_id)), (d) => {
          const res = d as { sent: number; failed: { error: string }[] }
          setConfirm(null)
          if (res.failed.length) setError(res.failed.map((f) => f.error).join(' '))
          if (res.sent) setNotice(`${res.sent} deal${res.sent === 1 ? '' : 's'} sent.`)
        })}
        onCancel={() => setConfirm(null)} />

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 720px) {
          .xp-lrow { grid-template-columns: 1fr !important; }
          .xp-lrow > :last-child { align-items: flex-start !important; }
        }
      ` }} />
    </section>
  )
}
