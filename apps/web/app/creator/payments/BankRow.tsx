'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { savePayoutDetails, type PayoutDetailsView } from './payout-details-actions'

/**
 * The bank account row, under UPI in "Payout method" (0542 details, 0580).
 * Every creator can add one: Guapd pays into it, it is needed before any
 * invoice to Guapd, and it is there for anyone paid by bank transfer rather
 * than UPI. Entered here, read back MASKED; only Guapd finance sees it in
 * full, to pay. Brands do not see it.
 */
export default function BankRow({ details, returnTo = null }: { details: PayoutDetailsView; returnTo?: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  // Sent here from a deal to add it before invoicing: open straight away.
  const [editing, setEditing] = useState((!details.on_file || !details.pan_masked) && !!returnTo)
  const [f, setF] = useState({ holder: details.account_holder_name ?? '', account: '', accountConfirm: '', ifsc: details.ifsc ?? '', pan: '', gst: details.gst_registered == null ? '' : details.gst_registered ? 'yes' : 'no' })
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  const save = () => {
    setError(null); setNotice(null)
    // 0581: PAN is required; an empty box keeps the one on file.
    if (!f.pan.trim() && !details.pan_masked) { setError('Enter your PAN. It is needed for TDS, so you can claim it back.'); return }
    start(async () => {
      const r = await savePayoutDetails({ holder: f.holder, account: f.account, accountConfirm: f.accountConfirm, ifsc: f.ifsc, pan: f.pan,
        gstRegistered: f.gst === 'yes' ? true : f.gst === 'no' ? false : null })
      if (!r.ok) { setError(r.message); return }
      setEditing(false); setF({ ...f, account: '', accountConfirm: '', pan: '' })
      // 0580: sent here from a deal to invoice: straight back to it.
      if (returnTo) { router.push(returnTo); return }
      setNotice('Saved. Only Guapd’s finance team sees these, to pay you.'); router.refresh()
    })
  }

  const btn: React.CSSProperties = { flexShrink: 0, padding: '7px 14px', borderRadius: 999, border: '1px solid var(--line)', background: '#fff', fontFamily: 'var(--font-ui)', fontSize: 11.5, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }

  return (
    <div className="sr msurface br-row" style={{ padding: '18px 20px', marginTop: 10 }}>
      {!editing ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', minWidth: 0, overflowWrap: 'anywhere' }}>
            {details.on_file
              ? <>Bank &middot; {details.account_masked} &middot; {details.ifsc} &middot; {details.pan_masked ? <>PAN {details.pan_masked}</> : <span style={{ color: '#B4262A' }}>PAN missing</span>}</>
              : 'No bank account yet'}
          </span>
          <button type="button" style={btn} onClick={() => setEditing(true)}>{details.on_file ? (details.pan_masked ? 'Change' : 'Add PAN') : 'Add'}</button>
        </div>
      ) : (
        <div className="br-form">
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)' }}>Your bank account</div>
          <label>Account holder name<input value={f.holder} onChange={set('holder')} maxLength={100} autoComplete="name" /></label>
          <label>Account number<input value={f.account} onChange={set('account')} inputMode="numeric" autoComplete="off" maxLength={24} /></label>
          <label>Account number again<input value={f.accountConfirm} onChange={set('accountConfirm')} inputMode="numeric" autoComplete="off" maxLength={24} onPaste={(e) => e.preventDefault()} /></label>
          <label>IFSC<input value={f.ifsc} onChange={(e) => setF({ ...f, ifsc: e.target.value.toUpperCase() })} maxLength={11} placeholder="HDFC0001234" /></label>
          <label>PAN<input value={f.pan} onChange={(e) => setF({ ...f, pan: e.target.value.toUpperCase() })} maxLength={10} placeholder={details.pan_masked ? `On file: ${details.pan_masked} (leave empty to keep)` : 'ABCDE1234F'} /></label>
          <p style={{ margin: '-4px 0 0', fontSize: 11, lineHeight: 1.45, color: 'var(--ink-soft)' }}>Needed for TDS, so you can claim it back in your tax return. No PAN yet? Get one free in minutes with Aadhaar (<a href="https://eportal.incometax.gov.in/iec/foservices/#/pre-login/instant-e-pan" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)' }}>Instant e-PAN</a>), or write to contact@guapd.com.</p>
          <label>GST-registered?<select value={f.gst} onChange={set('gst')}><option value="">Choose</option><option value="no">No</option><option value="yes">Yes</option></select></label>
          {error && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#B4262A' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" style={btn} onClick={() => { setEditing(false); setError(null) }}>Cancel</button>
            <button type="button" style={{ ...btn, background: 'var(--neon)', borderColor: 'var(--neon)', fontWeight: 700 }} disabled={pending} onClick={save}>{pending ? 'Saving…' : 'Save'}</button>
          </div>
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: 'var(--ink-soft)' }}>Only Guapd&rsquo;s finance team sees it in full, and only to pay you. Changing it later sends you an email, and Guapd confirms with you before paying a new account.</p>
        </div>
      )}
      {notice && !editing && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#3F6212' }}>{notice}</p>}
      <style>{`
        .br-form { display: grid; gap: 10px; }
        .br-form label { display: grid; gap: 5px; font-size: 11.5px; font-weight: 600; color: var(--ink-soft); }
        .br-form input, .br-form select { width: 100%; box-sizing: border-box; font-size: 16px; font-family: var(--font-ui); color: var(--ink); padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: #fff; }
      `}</style>
    </div>
  )
}
