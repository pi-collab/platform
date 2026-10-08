'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import StatusChip, { type ChipTone } from '@/components/StatusChip'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { ConsoleDeliverables, ConsoleShootLeg } from '@/lib/experience-console-server'
import { scheduleShoot, setShootOutcome, undoShoot, withdrawLeg } from '../actions'
import { card, fieldLabel, formError, kpiLabel, neonBtn, pillBtn } from '../ui'

/**
 * The shoot (staff console, operational). Confirm the shoot once the deals
 * are out, then record each accepted creator's outcome after the shoot date.
 * The Experience moves to Shoot done by itself once every accepted creator
 * has an outcome and at least one shot (experience_shoot_rollup, 0538).
 *
 * "Did not shoot" takes that creator out of the counted P&L creators. No
 * money is shown here.
 */
const ANSWER: Record<string, { label: string; tone: ChipTone }> = {
  negotiating: { label: 'Awaiting creator', tone: 'amber' },
  agreed:      { label: 'Accepted', tone: 'lime' },
  declined:    { label: 'Declined', tone: 'red' },
  cancelled:   { label: 'Withdrawn', tone: 'neutral' },
}

type Ask = { kind: 'confirm' } | { kind: 'no_shoot' | 'undo' | 'withdraw'; leg: ConsoleShootLeg }

export default function ShootPanel({ experienceId, data, shootCity }: { experienceId: string; data: ConsoleDeliverables; shootCity: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [reason, setReason] = useState('')

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) { setError(r.error ?? 'Something went wrong'); return }
      setAsk(null); setReason(''); router.refresh()
    })
  }

  const { status, legs } = data
  const accepted = legs.filter((l) => l.deal_status === 'agreed')
  const awaiting = legs.filter((l) => l.deal_status === 'negotiating')
  const recorded = accepted.filter((l) => l.shoot_outcome)
  const dateReached = !!data.shoot_date && data.shoot_date <= data.today
  const date = data.shoot_date ? new Date(`${data.shoot_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date'
  const canWithdraw = status === 'confirmed' || status === 'shoot_scheduled'
  const outcomesOpen = status === 'shoot_scheduled'
  const undoOpen = status === 'shoot_scheduled' || status === 'shoot_done'

  const headline =
    status === 'confirmed' ? (accepted.length ? `${accepted.length} accepted, ${awaiting.length} still to answer. Confirm the shoot when you are ready.` : 'Waiting for creators to accept their deals.')
    : status === 'shoot_scheduled' ? (dateReached ? `Record how the shoot went: ${recorded.length} of ${accepted.length} recorded${awaiting.length ? `, ${awaiting.length} offer${awaiting.length === 1 ? '' : 's'} still unanswered (withdraw ${awaiting.length === 1 ? 'it' : 'them'} to finish)` : ''}.` : `Scheduled for ${date}. Outcomes are recorded from the shoot date.`)
    : `Shoot done: ${accepted.filter((l) => l.shoot_outcome === 'done').length} of ${accepted.length} accepted creators shot.`

  return (
    <section className="surface" style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="sect-head">The shoot <span style={{ color: 'var(--wg-500)', fontWeight: 500, marginLeft: 6 }}>{date}{shootCity ? ` · ${shootCity}` : ''}</span></h2>
          <div className="sect-rule" />
        </div>
        {status === 'confirmed' && (
          <button type="button" className="neonbtn" style={neonBtn} disabled={pending || accepted.length === 0} onClick={() => { setError(null); setAsk({ kind: 'confirm' }) }}>
            Confirm the shoot
          </button>
        )}
      </div>
      <p className="t-body" style={{ margin: '14px 0 0', fontSize: 13.5 }}>{headline}</p>
      {error && !ask && <div role="alert" style={{ ...formError, marginTop: 12 }}>{error}</div>}

      <div style={{ marginTop: 8 }}>
        {legs.map((l) => {
          const answer = ANSWER[l.deal_status] ?? ANSWER.negotiating
          const outcome = l.shoot_outcome === 'done' ? { label: 'Shot', tone: 'green' as ChipTone } : l.shoot_outcome === 'did_not_shoot' ? { label: 'Did not shoot', tone: 'red' as ChipTone } : null
          return (
            <div key={l.roster_id} className="xp-srow" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.6fr auto', gap: 14, alignItems: 'center', borderTop: '1px solid var(--hairline)', padding: '14px 4px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{l.full_name}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <StatusChip label={answer.label} tone={answer.tone} />
                  {outcome && <StatusChip label={outcome.label} tone={outcome.tone} />}
                </div>
              </div>
              <div className="t-body" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                {l.shoot_outcome === 'did_not_shoot' && <div>Why: {l.shoot_outcome_reason}. Not counted as a creator payout.</div>}
                {l.shoot_outcome === 'done' && (l.work_complete
                  ? <div>Their part is done: they can be paid (see Creator payouts).</div>
                  : <div>Shot. Their part is done once Guapd approves their deliverables.</div>)}
                {!l.shoot_outcome && l.deal_status === 'agreed' && <div>{outcomesOpen ? (dateReached ? 'Did they shoot?' : `From ${date}.`) : 'Recorded after the shoot is confirmed.'}</div>}
                {l.deal_status === 'negotiating' && <div>Has not answered the offer.</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {l.deal_status === 'negotiating' && canWithdraw && (
                  <button type="button" style={{ ...pillBtn, height: 34 }} onClick={() => { setReason(''); setError(null); setAsk({ kind: 'withdraw', leg: l }) }}>Withdraw offer</button>
                )}
                {l.deal_status === 'agreed' && !l.shoot_outcome && outcomesOpen && (
                  <>
                    <button type="button" style={{ ...pillBtn, height: 34 }} disabled={pending || !dateReached}
                      onClick={() => { setReason(''); setError(null); setAsk({ kind: 'no_shoot', leg: l }) }}>Did not shoot</button>
                    <button type="button" className="neonbtn" style={{ ...neonBtn, height: 34, padding: '0 14px' }} disabled={pending || !dateReached}
                      onClick={() => run(() => setShootOutcome(experienceId, l.roster_id, 'done', null))}>Shot</button>
                  </>
                )}
                {l.shoot_outcome && undoOpen && (
                  <button type="button" style={{ ...pillBtn, height: 34 }} onClick={() => { setReason(''); setError(null); setAsk({ kind: 'undo', leg: l }) }}>Undo</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <ConfirmDialog open={ask?.kind === 'confirm'} title="Confirm the shoot"
        body={`Locks the shoot for ${date}${shootCity ? ` in ${shootCity}` : ''} with the ${accepted.length} creator${accepted.length === 1 ? '' : 's'} who accepted. No more creators can be added after this. Offers still unanswered can be withdrawn.`}
        detail={error ? <div role="alert" style={{ ...formError, marginTop: 10 }}>{error}</div> : undefined}
        confirmLabel="Confirm the shoot" busy={pending} onConfirm={() => run(() => scheduleShoot(experienceId))} onCancel={() => setAsk(null)} />

      <ConfirmDialog open={!!ask && ask.kind !== 'confirm'} tone={ask?.kind === 'no_shoot' || ask?.kind === 'withdraw' ? 'danger' : undefined}
        title={ask && ask.kind !== 'confirm' ? (ask.kind === 'no_shoot' ? `${ask.leg.full_name} did not shoot` : ask.kind === 'undo' ? `Undo ${ask.leg.full_name}'s outcome` : `Withdraw ${ask.leg.full_name}'s offer`) : ''}
        body={ask?.kind === 'no_shoot' ? 'They are taken out of the creators Guapd pays on this Experience. You can undo this until their content is shared with the brand.'
          : ask?.kind === 'undo' ? 'Clears the outcome so it can be recorded again. If the shoot was marked done, it goes back to Scheduled.'
          : 'The creator is told the offer is withdrawn. The offer cannot be re-sent yet.'}
        detail={<div style={{ marginTop: 12 }}><label style={fieldLabel} htmlFor="shoot-why">Why</label>
          <input id="shoot-why" className="dinput" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder={ask?.kind === 'no_shoot' ? 'Fell ill on the day' : ask?.kind === 'withdraw' ? 'No reply before the shoot' : 'Recorded against the wrong creator'} />
          {error && <div role="alert" style={{ ...formError, marginTop: 10 }}>{error}</div>}</div>}
        confirmLabel={ask?.kind === 'withdraw' ? 'Withdraw' : ask?.kind === 'undo' ? 'Undo' : 'Record'} busy={pending}
        onConfirm={() => {
          if (!ask || ask.kind === 'confirm') return
          const l = ask.leg
          if (ask.kind === 'no_shoot') run(() => setShootOutcome(experienceId, l.roster_id, 'did_not_shoot', reason))
          else if (ask.kind === 'undo') run(() => undoShoot(experienceId, l.roster_id, reason))
          else run(() => withdrawLeg(experienceId, l.roster_id, l.deal_id, reason))
        }}
        onCancel={() => setAsk(null)} />

      <div style={{ ...kpiLabel, marginTop: 12, fontSize: 10.5 }}>Every change here is recorded</div>
      <style dangerouslySetInnerHTML={{ __html: '@media (max-width: 720px) { .xp-srow { grid-template-columns: 1fr !important; } .xp-srow > :last-child { justify-content: flex-start !important; } }' }} />
    </section>
  )
}
