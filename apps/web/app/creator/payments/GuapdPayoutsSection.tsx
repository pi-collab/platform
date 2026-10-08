'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatPaiseINR } from '@/lib/money'
import { savePayoutDetails, type PayoutDetailsView } from './payout-details-actions'

/**
 * Guapd-managed shoots on the creator's Payments page (0542):
 *   - "Paid by Guapd": each Experience payout, its status, what was paid, the
 *     date and the bank reference (from creator_payouts, their own only);
 *   - their bank details for Guapd payouts: entered here, read back MASKED.
 *     Only Guapd finance sees them in full, to pay; brands never do.
 */
export interface GuapdPayout {
  deal_id: string; title: string | null; brand_label: string; status: 'requested' | 'approved' | 'processing' | 'paid'
  net_paise: number; tds_paise: number; paid_paise: number; paid_on: string | null; reference: string | null
}
const STATUS: Record<string, string> = { requested: 'Being prepared', approved: 'Approved · on its way', processing: 'On its way', paid: 'Paid' }
const fmt = (iso: string | null) => iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export default function GuapdPayoutsSection({ payouts, details }: { payouts: GuapdPayout[]; details: PayoutDetailsView }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(!details.on_file && payouts.length > 0)
  const [f, setF] = useState({ holder: details.account_holder_name ?? '', account: '', accountConfirm: '', ifsc: details.ifsc ?? '', pan: '', gst: details.gst_registered == null ? '' : details.gst_registered ? 'yes' : 'no' })
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  const save = () => {
    setError(null); setNotice(null)
    start(async () => {
      const r = await savePayoutDetails({ holder: f.holder, account: f.account, accountConfirm: f.accountConfirm, ifsc: f.ifsc, pan: f.pan,
        gstRegistered: f.gst === 'yes' ? true : f.gst === 'no' ? false : null })
      if (!r.ok) { setError(r.message); return }
      setEditing(false); setF({ ...f, account: '', accountConfirm: '', pan: '' })
      setNotice('Saved. Guapd sees these only when paying you.'); router.refresh()
    })
  }

  return (
    <section className="gp-wrap" aria-labelledby="gp-head">
      <h2 id="gp-head" className="gp-h2">Guapd-managed shoots</h2>

      <div className="gp-card">
        <div className="gp-label">Paid by Guapd</div>
        {payouts.length === 0
          ? <p className="gp-muted">Nothing yet. When Guapd pays you for a shoot, it shows here with the bank reference.</p>
          : payouts.map((p) => (
            <div key={p.deal_id} className="gp-row">
              <div>
                <div className="gp-title">{p.brand_label}</div>
                <div className="gp-muted">{p.title ?? ''}</div>
              </div>
              <div className="gp-money">
                <div className="gp-amount">{formatPaiseINR(p.paid_paise)}</div>
                <div className="gp-muted">Net {formatPaiseINR(p.net_paise)}{p.tds_paise ? ` · TDS ${formatPaiseINR(p.tds_paise)}` : ''}</div>
              </div>
              <div className="gp-status">
                <span className={`gp-chip ${p.status === 'paid' ? 'gp-ok' : ''}`}>{STATUS[p.status] ?? p.status}</span>
                {p.status === 'paid' && <div className="gp-muted">{fmt(p.paid_on)} · ref {p.reference}</div>}
              </div>
            </div>
          ))}
      </div>

      <div className="gp-card">
        <div className="gp-head-row">
          <div className="gp-label">Bank details for Guapd payouts</div>
          {!editing && <button type="button" className="gp-btn" onClick={() => setEditing(true)}>{details.on_file ? 'Change' : 'Add'}</button>}
        </div>
        {!editing && (details.on_file
          ? <div className="gp-details">
              <span>{details.account_holder_name}</span><span>Account {details.account_masked} · {details.ifsc}</span>
              {details.pan_masked && <span>PAN {details.pan_masked}</span>}
              <span className="gp-muted">GST-registered: {details.gst_registered ? 'yes' : 'no'}</span>
            </div>
          : <p className="gp-muted">Add the bank account Guapd should pay you into. Only Guapd&rsquo;s finance team sees it in full, and only to pay you. Brands never see it.</p>)}
        {editing && (
          <div className="gp-form">
            <label>Account holder name<input value={f.holder} onChange={set('holder')} maxLength={100} autoComplete="name" /></label>
            <label>IFSC<input value={f.ifsc} onChange={(e) => setF({ ...f, ifsc: e.target.value.toUpperCase() })} maxLength={11} placeholder="HDFC0001234" /></label>
            <label>Account number<input value={f.account} onChange={set('account')} inputMode="numeric" autoComplete="off" maxLength={24} /></label>
            <label>Account number again<input value={f.accountConfirm} onChange={set('accountConfirm')} inputMode="numeric" autoComplete="off" maxLength={24} onPaste={(e) => e.preventDefault()} /></label>
            <label>PAN (for TDS, optional)<input value={f.pan} onChange={(e) => setF({ ...f, pan: e.target.value.toUpperCase() })} maxLength={10} placeholder={details.pan_masked ? `On file: ${details.pan_masked}` : 'ABCDE1234F'} /></label>
            <label>GST-registered?<select value={f.gst} onChange={set('gst')}><option value="">Choose</option><option value="no">No</option><option value="yes">Yes</option></select></label>
            <div className="gp-form-actions">
              {details.on_file && <button type="button" className="gp-btn" onClick={() => setEditing(false)}>Cancel</button>}
              <button type="button" className="gp-btn gp-primary" disabled={pending} onClick={save}>{pending ? 'Saving…' : 'Save bank details'}</button>
            </div>
            <p className="gp-muted">Changing these later sends you an email, and Guapd confirms with you before paying into a new account.</p>
          </div>
        )}
        {notice && <p className="gp-notice">{notice}</p>}
        {error && <p className="gp-error" role="alert">{error}</p>}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .gp-wrap { max-width: 1200px; margin: 0 auto; padding: 0 clamp(16px, 4vw, 56px) 56px; box-sizing: border-box; font-family: var(--font-ui); }
        .gp-h2 { font-family: var(--font-display); font-size: 20px; font-weight: 700; margin: 8px 0 12px; color: var(--ink); }
        .gp-card { background: var(--card, #fff); border-radius: 20px; padding: 20px 22px; margin-bottom: 14px; border: 1px solid var(--hairline, #EAEAE3); }
        .gp-label { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--wg-500, #8A8F98); margin-bottom: 8px; }
        .gp-head-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .gp-row { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 220px; gap: 14px; padding: 12px 0; border-top: 1px solid var(--hairline, #EAEAE3); align-items: center; }
        .gp-title { font-weight: 700; font-size: 14px; color: var(--ink); }
        .gp-amount { font-weight: 700; font-size: 15px; color: var(--ink); }
        .gp-muted { font-size: 12.5px; color: var(--ink-soft); margin: 2px 0 0; }
        .gp-status { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
        .gp-chip { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #EEF1F5; color: var(--ink); }
        .gp-ok { background: #E6F6DC; color: #3B6A12; }
        .gp-details { display: grid; gap: 4px; font-size: 14px; color: var(--ink); }
        .gp-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 6px; }
        .gp-form label { display: grid; gap: 6px; font-size: 12px; font-weight: 600; color: var(--ink-soft); }
        .gp-form input, .gp-form select { height: 44px; border-radius: 12px; border: 1px solid var(--hairline, #EAEAE3); padding: 0 12px; font-size: 15px; font-family: var(--font-ui); background: #fff; color: var(--ink); }
        .gp-form-actions { grid-column: 1 / -1; display: flex; gap: 8px; justify-content: flex-end; }
        .gp-form > .gp-muted { grid-column: 1 / -1; }
        .gp-btn { height: 38px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--hairline, #EAEAE3); background: var(--card, #fff); font-weight: 700; font-size: 13px; cursor: pointer; color: var(--ink); }
        .gp-primary { background: var(--lime-400); border-color: var(--lime-400); }
        .gp-notice { color: #3F6212; font-size: 13px; margin: 10px 0 0; }
        .gp-error { color: #9C4147; font-size: 13px; margin: 10px 0 0; }
        @media (max-width: 760px) { .gp-row { grid-template-columns: 1fr; } .gp-status { align-items: flex-start; } .gp-form { grid-template-columns: 1fr; } }
      ` }} />
    </section>
  )
}
