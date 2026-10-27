'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatRupees } from '@/lib/experience-request'
import type { BrandInvoice } from '@/lib/experience-brand-server'
import { checkOnlinePayment, reportPayment, startOnlinePayment } from '../actions'

/**
 * 0568: the money on one Guapd invoice, as the brand sees it: the total, what
 * Guapd has received, what the brand marked paid that Guapd is still checking,
 * and the balance. An admin marks a payment (part payments welcome); a member
 * sees the figures only.
 *
 * 0578: an admin can also pay the balance online (Razorpay Standard Checkout).
 * The amount is the balance the server works out; the checkout's success only
 * moves this screen to "confirming". The invoice changes when Razorpay's signed
 * webhook arrives, and the refresh below picks that up.
 *
 * Only this invoice's own figures. Never creator pay, costs or margin.
 */
const METHODS = [['bank_transfer', 'Bank transfer'], ['upi', 'UPI'], ['cheque', 'Cheque'], ['cash', 'Cash'], ['other', 'Other']] as const
const methodLabel = (m: string) => METHODS.find(([k]) => k === m)?.[1] ?? m
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

const fig: React.CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }
const val: React.CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginTop: 3 }

type RzpResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
type RzpFailure = { error?: { description?: string; reason?: string; metadata?: { payment_id?: string } } }
type RzpInstance = { open: () => void; on: (event: 'payment.failed', cb: (r: RzpFailure) => void) => void }
declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => RzpInstance } }

const CHECKOUT_JS = 'https://checkout.razorpay.com/v1/checkout.js'
/** Loaded on the first click, not with the page: nothing from Razorpay runs until a brand chooses to pay. */
function loadCheckout(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (window.Razorpay) return Promise.resolve(true)
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_JS}"]`)
    const el = existing ?? Object.assign(document.createElement('script'), { src: CHECKOUT_JS, async: true })
    el.addEventListener('load', () => resolve(Boolean(window.Razorpay)), { once: true })
    el.addEventListener('error', () => resolve(false), { once: true })
    if (!existing) document.body.appendChild(el)
  })
}

type Online = { kind: 'idle' } | { kind: 'opening' } | { kind: 'cancelled' } | { kind: 'failed'; message: string }
  | { kind: 'confirming'; paidBefore: number; paymentId: string } | { kind: 'received' } | { kind: 'slow'; paymentId: string }

export default function InvoicePayments({ experienceId, invoice, isAdmin, onlineEnabled = false }: { experienceId: string; invoice: BrandInvoice; isAdmin: boolean; onlineEnabled?: boolean }) {
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
  const [online, setOnline] = useState<Online>({ kind: 'idle' })
  const polls = useRef(0)

  // Waiting for the webhook: refresh until Guapd's received figure moves, for about a minute.
  useEffect(() => {
    if (online.kind !== 'confirming') return
    if (invoice.paid_paise > online.paidBefore || invoice.status === 'paid') { setOnline({ kind: 'received' }); return }
    if (polls.current >= 15) { setOnline({ kind: 'slow', paymentId: online.paymentId }); return }
    const t = setTimeout(() => { polls.current += 1; router.refresh() }, 4000)
    return () => clearTimeout(t)
  }, [online, invoice.paid_paise, invoice.status, router])

  const payOnline = async () => {
    setOnline({ kind: 'opening' })
    const [r, loaded] = await Promise.all([startOnlinePayment(experienceId, invoice.invoice_id), loadCheckout()])
    if (!r.ok) { setOnline({ kind: 'failed', message: r.error }); return }
    if (!loaded || !window.Razorpay) { setOnline({ kind: 'failed', message: 'The payment window did not load. Check your connection and try again.' }); return }
    const rzp = new window.Razorpay({
      key: r.data.keyId,
      order_id: r.data.orderId,
      amount: r.data.amountPaise,
      currency: r.data.currency,
      name: 'Guapd',
      description: `Invoice ${r.data.invoiceNumber}`,
      notes: { invoice: r.data.invoiceNumber },
      theme: { color: '#181C24' },
      modal: { ondismiss: () => setOnline((o) => (o.kind === 'opening' ? { kind: 'cancelled' } : o)) },
      handler: async (resp: RzpResponse) => {
        polls.current = 0
        setOnline({ kind: 'confirming', paidBefore: invoice.paid_paise, paymentId: resp.razorpay_payment_id })
        const c = await checkOnlinePayment(experienceId, { orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature })
        if (!c.ok) setOnline({ kind: 'failed', message: c.error })
        else router.refresh()
      },
    })
    rzp.on('payment.failed', (f: RzpFailure) => {
      setOnline({ kind: 'failed', message: `${f.error?.description ?? 'The payment did not go through.'} Nothing was recorded against the invoice. You can try again.` })
    })
    rzp.open()
  }

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
          {isAdmin && onlineEnabled && balance >= 100 && !open && (
            <button type="button" className="bx-cta-sm" disabled={online.kind === 'opening' || online.kind === 'confirming'} onClick={payOnline}>
              {online.kind === 'opening' ? 'Opening…' : online.kind === 'confirming' ? 'Confirming…' : `Pay ${formatRupees(balance)} online`}
            </button>
          )}
          {!onlineEnabled && (
            <button type="button" className="bx-btn" disabled aria-disabled="true" title="Online payment is coming soon" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
              Pay online · coming soon
            </button>
          )}
          {!isAdmin && balance > 0 && <span className="bx-note" style={{ margin: 0 }}>An admin on your brand account marks payments.</span>}
        </div>
      )}

      {online.kind !== 'idle' && online.kind !== 'opening' && (
        <p className={online.kind === 'failed' ? 'bx-err' : 'bx-note'} role={online.kind === 'failed' ? 'alert' : 'status'} style={{ marginTop: 8 }}>
          {online.kind === 'cancelled' && 'Payment cancelled. Nothing was charged.'}
          {online.kind === 'failed' && online.message}
          {online.kind === 'confirming' && 'Payment made. Confirming it with Razorpay; this usually takes a few seconds.'}
          {online.kind === 'received' && 'Payment received. Thank you.'}
          {online.kind === 'slow' && `Your payment (${online.paymentId}) is still being confirmed. It will show here once Razorpay confirms it; no need to pay again.`}
        </p>
      )}
      {isAdmin && onlineEnabled && balance >= 100 && online.kind === 'idle' && !settled && (
        <p className="bx-note" style={{ marginTop: 6 }}>Paying online settles the balance in full. If you deduct TDS, pay by bank transfer and mark it as paid instead.</p>
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
