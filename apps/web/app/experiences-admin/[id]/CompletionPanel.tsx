'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { CHANNELS, channelLabel } from '@/lib/experience-request'
import type { ConsoleCompletion } from '@/lib/experience-console-server'
import { clearBrandSignoffAction, completeExperience, saveBrandSignoff } from '../actions'
import { card, fieldLabel, formError, kpiLabel, neonBtn, pillBtn } from '../ui'

/**
 * Completing an Experience (staff console, operational). Two-party sign-off,
 * gated in Postgres (experience_console_complete, 0540):
 *
 *   1. the brand has approved what was sold (deliverables readiness)
 *   2. every invoice issued is paid in full, and no draft is left
 *   3. every creator who shot has been paid
 *   4. the brand has signed off (recorded by staff, with the channel)
 *   5. Guapd signs off: the Complete action itself
 *
 * Complete freezes the P&L. Reopening is finance-only and clears BOTH
 * sign-offs, so they are given again.
 */
const SIGNOFF_CHANNELS = CHANNELS
const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export default function CompletionPanel({ experienceId, data }: { experienceId: string; data: ConsoleCompletion }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [channel, setChannel] = useState('email')
  const [note, setNote] = useState('')
  const [ask, setAsk] = useState<'signoff' | 'clear' | 'complete' | null>(null)
  const [reason, setReason] = useState('')
  const complete = data.status === 'complete'
  const delivering = data.status === 'delivering'

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) { setError(r.error ?? 'Something went wrong'); return }
      setAsk(null); router.refresh()
    })
  }

  const rows: { ok: boolean; label: string; detail: string }[] = [
    { ok: data.deliverables_ok, label: 'Deliverables approved as sold', detail: data.deliverables_ok ? 'The brand approved everything sold' : 'Waiting on brand approvals (see Deliverables)' },
    { ok: data.invoices_ok, label: 'Invoices paid', detail: data.invoices_live === 0 ? 'No invoice issued yet' : data.invoices_unpaid > 0 ? `${data.invoices_unpaid} not fully paid` : data.invoices_draft > 0 ? `${data.invoices_draft} draft left` : `${data.invoices_live} issued, all paid` },
    { ok: data.payouts_ok, label: 'Creators paid', detail: `${data.creators_paid} of ${data.creators_to_pay} paid` },
    { ok: data.brand_signed_off, label: 'Brand sign-off', detail: data.brand_signed_off ? `Recorded ${fmt(data.brand_signoff_at)} via ${channelLabel(data.brand_signoff_channel ?? '')}${data.brand_signoff_by_name ? ` by ${data.brand_signoff_by_name}` : ''}` : 'Not yet' },
    { ok: !!data.guapd_signoff_at, label: 'Guapd sign-off', detail: data.guapd_signoff_at ? `Completed ${fmt(data.guapd_signoff_at)}${data.guapd_signoff_by_name ? ` by ${data.guapd_signoff_by_name}` : ''}` : 'Given by completing, once everything above is done' },
  ]

  return (
    <section className="surface" style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="sect-head">Completion</h2>
          <div className="sect-rule" />
        </div>
        <span style={{ ...kpiLabel, fontSize: 10.5 }}>{complete ? 'Complete' : data.can_complete ? 'Ready to complete' : 'Not ready'}</span>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gap: 2 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', gap: 10, padding: '9px 0', borderTop: '1px solid var(--hairline)' }}>
            <span aria-hidden style={{ width: 18, height: 18, borderRadius: 999, marginTop: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
              background: r.ok ? 'var(--lime-400)' : '#EFEFE8', color: r.ok ? 'var(--lime-950)' : 'var(--ink-faint)' }}>{r.ok ? '✓' : ''}</span>
            <div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{r.label}</div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>{r.detail}</div>
            </div>
          </div>
        ))}
      </div>
      {data.brand_signoff_note && <p className="t-body" style={{ margin: '8px 0 0', fontSize: 12.5 }}>Brand said: “{data.brand_signoff_note}”</p>}

      {delivering && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {!data.brand_signed_off
            ? <button type="button" style={pillBtn} onClick={() => { setNote(''); setAsk('signoff') }}>Record brand sign-off</button>
            : <button type="button" style={{ ...pillBtn, color: '#9C4147' }} onClick={() => { setReason(''); setAsk('clear') }}>Clear brand sign-off</button>}
          <button type="button" style={{ ...neonBtn, height: 40, opacity: data.can_complete ? 1 : 0.45 }} disabled={!data.can_complete || pending} onClick={() => setAsk('complete')}>Complete (Guapd sign-off)</button>
        </div>
      )}
      {delivering && !data.can_complete && data.blockers.length > 0 && (
        <p className="t-body" style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--ink-soft)' }}>To complete: {data.blockers.filter((b) => !/from Delivering/.test(b)).join('; ')}.</p>
      )}
      {error && <div role="alert" style={{ ...formError, marginTop: 12 }}>{error}</div>}

      <ConfirmDialog open={ask === 'signoff'} title="Record the brand's sign-off"
        body="The brand has told Guapd the Experience is done on their side. Record how they said it."
        detail={<div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <label><span style={fieldLabel}>How they told us</span>
            <select className="dinput" value={channel} onChange={(e) => setChannel(e.target.value)}>{SIGNOFF_CHANNELS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label><span style={fieldLabel}>Note (optional)</span>
            <input className="dinput" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="All good from our side, thanks" /></label>
        </div>}
        confirmLabel="Record sign-off" busy={pending}
        onConfirm={() => run(() => saveBrandSignoff(experienceId, channel, note || null))} onCancel={() => setAsk(null)} />
      <ConfirmDialog open={ask === 'clear'} title="Clear the brand's sign-off" tone="danger" body="The brand will need to sign off again before this can be completed. Your reason is recorded."
        detail={<div style={{ marginTop: 12 }}><label style={fieldLabel} htmlFor="so-why">Why</label>
          <input id="so-why" className="dinput" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recorded against the wrong Experience" /></div>}
        confirmLabel="Clear sign-off" busy={pending}
        onConfirm={() => run(() => clearBrandSignoffAction(experienceId, reason))} onCancel={() => setAsk(null)} />
      <ConfirmDialog open={ask === 'complete'} title="Complete this Experience"
        body="This is Guapd's sign-off. It freezes the P&L. A late change needs finance to reopen it, which clears both sign-offs. All of it is recorded."
        confirmLabel="Complete" busy={pending}
        onConfirm={() => run(() => completeExperience(experienceId))} onCancel={() => setAsk(null)} />
    </section>
  )
}
