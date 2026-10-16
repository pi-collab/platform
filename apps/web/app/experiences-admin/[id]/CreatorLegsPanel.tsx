'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import StatusChip, { type ChipTone } from '@/components/StatusChip'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { DELIVERABLE_TYPES, countOf, isVideoType } from '@/lib/experience-request'
import { creatorLegTerms } from '@/lib/experience-money'
import { formatPaiseINR } from '@/lib/money'
import type { ConsoleCounter, ConsoleLegRow, ConsoleLegsReconcile } from '@/lib/experience-console-server'
import { acceptCreatorCounter, declineCreatorCounter, draftCreatorLeg, rescopeCreatorLeg, sendCreatorLegs, sendGuapdCounter, setDayRateForCreator, withdrawGuapdCounterAction } from '../actions'
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
 *
 * 0542: while a creator's own rate is paused (or never set) staff ENTER a
 * rate on the deal, never a second package rate. Once sent and still open,
 * the creator may counter (rate and/or days, 3 rounds each way) and Guapd may
 * accept, decline or counter back. A counter that RAISES what Guapd pays needs
 * financial access (the database refuses otherwise); lowering or holding,
 * operational. The fee % and the deliverables never change; once agreed, frozen.
 */
const ANSWER: Record<string, { label: string; tone: ChipTone }> = {
  negotiating: { label: 'Awaiting creator', tone: 'amber' },
  agreed:      { label: 'Creator accepted', tone: 'lime' },
  paid:        { label: 'Paid', tone: 'neutral' },
  declined:    { label: 'Creator declined', tone: 'red' },
  cancelled:   { label: 'Cancelled', tone: 'neutral' },
}

type Row = { type: string; count: string }

/** A Send that cannot go yet: visible, greyed, with the reason beside it. */
const offBtn = { opacity: 0.4, cursor: 'not-allowed', boxShadow: 'none' } as const
const hint = { fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)' } as const

export default function CreatorLegsPanel({ experienceId, editable, canRescope = editable, legs, reconcile, affiliateSold, adRightsSold = false, boostSold = false, boughtPer = { affiliate: null, adRights: null, boost: null }, counters = [], canRaise = false }: {
  experienceId: string
  /** Confirmed: legs can be drafted and sent. */
  editable: boolean
  /** Sent counts are re-split only while Confirmed (frozen once the shoot is scheduled). */
  canRescope?: boolean
  legs: ConsoleLegRow[]
  reconcile: ConsoleLegsReconcile | null
  /** Did the brand buy affiliate links at all? */
  affiliateSold: boolean
  /** 0546: did the brand buy ad rights / boosting? (Per-creator counts follow.) */
  adRightsSold?: boolean
  boostSold?: boolean
  /** 0547: what the brand bought PER CREATOR, the cap for a re-split. */
  boughtPer?: { affiliate: number | null; adRights: number | null; boost: number | null }
  /** 0542: counters on sent, open deals. */
  counters?: ConsoleCounter[]
  /** Financial access: may accept or send a counter that raises the cost. */
  canRaise?: boolean
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
  const [adCount, setAdCount] = useState('')
  const [boostCount, setBoostCount] = useState('')
  const [allowance, setAllowance] = useState('')
  const [resplitFor, setResplitFor] = useState<string | null>(null)
  const [rs, setRs] = useState({ affiliate: '', adRights: '', boost: '' })
  const [entered, setEntered] = useState('')
  const [counterFor, setCounterFor] = useState<string | null>(null)
  const [cRate, setCRate] = useState('')
  const [cDays, setCDays] = useState('')
  const [cNote, setCNote] = useState('')
  const [declining, setDeclining] = useState<ConsoleCounter | null>(null)
  const [declineNote, setDeclineNote] = useState('')

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
    // 0547: blank until someone states it; a missing count is refused, never saved as 0 or "all".
    setAff(l.leg_affiliate_count != null ? String(l.leg_affiliate_count) : '')
    setAdCount(l.leg_ad_rights_count != null ? String(l.leg_ad_rights_count) : '')
    setBoostCount(l.leg_boost_count != null ? String(l.leg_boost_count) : '')
    setAllowance(l.leg_allowance_paise ? String(l.leg_allowance_paise / 100) : '')
    setEntered(l.leg_entered_rate_paise != null ? String(l.leg_entered_rate_paise / 100) : l.paused_rate_paise != null ? String(l.paused_rate_paise / 100) : '')
  }
  const draftRate = (l: ConsoleLegRow) => l.leg_entered_rate_paise ?? (l.leg_product_id && l.leg_product_id === l.day_rate_product_id ? l.day_rate_paise : null)

  const ready = legs.filter((l) => !l.leg_deal_id && l.leg_days != null
    && !(affiliateSold && l.leg_affiliate_count == null) && !(adRightsSold && l.leg_ad_rights_count == null) && !(boostSold && l.leg_boost_count == null)
    && ((l.leg_product_id && l.leg_product_id === l.day_rate_product_id) || (l.leg_entered_rate_paise != null && l.day_rate_product_id == null)))
  const sentCount = legs.filter((l) => l.leg_deal_id).length
  const unsent = legs.filter((l) => !l.leg_deal_id)
  // Why an unsent deal cannot go yet; null when it is ready to send.
  const missing = (l: ConsoleLegRow): string | null => {
    if (l.leg_deal_id || ready.includes(l)) return null
    if (l.day_rate_paise == null && l.leg_entered_rate_paise == null) return l.paused_rate_paise != null ? 'Prepare: enter a rate for this deal' : 'Set a day rate, then prepare'
    if (l.leg_days == null) return 'Prepare: days and what they make'
    if ((affiliateSold && l.leg_affiliate_count == null) || (adRightsSold && l.leg_ad_rights_count == null) || (boostSold && l.leg_boost_count == null))
      return 'Prepare: state the affiliate, ad-rights and boost counts'
    return 'Their rate changed: prepare again'
  }
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
        {editable && unsent.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <button type="button" className="neonbtn" style={{ ...neonBtn, ...(ready.length ? null : offBtn) }} disabled={pending || ready.length === 0}
              onClick={() => setConfirm(ready)}>
              {ready.length === unsent.length ? `Send all (${ready.length})` : `Send all ready (${ready.length})`}
            </button>
            {ready.length < unsent.length && (
              <span style={hint}>{ready.length} of {unsent.length} ready. Prepare the rest to send them.</span>
            )}
          </div>
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
            {adRightsSold && (
              <span style={{ fontWeight: 500, color: 'var(--ink-soft)', marginLeft: 8 }}>· {reconcile.ad_rights_placed} of {reconcile.ad_rights_target} with ad rights</span>
            )}
            {boostSold && (
              <span style={{ fontWeight: 500, color: 'var(--ink-soft)', marginLeft: 8 }}>· {reconcile.boost_placed} of {reconcile.boost_target} boosted</span>
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
                    {adRightsSold && l.leg_ad_rights_count != null && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2 }}>{l.leg_ad_rights_count} of {videos} with ad rights</div>}
                    {boostSold && l.leg_boost_count != null && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2 }}>{l.leg_boost_count} of {videos} boosted</div>}
                    {l.leg_deliverables && !sent && <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 2 }}>Adjusted from the plan</div>}
                  </div>
                  <div className="t-body" style={{ fontSize: 13 }}>
                    {sent && l.sent_day_rate_paise != null && l.sent_days != null
                      ? <>{termsLine(l.sent_day_rate_paise, l.sent_days, l.track)}{l.sent_rate_source === 'entered' && <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>Rate entered for this deal</div>}
                          {(l.sent_allowance_paise ?? 0) > 0 && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2 }}>+ {formatPaiseINR(l.sent_allowance_paise as number)} allowance (no fee)</div>}</>
                      : draftRate(l) != null && l.leg_days != null
                        ? <>{termsLine(draftRate(l) as number, l.leg_days, l.track)}{l.leg_entered_rate_paise != null && <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>Rate entered for this deal</div>}
                            {(l.leg_allowance_paise ?? 0) > 0 && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2 }}>+ {formatPaiseINR(l.leg_allowance_paise as number)} allowance (no fee)</div>}</>
                        : l.day_rate_paise == null
                          ? <span style={{ color: '#8C6417' }}>{l.paused_rate_paise != null ? `Their day rate (${formatPaiseINR(l.paused_rate_paise)}) is paused. Enter a rate for this deal.` : 'No shoot day rate set'}</span>
                          : <span style={{ color: 'var(--ink-soft)' }}>Day rate {formatPaiseINR(l.day_rate_paise)}. {rateStale ? 'It changed; pick it again.' : 'Set the days.'}</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                    {answer ? <StatusChip label={answer.label} tone={answer.tone} /> : <StatusChip label="Not sent" tone="neutral" />}
                    {sent && l.deal_ref && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--ink-faint)' }}>{l.deal_ref}</span>}
                    {/* 0547: sent, shoot not confirmed: a re-split of labels only, never above what was bought. */}
                    {canRescope && sent && (l.deal_status === 'negotiating' || l.deal_status === 'agreed') && (affiliateSold || adRightsSold || boostSold) && resplitFor !== l.roster_id && (
                      <button type="button" style={{ ...pillBtn, height: 32 }} onClick={() => { setError(null); setResplitFor(l.roster_id); setRs({ affiliate: String(l.leg_affiliate_count ?? 0), adRights: String(l.leg_ad_rights_count ?? 0), boost: String(l.leg_boost_count ?? 0) }) }}>Re-split</button>
                    )}
                    {editable && !sent && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {l.paused_rate_paise == null && (
                          <button type="button" style={{ ...pillBtn, height: 34 }} onClick={() => { setEditing(null); setRateFor(l.roster_id); setRate(l.day_rate_paise ? String(l.day_rate_paise / 100) : '') }}>
                            {l.day_rate_paise == null ? 'Set day rate' : 'Day rate'}
                          </button>
                        )}
                        <button type="button" style={{ ...pillBtn, height: 34 }} onClick={() => openEditor(l)}>Prepare</button>
                        <button type="button" className="neonbtn" style={{ ...neonBtn, height: 34, padding: '0 14px', ...(missing(l) ? offBtn : null) }}
                          disabled={pending || !!missing(l)} title={missing(l) ?? undefined} onClick={() => setConfirm([l])}>Send</button>
                      </div>
                    )}
                    {editable && missing(l) && <span style={{ ...hint, textAlign: 'right' }}>{missing(l)}</span>}
                  </div>
                </div>

                {/* ── 0542: counters on an open, sent deal ── */}
                {sent && (() => {
                  const mine = counters.filter((c) => c.deal_id === l.leg_deal_id)
                  if (mine.length === 0 && l.deal_status !== 'negotiating') return null
                  const open = mine.find((c) => c.status === 'open')
                  const guapdUsed = mine.filter((c) => c.proposed_by === 'guapd').length
                  const negotiating = l.deal_status === 'negotiating'
                  return (
                    <div style={{ marginTop: 12, padding: 14, borderRadius: 14, background: '#F7F7F4' }}>
                      {mine.length > 0 && (
                        <div style={{ display: 'grid', gap: 6 }}>
                          {mine.map((c) => (
                            <div key={c.id} style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: c.status === 'open' ? 'var(--ink)' : 'var(--ink-soft)' }}>
                              <b>{c.proposed_by === 'creator' ? `${l.full_name.split(' ')[0]}'s counter` : "Guapd's counter"} {c.round}</b>: {formatPaiseINR(c.day_rate_paise)}/day × {c.days} = {formatPaiseINR(c.gross_paise)} → {Number(c.platform_pct)}% → {formatPaiseINR(c.net_paise)}
                              {' · '}{c.status === 'open' ? 'waiting' : c.status}{c.note ? ` · “${c.note}”` : ''}
                              {c.status === 'open' && c.direction === 'raises' && <span style={{ color: '#9C4147' }}> · raises what Guapd pays{canRaise ? '' : ' (finance only)'}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {negotiating && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: mine.length ? 10 : 0 }}>
                          {open?.proposed_by === 'creator' && <>
                            <button type="button" className="neonbtn" style={{ ...neonBtn, height: 34, padding: '0 14px', opacity: open.direction === 'raises' && !canRaise ? 0.45 : 1 }}
                              disabled={pending || (open.direction === 'raises' && !canRaise)} title={open.direction === 'raises' && !canRaise ? 'Raising the cost needs finance' : undefined}
                              onClick={() => run(() => acceptCreatorCounter(experienceId, open.id, l.leg_deal_id as string, open.gross_paise), () => setNotice(`${l.full_name}'s counter accepted: their deal is agreed at those terms.`))}>Accept counter</button>
                            <button type="button" style={{ ...pillBtn, height: 34 }} onClick={() => { setDeclineNote(''); setDeclining(open) }}>Decline</button>
                          </>}
                          {open?.proposed_by === 'guapd' && <button type="button" style={{ ...pillBtn, height: 34 }} disabled={pending} onClick={() => run(() => withdrawGuapdCounterAction(experienceId, open.id))}>Withdraw Guapd&apos;s counter</button>}
                          {open?.proposed_by !== 'guapd' && guapdUsed < 3 && (
                            <button type="button" style={{ ...pillBtn, height: 34 }} onClick={() => { setCounterFor(l.roster_id); setCRate(String((l.sent_day_rate_paise ?? 0) / 100)); setCDays(String(l.sent_days ?? 1)); setCNote('') }}>
                              Counter ({3 - guapdUsed} left)
                            </button>
                          )}
                        </div>
                      )}
                      {counterFor === l.roster_id && negotiating && (
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
                          <label style={{ width: 150 }}><span style={fieldLabel}>Day rate (₹)</span><input className="dinput" inputMode="numeric" value={cRate} onChange={(e) => setCRate(e.target.value.replace(/\D/g, ''))} /></label>
                          <label style={{ width: 110 }}><span style={fieldLabel}>Days</span><input className="dinput" inputMode="decimal" value={cDays} onChange={(e) => setCDays(e.target.value.replace(/[^0-9.]/g, ''))} /></label>
                          <label style={{ flex: 1, minWidth: 200 }}><span style={fieldLabel}>Note (optional)</span><input className="dinput" maxLength={500} value={cNote} onChange={(e) => setCNote(e.target.value)} /></label>
                          <button type="button" style={pillBtn} onClick={() => setCounterFor(null)}>Cancel</button>
                          <button type="button" className="neonbtn" style={{ ...neonBtn, height: 40 }} disabled={pending}
                            onClick={() => run(() => sendGuapdCounter(experienceId, l.leg_deal_id as string, cRate, cDays, cNote), () => { setCounterFor(null); setNotice('Counter sent. The creator is told.') })}>Send counter</button>
                          {Number(cRate) * Number(cDays) * 100 > (l.sent_gross_paise ?? 0) && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: '#9C4147', width: '100%' }}>This raises what Guapd pays{canRaise ? '.' : ': it needs finance.'}</span>}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* ── 0547: re-split a sent leg (labels only) ── */}
                {resplitFor === l.roster_id && (
                  <div style={{ marginTop: 12, padding: 16, borderRadius: 14, background: '#F7F7F4' }}>
                    <div style={{ ...kpiLabel }}>Re-split {l.full_name.split(' ')[0]}&apos;s {videos} video{videos === 1 ? '' : 's'}</div>
                    <p className="t-body" style={{ margin: '6px 0 0', fontSize: 12.5 }}>Move videos between plain, affiliate, ad rights and boost, or lower a count. Their pay and the fee do not change. Never above what the brand bought per creator; more scope is a new brand invoice and, for extra work, a new or topped-up creator deal. They are told.</p>
                    <div className="xp-scope">
                      {affiliateSold && <div><label style={fieldLabel} htmlFor={`rs-aff-${l.roster_id}`}>Affiliate link (bought {boughtPer.affiliate ?? 0})</label>
                        <input id={`rs-aff-${l.roster_id}`} className="dinput" inputMode="numeric" value={rs.affiliate} onChange={(e) => setRs({ ...rs, affiliate: e.target.value.replace(/\D/g, '') })} /></div>}
                      {adRightsSold && <div><label style={fieldLabel} htmlFor={`rs-ad-${l.roster_id}`}>Ad rights (bought {boughtPer.adRights ?? 0})</label>
                        <input id={`rs-ad-${l.roster_id}`} className="dinput" inputMode="numeric" value={rs.adRights} onChange={(e) => setRs({ ...rs, adRights: e.target.value.replace(/\D/g, '') })} /></div>}
                      {boostSold && <div><label style={fieldLabel} htmlFor={`rs-boost-${l.roster_id}`}>Boosted (bought {boughtPer.boost ?? 0})</label>
                        <input id={`rs-boost-${l.roster_id}`} className="dinput" inputMode="numeric" value={rs.boost} onChange={(e) => setRs({ ...rs, boost: e.target.value.replace(/\D/g, '') })} /></div>}
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
                      <button type="button" style={pillBtn} onClick={() => setResplitFor(null)}>Cancel</button>
                      <button type="button" className="neonbtn" style={{ ...neonBtn, height: 40 }} disabled={pending}
                        onClick={() => run(() => rescopeCreatorLeg(experienceId, l.roster_id,
                          { affiliate: affiliateSold ? rs.affiliate : 0, adRights: adRightsSold ? rs.adRights : 0, boost: boostSold ? rs.boost : 0 },
                          { affiliate: l.leg_affiliate_count ?? 0, ad_rights: l.leg_ad_rights_count ?? 0, boost: l.leg_boost_count ?? 0 }),
                          () => { setResplitFor(null); setNotice(`${l.full_name}'s split updated. They are told; their pay is unchanged.`) })}>{pending ? 'Saving…' : 'Save split'}</button>
                    </div>
                  </div>
                )}

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
                      {l.day_rate_paise != null ? (
                        <div>
                          <span style={fieldLabel}>Shoot day rate</span>
                          <div className="t-body" style={{ fontSize: 14, height: 46, display: 'flex', alignItems: 'center' }}>{formatPaiseINR(l.day_rate_paise)}/day</div>
                        </div>
                      ) : (
                        <div style={{ width: 200 }}>
                          <label style={fieldLabel} htmlFor={`entered-${l.roster_id}`}>Day rate for this deal (₹)</label>
                          <input id={`entered-${l.roster_id}`} className="dinput" inputMode="numeric" value={entered} onChange={(e) => setEntered(e.target.value.replace(/\D/g, ''))} />
                        </div>
                      )}
                      <div style={{ width: 140 }}>
                        <label style={fieldLabel} htmlFor={`days-${l.roster_id}`}>Days</label>
                        <input id={`days-${l.roster_id}`} className="dinput" inputMode="decimal" value={days} onChange={(e) => setDays(e.target.value.replace(/[^0-9.]/g, ''))} />
                      </div>
                      <div style={{ flex: 1, minWidth: 220, alignSelf: 'flex-end', paddingBottom: 12, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)' }}>
                        {(() => {
                          const d = Number(days)
                          const rp = l.day_rate_paise ?? (Number(entered) > 0 ? Number(entered) * 100 : null)
                          try { return d > 0 && rp ? termsLine(rp, d, l.track) : 'Days drive the money only, never the deliverables.' }
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

                    {(affiliateSold || adRightsSold || boostSold) && (
                      <div className="xp-scope">
                        {affiliateSold && (
                          <div>
                            <label style={fieldLabel} htmlFor={`aff-${l.roster_id}`}>With the affiliate link (of {videosOf(rows)})</label>
                            <input id={`aff-${l.roster_id}`} className="dinput" inputMode="numeric" value={aff} placeholder={`Required · bought ${boughtPer.affiliate ?? 0} each`} onChange={(e) => setAff(e.target.value.replace(/\D/g, ''))} />
                          </div>
                        )}
                        {adRightsSold && (
                          <div>
                            <label style={fieldLabel} htmlFor={`ad-${l.roster_id}`}>With ad rights{reconcile?.ad_rights_months ? `, ${reconcile.ad_rights_months} mo` : ''} (of {videosOf(rows)})</label>
                            <input id={`ad-${l.roster_id}`} className="dinput" inputMode="numeric" value={adCount} placeholder={`Required · bought ${boughtPer.adRights ?? 0} each`}
                              onChange={(e) => setAdCount(e.target.value.replace(/\D/g, ''))} />
                          </div>
                        )}
                        {boostSold && (
                          <div>
                            <label style={fieldLabel} htmlFor={`boost-${l.roster_id}`}>Boosted{reconcile?.boost_months ? `, ${reconcile.boost_months} mo` : ''} (of {videosOf(rows)})</label>
                            <input id={`boost-${l.roster_id}`} className="dinput" inputMode="numeric" value={boostCount} placeholder={`Required · bought ${boughtPer.boost ?? 0} each`}
                              onChange={(e) => setBoostCount(e.target.value.replace(/\D/g, ''))} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* 0546: paid to the creator in full, outside day rate × days: no platform fee on it. */}
                    <div className="xp-scope" style={{ marginTop: 14 }}>
                      <div>
                        <label style={fieldLabel} htmlFor={`allow-${l.roster_id}`}>Travel / other allowance (₹, no fee)</label>
                        <input id={`allow-${l.roster_id}`} className="dinput" inputMode="numeric" value={allowance} placeholder="None"
                          onChange={(e) => setAllowance(e.target.value.replace(/\D/g, ''))} />
                      </div>
                      <div className="xp-scope-note" style={{ paddingBottom: 12, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)' }}>
                        {Number(allowance) > 0 ? `Paid in full on top of their net: +${formatPaiseINR(Number(allowance) * 100)}` : 'Paid in full on top of their net. The platform fee never applies to it.'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
                      <button type="button" style={pillBtn} onClick={() => setEditing(null)}>Cancel</button>
                      <button type="button" className="neonbtn" style={{ ...neonBtn, height: 40 }} disabled={pending}
                        onClick={() => run(() => draftCreatorLeg(experienceId, {
                          rosterId: l.roster_id, productId: l.day_rate_paise != null ? l.day_rate_product_id : null, days, deliverables: rows, affiliateCount: affiliateSold ? aff : 0,
                          enteredRate: l.day_rate_paise == null ? entered : null,
                          adRightsCount: adRightsSold ? adCount : 0, boostCount: boostSold ? boostCount : 0, allowance,
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
        body={`Each creator gets an offer showing the brand as "Managed by Guapd", their day rate, days, platform fee and what they take home, any allowance (no fee), their scope and their brief. Once sent, the terms are frozen; the brief stays editable until the shoot is confirmed. They are told in the app and by email.`}
        confirmLabel="Send" busy={pending}
        onConfirm={() => confirm && run(() => sendCreatorLegs(experienceId, confirm.map((c) => c.roster_id)), (d) => {
          const res = d as { sent: number; failed: { error: string }[] }
          setConfirm(null)
          if (res.failed.length) setError(res.failed.map((f) => f.error).join(' '))
          if (res.sent) setNotice(`${res.sent} deal${res.sent === 1 ? '' : 's'} sent.`)
        })}
        onCancel={() => setConfirm(null)} />

      <ConfirmDialog open={!!declining} title="Decline the creator's counter" tone="danger"
        body="The offer as sent stays open: they can accept it, counter again or decline. They are told in the app and by email."
        detail={<div style={{ marginTop: 12 }}><label style={fieldLabel} htmlFor="decline-note">Note for the creator (optional)</label>
          <input id="decline-note" className="dinput" maxLength={500} value={declineNote} onChange={(e) => setDeclineNote(e.target.value)} placeholder="The brand's budget is fixed for this shoot" /></div>}
        confirmLabel="Decline counter" busy={pending}
        onConfirm={() => declining && run(() => declineCreatorCounter(experienceId, declining.id, declining.deal_id, declineNote), () => setDeclining(null))}
        onCancel={() => setDeclining(null)} />

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 720px) {
          .xp-lrow { grid-template-columns: 1fr !important; }
          .xp-lrow > :last-child { align-items: flex-start !important; }
        }
        .xp-scope { display: flex; flex-wrap: wrap; gap: 12px 16px; margin-top: 14px; align-items: flex-end; }
        .xp-scope > div { width: 250px; max-width: 100%; }
        .xp-scope > .xp-scope-note { width: auto; flex: 1; min-width: 220px; }
      ` }} />
    </section>
  )
}
