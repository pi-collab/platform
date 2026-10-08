'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import StatusChip, { type ChipTone } from '@/components/StatusChip'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { formatRupees } from '@/lib/experience-request'
import type { ConsolePayoutLeg, ConsolePayouts, PayoutAccount } from '@/lib/experience-console-server'
import { approveCreatorPayout, cancelCreatorPayout, recordCreatorPayoutPaid, requestCreatorPayout, setCreatorPayoutTds, showPayoutAccount } from '../actions'
import { openFinanceFileInTab, uploadFinanceFile } from './finance-upload'
import { card, fieldLabel, formError, kpiLabel, neonBtn, pillBtn } from '../ui'

/**
 * Creator payouts (staff console, operational). Manual for now: Guapd pays
 * outside the app, then records the transfer here with its reference and proof.
 *
 *   eligible (shot, their part complete) → request (operational; TDS entered, 0 by default)
 *   → approve (FINANCE, and a DIFFERENT person: maker-checker, in Postgres)
 *   → record paid (finance: date, method, UTR, proof) → the creator is told.
 *
 * Bank details (0542): operational staff see them masked (••••1234); only
 * finance opens them in full, to pay, and each view is recorded. If the
 * creator changed them after the request, approval asks for a confirmation.
 *
 * The amount is the creator's locked net from their deal and cannot be edited.
 * Each row is the creator's statement: gross → platform fee → net → TDS → paid.
 * One live payout per creator deal; cancelling (with a reason) allows a new one.
 * No brand price or margin here.
 */
const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  requested: { label: 'Awaiting approval', tone: 'amber' },
  approved:  { label: 'Approved · to pay', tone: 'blue' },
  paid:      { label: 'Paid', tone: 'green' },
}
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
const fmtDate = (iso: string | null) => iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function PayoutsPanel({ experienceId, data }: { experienceId: string; data: ConsolePayouts }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tds, setTds] = useState<Record<string, string>>({})
  const [paying, setPaying] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<ConsolePayoutLeg | null>(null)
  const [reason, setReason] = useState('')
  const [approving, setApproving] = useState<ConsolePayoutLeg | null>(null)
  const [account, setAccount] = useState<{ name: string; a: PayoutAccount } | null>(null)
  const canPay = data.can_pay

  const open = ['shoot_scheduled', 'shoot_done', 'delivering'].includes(data.status)
  const paid = data.legs.filter((l) => l.payout?.status === 'paid').length
  const toPay = data.legs.filter((l) => l.shoot_outcome === 'done').length

  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, after?: (d: unknown) => void) => {
    setError(null); setNotice(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) { setError(r.error ?? 'Something went wrong'); return }
      after?.(r.data); router.refresh()
    })
  }

  return (
    <section className="surface" style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="sect-head">Creator payouts</h2>
          <div className="sect-rule" />
        </div>
        <span style={{ ...kpiLabel, fontSize: 10.5 }}>{paid} of {toPay} paid · manual</span>
      </div>
      <p className="t-body" style={{ margin: '10px 0 0', fontSize: 13.5 }}>
        Pay each creator outside the app, then record it here with the bank reference and proof. The team requests a payout; finance (someone other than the requester) approves it, pays and records it.
      </p>

      <div style={{ marginTop: 14 }}>
        {data.legs.length === 0 && <p className="t-body" style={{ margin: 0, color: 'var(--ink-soft)' }}>No accepted creators yet.</p>}
        {data.legs.map((l) => {
          const p = l.payout
          const st = p ? STATUS[p.status] : null
          const why = l.shoot_outcome === 'did_not_shoot' ? 'Did not shoot: no payout.'
            : l.shoot_outcome !== 'done' ? 'Paid after their shoot is recorded.'
            : !l.work_complete ? 'Their deliverables need Guapd’s approval first.' : null
          return (
            <div key={l.deal_id} style={{ borderTop: '1px solid var(--hairline)', padding: '14px 0' }}>
              <div className="xp-pay-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.6fr) 260px', gap: 14, alignItems: 'start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{l.full_name ?? 'Creator'}</div>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)', marginTop: 3 }}>
                    {l.payment_details.bank_on_file ? `Bank ${l.payment_details.account_masked}` : 'No bank details yet'}
                    {l.payment_details.upi_on_file ? ' · UPI on file' : ''}{l.cancelled_before ? ` · ${l.cancelled_before} cancelled before` : ''}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink)', display: 'grid', gap: 2 }}>
                  <span>Gross {formatRupees(l.gross_paise)} → fee {Number(l.platform_pct)}% {formatRupees(l.platform_fee_paise)} → net <b>{formatRupees(l.net_paise)}</b></span>
                  {p && <span>TDS {formatRupees(p.tds_paise)} → paid <b>{formatRupees(p.net_amount_paise)}</b></span>}
                  {p && <span style={{ color: 'var(--ink-faint)' }}>
                    Requested by {p.requested_by_name ?? 'staff'}{p.approved_by_name ? ` · approved by ${p.approved_by_name}` : ''}
                    {p.status === 'paid' ? ` · paid ${fmtDate(p.paid_on)} · ref ${p.reference}` : ''}
                  </span>}
                  {!p && why && <span style={{ color: 'var(--ink-soft)' }}>{why}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  {st && <StatusChip label={st.label} tone={st.tone} />}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                    {!p && !why && open && <>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-ui)', fontSize: 12 }}>TDS ₹
                        <input className="dinput" style={{ width: 90, height: 30 }} inputMode="decimal" value={tds[l.deal_id] ?? '0'} onChange={(e) => setTds({ ...tds, [l.deal_id]: e.target.value })} />
                      </label>
                      <button type="button" style={{ ...smallBtn, background: 'var(--lime-400)', borderColor: 'var(--lime-400)' }} disabled={pending}
                        onClick={() => run(() => requestCreatorPayout(experienceId, l.deal_id, tds[l.deal_id] ?? '0'), () => setNotice(`Payout to ${l.full_name ?? 'the creator'} requested. Someone else on the team approves it.`))}>Request payout</button>
                    </>}
                    {p?.status === 'requested' && open && <>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-ui)', fontSize: 12 }}>TDS ₹
                        <input className="dinput" style={{ width: 90, height: 30 }} inputMode="decimal" value={tds[p.id] ?? String(Number(p.tds_paise) / 100)} onChange={(e) => setTds({ ...tds, [p.id]: e.target.value })} />
                      </label>
                      {tds[p.id] != null && <button type="button" style={smallBtn} disabled={pending} onClick={() => run(() => setCreatorPayoutTds(experienceId, p.id, tds[p.id]))}>Save TDS</button>}
                      {canPay && <button type="button" style={{ ...smallBtn, background: p.i_requested ? 'var(--card)' : 'var(--lime-400)', borderColor: p.i_requested ? '#EAEAE3' : 'var(--lime-400)', opacity: p.i_requested ? 0.5 : 1 }}
                        disabled={pending || p.i_requested} title={p.i_requested ? 'You requested it: someone else approves' : undefined}
                        onClick={() => p.details_changed_after_request ? setApproving(l) : run(() => approveCreatorPayout(experienceId, p.id), () => setNotice('Approved. Pay it, then record the transfer.'))}>Approve</button>}
                    </>}
                    {canPay && p && (p.status === 'requested' || p.status === 'approved') && (
                      <button type="button" style={smallBtn} disabled={pending}
                        onClick={() => run(() => showPayoutAccount(p.id), (d) => setAccount({ name: l.full_name ?? 'Creator', a: d as PayoutAccount }))}>Bank details</button>
                    )}
                    {canPay && p?.status === 'approved' && open && (
                      <button type="button" style={{ ...smallBtn, background: 'var(--lime-400)', borderColor: 'var(--lime-400)' }} onClick={() => { setError(null); setPaying(p.id) }}>Record paid</button>
                    )}
                    {p && open && (p.status === 'requested' || (p.status === 'approved' && canPay)) && <button type="button" style={{ ...smallBtn, color: '#9C4147' }} onClick={() => { setReason(''); setCancelling(l) }}>Cancel</button>}
                    {canPay && p?.has_proof && <button type="button" style={smallBtn} onClick={async () => { const e = await openFinanceFileInTab('payout-proof', p.id); if (e) setError(e) }}>Proof</button>}
                  </div>
                  {p?.status === 'requested' && (p.i_requested || !canPay) && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)' }}>{p.i_requested ? 'You requested it; finance (someone else) approves.' : 'Finance approves and pays.'}</span>}
                  {p && p.status !== 'paid' && p.details_changed_after_request && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: '#9C4147' }}>Bank details changed after this was requested.</span>}
                </div>
              </div>
              {paying === p?.id && p && (
                <PaidEditor payoutId={p.id} amount={p.net_amount_paise} busy={pending} onCancel={() => setPaying(null)} onError={setError}
                  onSave={(f) => run(() => recordCreatorPayoutPaid(experienceId, p.id, f), () => { setPaying(null); setNotice(`Recorded. ${l.full_name ?? 'The creator'} has been told, with the reference.`) })} />
              )}
            </div>
          )
        })}
      </div>

      {notice && <p className="t-body" style={{ margin: '12px 0 0', color: '#3F6212' }}>{notice}</p>}
      {error && <div role="alert" style={{ ...formError, marginTop: 12 }}>{error}</div>}

      <ConfirmDialog open={!!cancelling} title={`Cancel the payout to ${cancelling?.full_name ?? 'this creator'}`} tone="danger"
        body="Nothing has been paid on it. It is kept on record with your reason, and a new payout can be requested."
        detail={<div style={{ marginTop: 12 }}><label style={fieldLabel} htmlFor="po-why">Why</label>
          <input id="po-why" className="dinput" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="TDS entered wrongly" /></div>}
        confirmLabel="Cancel payout" busy={pending}
        onConfirm={() => cancelling?.payout && run(() => cancelCreatorPayout(experienceId, cancelling.payout!.id, reason), () => setCancelling(null))}
        onCancel={() => setCancelling(null)} />

      <ConfirmDialog open={!!approving} title={`Approve the payout to ${approving?.full_name ?? 'this creator'}`} tone="danger"
        body="The creator changed their bank details after this payout was requested. Confirm the new details with them (on a call or WhatsApp you started, not a reply to a message) before approving."
        confirmLabel="I confirmed them, approve" busy={pending}
        onConfirm={() => approving?.payout && run(() => approveCreatorPayout(experienceId, approving.payout!.id, true), () => { setApproving(null); setNotice('Approved. Pay it, then record the transfer.') })}
        onCancel={() => setApproving(null)} />
      <ConfirmDialog open={!!account} title={`Pay ${account?.name ?? ''}`}
        body="Finance only. This view is recorded (who and when, never the details). Do not copy these anywhere else."
        detail={account && <div style={{ marginTop: 12, display: 'grid', gap: 6, fontFamily: 'var(--font-ui)', fontSize: 13.5 }}>
          {account.a.account_number
            ? <>
                <div><span style={fieldLabel}>Account holder</span>{account.a.account_holder_name}</div>
                <div><span style={fieldLabel}>Account number</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{account.a.account_number}</span></div>
                <div><span style={fieldLabel}>IFSC</span>{account.a.ifsc}</div>
                {account.a.pan && <div><span style={fieldLabel}>PAN</span>{account.a.pan}</div>}
              </>
            : <div>No bank details on file.</div>}
          {account.a.upi_id && <div><span style={fieldLabel}>UPI</span>{account.a.upi_id}</div>}
          {account.a.changed_after_request && <div style={{ color: '#9C4147' }}>Changed after this payout was requested: confirm with the creator before paying.</div>}
        </div>}
        confirmLabel="Done" onConfirm={() => setAccount(null)} onCancel={() => setAccount(null)} />

      <style dangerouslySetInnerHTML={{ __html: `@media (max-width: 860px) { .xp-pay-row, .xp-pay-form { grid-template-columns: 1fr !important; } .xp-pay-row > :last-child { align-items: flex-start !important; } }` }} />
    </section>
  )
}

const smallBtn: React.CSSProperties = { ...pillBtn, height: 30, padding: '0 12px', fontSize: 12 }

function PaidEditor({ payoutId, amount, busy, onSave, onCancel, onError }: {
  payoutId: string; amount: number; busy: boolean
  onSave: (f: { paidOn: string; method: string; reference: string; proofPath: string }) => void
  onCancel: () => void; onError: (e: string) => void
}) {
  const [f, setF] = useState({ paidOn: today(), method: 'bank_transfer', reference: '' })
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    if (!file) { onError('Attach the payment proof (a screenshot or PDF of the transfer).'); return }
    setUploading(true)
    const up = await uploadFinanceFile('payout-proof', payoutId, file)
    setUploading(false)
    if (!up.ok) { onError(up.error); return }
    onSave({ ...f, proofPath: up.path })
  }
  return (
    <div style={{ marginTop: 12, padding: 14, borderRadius: 14, background: '#F7F7F3', display: 'grid', gap: 10 }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)' }}>Record the transfer of {formatRupees(amount)} you made outside the app.</div>
      <div className="xp-pay-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label><span style={fieldLabel}>Paid on</span><input className="dinput" type="date" max={today()} value={f.paidOn} onChange={set('paidOn')} /></label>
        <label><span style={fieldLabel}>Method</span>
          <select className="dinput" value={f.method} onChange={set('method')}><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="other">Other</option></select></label>
        <label><span style={fieldLabel}>Reference (UTR)</span><input className="dinput" maxLength={100} value={f.reference} onChange={set('reference')} /></label>
        <label><span style={fieldLabel}>Proof (PDF or image)</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={neonBtn} disabled={busy || uploading} onClick={save}>{uploading ? 'Uploading…' : 'Record paid'}</button>
        <button type="button" style={pillBtn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
