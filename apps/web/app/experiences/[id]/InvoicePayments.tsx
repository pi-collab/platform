'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatRupees } from '@/lib/experience-request'
import type { BrandInvoice } from '@/lib/experience-brand-server'
import { checkOnlinePayment, reportPayment, startOnlinePayment } from '../actions'
import { neonBtn, pillBtn } from './BrandPanels'

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
  | { kind: 'confirming'; paidBefore: number; paymentId: string; amountPaise: number }
  | { kind: 'received'; paymentId: string; amountPaise: number } | { kind: 'slow'; paymentId: string }

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(22,23,15,.45)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
}
const badge = (bg: string, fg: string): React.CSSProperties => ({ width: 64, height: 64, borderRadius: 999, display: 'grid', placeItems: 'center', margin: '0 auto', background: bg, color: fg })
const ICONS = {
  ok: <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>,
  fail: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  wait: <svg className="bx-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.56" /></svg>,
  retry: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5" /></svg>,
}

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
    if (invoice.paid_paise > online.paidBefore || invoice.status === 'paid') { setOnline({ kind: 'received', paymentId: online.paymentId, amountPaise: online.amountPaise }); return }
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
        setOnline({ kind: 'confirming', paidBefore: invoice.paid_paise, paymentId: resp.razorpay_payment_id, amountPaise: r.data.amountPaise })
        const c = await checkOnlinePayment(experienceId, { orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature })
        if (!c.ok) setOnline({ kind: 'failed', message: c.error })
        else router.refresh()
      },
    })
    rzp.on('payment.failed', (f: RzpFailure) => {
      setOnline({ kind: 'failed', message: f.error?.description ?? 'The payment did not go through.' })
    })
    rzp.open()
  }

  const closeDialog = () => setOnline({ kind: 'idle' })
  useEffect(() => {
    if (online.kind !== 'received' && online.kind !== 'failed') return
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setOnline({ kind: 'idle' }) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [online.kind])

  const dialog = online.kind === 'confirming' ? {
    badge: badge('var(--sec-2, #F7F7F4)', 'var(--ink)'), icon: ICONS.wait, title: 'Confirming your payment', amount: formatRupees(online.amountPaise),
    body: 'Razorpay is confirming it with Guapd. This usually takes a few seconds; please keep this page open.', rows: [] as [string, string][],
  } : online.kind === 'received' ? {
    badge: badge('var(--neon)', 'var(--ink)'), icon: ICONS.ok, title: 'Payment received', amount: formatRupees(online.amountPaise),
    body: settled ? `Invoice ${invoice.number} is paid in full. Thank you.` : `Received against invoice ${invoice.number}. Thank you.`,
    rows: [['Invoice', invoice.number], ['Payment ID', online.paymentId]] as [string, string][],
  } : online.kind === 'failed' ? {
    badge: badge('#FDF0F0', '#9C4147'), icon: ICONS.fail, title: 'Payment didn’t go through', amount: null,
    body: `${online.message} Nothing was recorded against the invoice, and you can try again.`,
    rows: [['Invoice', invoice.number], ['Balance', formatRupees(balance)]] as [string, string][],
  } : null

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

      {online.kind === 'cancelled' && <p className="bx-note" role="status" style={{ marginTop: 8 }}>Payment cancelled. Nothing was charged.</p>}
      {online.kind === 'slow' && <p className="bx-note" role="status" style={{ marginTop: 8 }}>Your payment ({online.paymentId}) is still being confirmed. It will show here once Razorpay confirms it; no need to pay again.</p>}
      {dialog && (
        <div style={overlay} onClick={(ev) => { if (ev.target === ev.currentTarget && online.kind !== 'confirming') closeDialog() }}>
          <div className="surface bx-pay-dialog" role={online.kind === 'failed' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="bx-pay-h" aria-describedby="bx-pay-d"
            style={{ width: '100%', maxWidth: 420, padding: '30px 26px 24px', textAlign: 'center' }}>
            <div style={dialog.badge}>{dialog.icon}</div>
            <h3 id="bx-pay-h" style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: '18px 0 0' }}>{dialog.title}</h3>
            {dialog.amount && <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 8 }}>{dialog.amount}</div>}
            <p id="bx-pay-d" style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-soft)', margin: '10px auto 0', maxWidth: 330 }}>{dialog.body}</p>
            {dialog.rows.length > 0 && (
              <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 12, background: 'var(--sec-2, #F7F7F4)', display: 'grid', gap: 6, textAlign: 'left' }}>
                {dialog.rows.map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: 'var(--font-ui)', fontSize: 12.5 }}>
                    <span style={{ color: 'var(--ink-faint)' }}>{k}</span><span style={{ color: 'var(--ink)', fontWeight: 600, wordBreak: 'break-all', textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            {online.kind !== 'confirming' && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
                {online.kind === 'failed' ? (<>
                  <button type="button" className="pill-hover" style={pillBtn} onClick={closeDialog}>Close</button>
                  <button type="button" className="neonbtn" style={neonBtn} autoFocus onClick={() => { closeDialog(); void payOnline() }}>{ICONS.retry} Try again</button>
                </>) : (
                  <button type="button" className="neonbtn" style={{ ...neonBtn, minWidth: 160 }} autoFocus onClick={closeDialog}>Done</button>
                )}
              </div>
            )}
          </div>
        </div>
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
