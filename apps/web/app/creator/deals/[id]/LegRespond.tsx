'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatPaiseINR } from '@/lib/money'
import type { CreatorLegCounter } from '@/lib/creator-leg-money'
import { acceptGuapdCounter, counterLeg, respondToLeg, withdrawMyCounter } from './leg-actions'

/**
 * Answering a Guapd Experience offer: accept, decline, or COUNTER (0542) with
 * a different day rate and/or days, up to 3 times. The platform fee % is the
 * one on the offer and never changes; the deliverables never change. When
 * Guapd counters back, the creator accepts that, counters again or declines.
 * Once both sides agree, the deal is fixed.
 */
export default function LegRespond({ dealId, netLabel, counters = [], countersLeft = 0, dayRatePaise, days, platformPct }: {
  dealId: string
  netLabel: string | null
  counters?: CreatorLegCounter[]
  countersLeft?: number
  /** The offer as it stands. */
  dayRatePaise: number | null
  days: number | null
  platformPct: number | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [mode, setMode] = useState<'answer' | 'decline' | 'counter'>('answer')
  const [reason, setReason] = useState('')
  const [rate, setRate] = useState(dayRatePaise ? String(dayRatePaise / 100) : '')
  const [cDays, setCDays] = useState(days != null ? String(days) : '1')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const openGuapd = counters.find((c) => c.status === 'open' && c.proposed_by === 'guapd')
  const openMine = counters.find((c) => c.status === 'open' && c.proposed_by === 'creator')
  const done = (r: { ok: boolean; message?: string }) => { if (!r.ok) { setError(r.message ?? 'Something went wrong'); return } setMode('answer'); router.refresh() }
  const act = (fn: () => Promise<{ ok: boolean; message?: string }>) => { setError(null); start(async () => done(await fn())) }

  const pct = Number(platformPct ?? 0)
  const preview = (() => {
    const r = Number(rate), d = Number(cDays)
    if (!(r > 0) || !(d > 0)) return null
    const gross = Math.round(r * 100 * d)
    const fee = Math.round((gross * pct) / 100)
    return { gross, fee, net: gross - fee }
  })()

  return (
    <div className="leg-respond">
      {counters.length > 0 && (
        <ul className="leg-counters">
          {counters.map((c) => (
            <li key={c.id} className={c.status === 'open' ? 'leg-counter-open' : ''}>
              <b>{c.proposed_by === 'creator' ? `Your counter ${c.round}` : `Guapd's counter ${c.round}`}</b>: {formatPaiseINR(c.day_rate_paise)}/day × {c.days} → {formatPaiseINR(c.net_paise)} to you
              <span className="leg-counter-status"> · {c.status === 'open' ? (c.proposed_by === 'creator' ? 'waiting for Guapd' : 'waiting for you') : c.status}</span>
              {c.note && <div className="leg-counter-note">“{c.note}”</div>}
              {c.decision_note && <div className="leg-counter-note">Guapd: “{c.decision_note}”</div>}
            </li>
          ))}
        </ul>
      )}

      {mode === 'answer' && (
        <div className="leg-actions">
          {openGuapd ? (
            <button type="button" className="neonbtn leg-accept" disabled={pending} onClick={() => act(() => acceptGuapdCounter(dealId, openGuapd.id))}>
              {pending ? 'Saving…' : `Accept Guapd's offer · ${formatPaiseINR(openGuapd.net_paise)} to you`}
            </button>
          ) : (
            <button type="button" className="neonbtn leg-accept" disabled={pending} onClick={() => act(async () => { const r = await respondToLeg(dealId, true); return r.ok ? { ok: true } : r })}>
              {pending ? 'Saving…' : openMine ? `Accept the offer as sent${netLabel ? ` · ${netLabel}` : ''}` : netLabel ? `Accept · ${netLabel} to you` : 'Accept'}
            </button>
          )}
          {openMine
            ? <button type="button" className="leg-decline" disabled={pending} onClick={() => act(() => withdrawMyCounter(dealId, openMine.id))}>Withdraw my counter</button>
            : countersLeft > 0 && <button type="button" className="leg-decline" disabled={pending} onClick={() => { setError(null); setMode('counter') }}>Counter ({countersLeft} left)</button>}
          <button type="button" className="leg-decline" disabled={pending} onClick={() => setMode('decline')}>Decline</button>
        </div>
      )}

      {mode === 'counter' && (
        <div className="leg-decline-box">
          <div className="leg-counter-fields">
            <label className="leg-label">Your day rate (₹)
              <input className="leg-input" inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="leg-label">Days
              <input className="leg-input" inputMode="decimal" value={cDays} onChange={(e) => setCDays(e.target.value.replace(/[^0-9.]/g, ''))} />
            </label>
          </div>
          {preview && (
            <p className="leg-note">{formatPaiseINR(preview.gross)} → Guapd platform fee ({pct}%) {formatPaiseINR(preview.fee)} → <b>{formatPaiseINR(preview.net)} to you</b>. What you make stays the same.</p>
          )}
          <label htmlFor="leg-counter-note" className="leg-label">Note for Guapd (optional)</label>
          <textarea id="leg-counter-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="leg-textarea"
            placeholder="Two days is more realistic for this scope" />
          <div className="leg-actions">
            <button type="button" className="leg-decline" disabled={pending} onClick={() => setMode('answer')}>Back</button>
            <button type="button" className="neonbtn leg-accept" disabled={pending} onClick={() => act(() => counterLeg(dealId, rate, cDays, note))}>{pending ? 'Sending…' : 'Send counter'}</button>
          </div>
        </div>
      )}

      {mode === 'decline' && (
        <div className="leg-decline-box">
          <label htmlFor="leg-reason" className="leg-label">Anything Guapd should know? (optional)</label>
          <textarea id="leg-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Dates don't work, rate, anything else" className="leg-textarea" />
          <div className="leg-actions">
            <button type="button" className="leg-decline" disabled={pending} onClick={() => setMode('answer')}>Back</button>
            <button type="button" className="leg-decline leg-decline-confirm" disabled={pending}
              onClick={() => act(async () => { const r = await respondToLeg(dealId, false, reason); return r.ok ? { ok: true } : r })}>
              {pending ? 'Saving…' : 'Decline this offer'}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="leg-error">{error}</p>}
    </div>
  )
}
