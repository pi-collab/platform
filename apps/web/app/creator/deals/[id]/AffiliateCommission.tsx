'use client'
import BankDetailsFirst from './BankDetailsFirst'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatPaiseINR } from '@/lib/money'
import { percentOfPaise } from '@/lib/money-round'
import type { CreatorCommission } from '@/lib/creator-leg-money'
import { claimAffiliateCommission } from './leg-actions'
import { MoneyRow } from './deal-cards'
import { metaLabel, sectionHeading } from './deal-shell'

/**
 * 0563: the affiliate commission on an Experience deal. Once the brand marks
 * every collab ad complete, the creator enters the sales through their link and
 * raises the invoice: sales × the % locked on their deal, less their Guapd fee.
 * The preview uses the shared rounding (half up, whole paise); the database
 * computes the same figures and refuses a mismatch. Guapd reviews, then pays.
 */
const fmt = (iso: string | null) => iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''

function salesToPaise(v: string): number | null {
  const m = v.replace(/[,\s₹]/g, '').match(/^(\d{1,10})(?:\.(\d{1,2}))?$/)
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : null
}

export default function AffiliateCommission({ dealId, c, brand, defaultName, bankOnFile = true }: { dealId: string; c: CreatorCommission; brand: string; defaultName: string; bankOnFile?: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [sales, setSales] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [name, setName] = useState(defaultName)
  const [gstin, setGstin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const pct = Number(c.affiliate_pct), feePct = Number(c.platform_pct)
  const salesPaise = salesToPaise(sales)
  const gross = salesPaise && salesPaise > 0 ? percentOfPaise(salesPaise, pct) : null
  const fee = gross != null ? percentOfPaise(gross, feePct) : null
  const net = gross != null && fee != null ? gross - fee : null
  const claim = c.claim
  const live = claim && claim.status !== 'cancelled'
  const ready = !!net && net > 0 && confirmed && name.trim().length >= 2 && !pending

  const submit = () => {
    if (net == null) return
    setError(null)
    start(async () => {
      const r = await claimAffiliateCommission(dealId, { salesRupees: sales, confirmed, billingName: name, gstin, expectedPayablePaise: net })
      if (!r.ok) { setError(r.message); return }
      router.refresh()
    })
  }

  const pill = !live ? (c.can_claim ? 'Ready to claim' : 'After the ads run')
    : claim!.status === 'sales_entered' ? 'Guapd is reviewing' : claim!.status === 'verified' ? (claim!.payout ? 'Being paid' : 'Approved')
    : claim!.status === 'paid' ? 'Paid' : 'Closed'
  const dot = pill === 'Paid' ? 'var(--success, #16a34a)' : pill === 'Ready to claim' ? 'var(--neon-deep)' : pill === 'Closed' || pill === 'After the ads run' ? 'var(--ink-faint)' : 'var(--warning)'
  const input: React.CSSProperties = {
    width: '100%', height: 42, padding: '0 12px', borderRadius: 11, border: '1px solid var(--border-hairline, #EAEAE3)',
    background: 'var(--card)', fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink)',
  }
  const label: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 6 }

  return (
    <div className="surface" style={{ padding: '22px 24px' }} id="commission">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={metaLabel}>{pct}% of sales through your affiliate link</div>
          <h3 style={{ ...sectionHeading, marginTop: 6 }}>Affiliate commission</h3>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />{pill}
        </span>
      </div>

      {!live && !c.can_claim && (
        <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '10px 0 0', lineHeight: 1.5 }}>
          Once {brand} marks your collab ads complete, enter the sales through your affiliate link here and raise your invoice. You receive {pct}% of those sales, less your {feePct}% Guapd fee.
        </p>
      )}
      {claim?.status === 'cancelled' && claim.review_note && (
        <p style={{ fontSize: 12.5, color: '#8C6417', margin: '10px 0 0', lineHeight: 1.5 }}>Guapd could not approve your last claim: “{claim.review_note}”. Check the figure and claim again.</p>
      )}

      {!live && c.can_claim && (
        !bankOnFile ? <div style={{ marginTop: 14 }}><BankDetailsFirst dealId={dealId} /></div> :
        <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
          <div>
            <span style={label}>Sales through your affiliate link (₹)</span>
            <input style={input} inputMode="decimal" value={sales} onChange={(e) => setSales(e.target.value)} aria-label="Sales amount in rupees" placeholder="As shown in the brand's affiliate report" />
          </div>
          {gross != null && fee != null && net != null && (
            <div>
              <MoneyRow label={`${pct}% of ${formatPaiseINR(salesPaise!)}`} value={formatPaiseINR(gross)} />
              <MoneyRow label={`Platform fee (${feePct}%)`} value={`−${formatPaiseINR(fee)}`} />
              <MoneyRow label="You receive" value={formatPaiseINR(net)} strong last />
            </div>
          )}
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13, lineHeight: 1.45, color: 'var(--ink)' }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: 'var(--ink)' }} />
            <span>I confirm this is the sales figure the brand&rsquo;s affiliate link recorded for my collab posts.</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div><span style={label}>Invoice from</span><input style={input} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} aria-label="Name to invoice from" /></div>
            <div><span style={label}>GSTIN (optional)</span><input style={input} value={gstin} maxLength={15} onChange={(e) => setGstin(e.target.value.toUpperCase())} aria-label="GSTIN" placeholder="Only if you are GST-registered" /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="neonbtn" onClick={submit} disabled={!ready}
              style={{ height: 42, padding: '0 18px', borderRadius: 11, border: 'none', background: ready ? 'var(--neon)' : 'var(--sec-2, #f5f5f0)', color: ready ? 'var(--ink)' : 'var(--ink-faint)',
                fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, cursor: ready ? 'pointer' : 'not-allowed', opacity: ready ? 1 : 0.7 }}>
              {pending ? 'Raising…' : 'Confirm and raise invoice'}
            </button>
          </div>
          {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: '#9C4147' }}>{error}</p>}
        </div>
      )}

      {live && claim!.status !== 'closed' && claim!.gross_paise != null && (
        <div style={{ marginTop: 12 }}>
          <MoneyRow label={`${pct}% of ${formatPaiseINR(Number(claim!.sales_paise))} sales`} value={formatPaiseINR(Number(claim!.gross_paise))} />
          <MoneyRow label={`Platform fee (${feePct}%)`} value={`−${formatPaiseINR(Number(claim!.platform_fee_paise))}`} />
          {claim!.payout?.tds_paise ? <MoneyRow label="TDS withheld" value={`−${formatPaiseINR(Number(claim!.payout.tds_paise))}`} /> : null}
          <MoneyRow label={claim!.status === 'paid' ? 'Paid to you' : 'You receive'} value={formatPaiseINR(claim!.payout ? Number(claim!.payout.paid_paise) : Number(claim!.net_paise))} strong last />
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '10px 0 0', lineHeight: 1.5 }}>
            {claim!.status === 'sales_entered' ? `Claimed ${fmt(claim!.claimed_at)}. Guapd checks the sales with ${brand}, then pays you.`
              : claim!.status === 'paid' ? `Paid${claim!.payout?.paid_on ? ` on ${fmt(claim!.payout.paid_on)}` : ''}${claim!.payout?.reference ? ` · bank reference ${claim!.payout.reference}` : ''}.`
              : 'Approved. Guapd is preparing your payment.'}
            {claim!.invoice && <> {' '}<a href={`/creator/deals/${dealId}/invoice?commission=${claim!.id}`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: 'var(--ink)' }}>Invoice {claim!.invoice.number} (PDF)</a></>}
          </p>
        </div>
      )}
      {claim?.status === 'closed' && (
        <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '10px 0 0', lineHeight: 1.5 }}>No commission is due{claim.review_note ? `: ${claim.review_note}` : ''}.</p>
      )}
    </div>
  )
}
