'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatRupees } from '@/lib/experience-request'
import type { BrandInvoice } from '@/lib/experience-brand-server'
import { reportPayment } from '../actions'

/**
 * 0568: the money on one Guapd invoice, as the brand sees it: the total, what
 * Guapd has received, what the brand marked paid that Guapd is still checking,
 * and the balance. An admin marks a payment (part payments welcome); a member
 * sees the figures only. "Pay online" waits for Razorpay.
 *
 * Only this invoice's own figures. Never creator pay, costs or margin.
 */
const METHODS = [['bank_transfer', 'Bank transfer'], ['upi', 'UPI'], ['cheque', 'Cheque'], ['cash', 'Cash'], ['other', 'Other']] as const
const methodLabel = (m: string) => METHODS.find(([k]) => k === m)?.[1] ?? m
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

const fig: React.CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }
const val: React.CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginTop: 3 }

export default function InvoicePayments({ experienceId, invoice, isAdmin }: { experienceId: string; invoice: BrandInvoice; isAdmin: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = useState({ amount: '', tds: '', paidOn: today(), method: 'bank_transfer', reference: '', note: '' })
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: ev.target.value })

  const reported = invoice.reported_paise ?? 0
  const balance = invoice.balance_paise ?? Math.max(invoice.total_paise - invoice.paid_paise, 0)
  const reports = invoice.reports ?? []
  const settled = invoice.status === 'paid'

  const submit = () => {
    setError(null)
    start(async () => {
      const r = await reportPayment(experienceId, invoice.invoice_id, f)
      if (!r.ok) { setError(r.error); return }
      setOpen(false)
      setF({ amount: '', tds: '', paidOn: today(), method: 'bank_transfer', reference: '', note: '' })
      router.refresh()
    })
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'var(--sec-2, #F7F7F4)' }}>
        <div><div style={fig}>Invoice</div><div style={val}>{formatRupees(invoice.total_paise)}</div></div>
        <div><div style={fig}>Received by Guapd</div><div style={val}>{formatRupees(invoice.paid_paise)}</div></div>
        {reported > 0 && <div><div style={fig}>Marked, being checked</div><div style={val}>{formatRupees(reported)}</div></div>}
        <div><div style={fig}>Balance</div><div style={{ ...val, color: balance > 0 ? 'var(--ink)' : '#3B6A12' }}>{formatRupees(balance)}</div></div>
      </div>

      {reports.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 6, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)' }}>
          {reports.map((r, i) => (
            <li key={`${r.reference}-${i}`}>
              {formatRupees(r.amount_paise)}{r.tds_paise > 0 ? ` + ${formatRupees(r.tds_paise)} TDS` : ''} · {methodLabel(r.method)} · {r.reference} · {fmt(r.paid_on)}{' '}
              {r.status === 'confirmed' ? <span className="bx-chip bx-ok">Received</span>
                : r.status === 'rejected' ? <><span className="bx-chip bx-chg">Not found</span>{r.reason ? ` Guapd: “${r.reason}”` : ''}</>
                : r.status === 'withdrawn' ? <span className="bx-chip bx-new">Withdrawn</span>
                : <span className="bx-chip bx-new">Guapd is checking</span>}
            </li>
          ))}
        </ul>
      )}

      {!settled && (
        <div className="bx-actions" style={{ justifyContent: 'flex-start', marginTop: 12, flexWrap: 'wrap' }}>
          {isAdmin && balance > 0 && !open && (
            <button type="button" className="bx-btn" onClick={() => { setOpen(true); setError(null) }}>Mark as paid</button>
          )}
          <button type="button" className="bx-btn" disabled aria-disabled="true" title="Online payment is coming soon" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
            Pay online · coming soon
          </button>
          {!isAdmin && balance > 0 && <span className="bx-note" style={{ margin: 0 }}>An admin on your brand account marks payments.</span>}
        </div>
      )}

      {isAdmin && open && (
        <div className="bx-box">
          <p className="bx-note" style={{ marginTop: 0 }}>Tell Guapd what you paid. Part payments are fine. It counts as received once Guapd sees it in its bank.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <label><span className="bx-flabel">Amount paid (₹)</span>
              <input className="dinput" inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="1,47,500" /></label>
            <label><span className="bx-flabel">TDS deducted (₹)</span>
              <input className="dinput" inputMode="decimal" value={f.tds} onChange={set('tds')} placeholder="0" /></label>
            <label><span className="bx-flabel">Paid on</span>
              <input className="dinput" type="date" max={today()} value={f.paidOn} onChange={set('paidOn')} /></label>
            <label><span className="bx-flabel">How</span>
              <select className="dinput" value={f.method} onChange={set('method')}>
                {METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></label>
            <label><span className="bx-flabel">Reference (UTR / cheque no.)</span>
              <input className="dinput" maxLength={100} value={f.reference} onChange={set('reference')} /></label>
            <label><span className="bx-flabel">Note (optional)</span>
              <input className="dinput" maxLength={300} value={f.note} onChange={set('note')} /></label>
          </div>
          <p className="bx-note">Balance now {formatRupees(balance)}.</p>
          {error && <p className="bx-err" role="alert">{error}</p>}
          <div className="bx-actions">
            <button type="button" className="bx-btn" disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="bx-cta-sm" disabled={pending} onClick={submit}>{pending ? 'Saving…' : 'Mark as paid'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
