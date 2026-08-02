'use client'

import { useState } from 'react'
import { acceptInvoice, markAsPaid } from './invoice-actions'

interface Invoice {
  id: string
  status: string
  base_paise: number
  overage_paise: number
  fee_paise: number
  fee_percent: number
  fee_mode: string
  brand_pays_paise: number
  creator_receives_paise: number
  payment_terms: string | null
  due_date: string | null
  issued_at: string | null
  accepted_at: string | null
}

interface LineItem {
  label: string
  pricePaise: number
}

function formatRupees(paise: number): string {
  const rupees = paise / 100
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

function formatRupeesShort(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `\u20B9${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `\u20B9${(rupees / 1000).toFixed(0)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

interface Props {
  dealId: string
  dealRef?: string | null
  invoice: Invoice
  lineItems?: LineItem[]
  creatorFirstName: string
  creatorId?: string | null
  usageRightsEndDate?: string | null
  paidAt?: string | null
}

export default function BrandInvoiceCard({ dealId, dealRef, invoice, lineItems, creatorFirstName, creatorId, usageRightsEndDate, paidAt }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(invoice.status === 'accepted')
  const [showPayDialog, setShowPayDialog] = useState(false)

  async function handleAccept() {
    setError(null)
    setLoading(true)
    const res = await acceptInvoice(dealId)
    setLoading(false)
    if (res.status === 'error') {
      setError(res.message)
    } else {
      setAccepted(true)
      setShowPayDialog(true)
    }
  }

  async function handlePay() {
    setError(null)
    setLoading(true)
    const res = await markAsPaid(dealId)
    setLoading(false)
    if (res.status === 'error') setError(res.message)
    else setShowPayDialog(false)
  }

  const isPending = invoice.status === 'issued' && !accepted
  const isAccepted = accepted || invoice.status === 'accepted'
  const isPaid = invoice.status === 'paid'

  const dueDateFormatted = invoice.due_date
    ? new Date(invoice.due_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : null

  // ── Paid state: "Deal complete" card ──
  if (isPaid) {
    const paidDateStr = paidAt
      ? new Date(paidAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : null
    const rightsEndStr = usageRightsEndDate
      ? new Date(usageRightsEndDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : null

    return (
      <>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--neon)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px -6px rgba(40,45,25,.35)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Deal complete</h3>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '4px 0 0' }}>
              Paid in full{paidDateStr ? ` on ${paidDateStr.split(',')[0]}` : ''}.
              {rightsEndStr && ` Rights run through ${rightsEndStr}.`}
            </p>
          </div>
        </div>

        {/* Dark "You paid" bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '20px 24px', margin: '24px 0 0', borderRadius: 16, background: 'var(--ink)', color: '#FFFFFF' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>You paid</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.55)', marginTop: 3 }}>{creatorFirstName} received {formatRupees(invoice.creator_receives_paise)}</div>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1, fontSize: 34 }}>{formatRupees(invoice.brand_pays_paise)}</span>
        </div>

        {/* Footer: paid date + UTR */}
        <div style={{ marginTop: 20 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            {paidDateStr ? `Paid ${paidDateStr}` : 'Paid'}
            {dealRef && ` \u00B7 UTR ${dealRef}`}
          </span>
        </div>
      </>
    )
  }

  // ── Issued / Accepted states ──
  const helperText = isPending
    ? `${invoice.payment_terms ? invoice.payment_terms + '. ' : ''}Review the line items and accept the invoice to proceed to payment.`
    : isAccepted
      ? `Invoice accepted${dueDateFormatted ? ` \u2014 pay by ${dueDateFormatted}` : ''}. Complete the payment to close this deal.`
      : ''

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
          Invoice{' '}
          {dealRef && <span style={{ color: 'var(--ink-faint)', fontWeight: 600 }}>#{dealRef}</span>}
        </h3>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)' }} />
          {isAccepted ? 'Accepted' : 'Pending'}
        </span>
      </div>

      {/* Line items */}
      <div style={{ marginTop: 18 }}>
        {lineItems && lineItems.length > 0 ? (
          lineItems.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, padding: '13px 0', borderBottom: '1px solid var(--border-hairline)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{item.label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>{formatRupees(item.pricePaise)}</span>
            </div>
          ))
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, padding: '13px 0', borderBottom: '1px solid var(--border-hairline)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Deliverables</span>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>{formatRupees(invoice.base_paise)}</span>
          </div>
        )}
        {invoice.overage_paise > 0 && (
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, padding: '13px 0', borderBottom: '1px solid var(--border-hairline)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Extra revisions</span>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>{formatRupees(invoice.overage_paise)}</span>
          </div>
        )}
        {invoice.fee_paise > 0 && (
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, padding: '13px 0', borderBottom: '1px solid var(--border-hairline)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Platform fee ({invoice.fee_percent}%)</span>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>{invoice.fee_mode === 'deducted' ? `\u2212${formatRupees(invoice.fee_paise)}` : formatRupees(invoice.fee_paise)}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, padding: '13px 0', borderBottom: '1px solid var(--border-hairline)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Creator receives</span>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>{formatRupees(invoice.creator_receives_paise)}</span>
        </div>
      </div>

      {/* Dark "You pay" bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '18px 24px', margin: '16px -24px 0', background: 'var(--ink)', color: '#FFFFFF' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>You pay</span>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1, fontSize: 34 }}>{formatRupees(invoice.brand_pays_paise)}</span>
      </div>

      {/* Helper text + action button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-hairline)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, maxWidth: 460 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
          <span style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-soft)' }}>{helperText}</span>
        </div>

        {error && (
          <span style={{ fontSize: 11.5, color: 'var(--danger, #D2545A)', fontWeight: 600 }}>{error}</span>
        )}

        {isPending && (
          <button
            onClick={handleAccept}
            disabled={loading}
            className="neonbtn"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 54, padding: '0 28px', borderRadius: 14, background: 'var(--neon)', border: 'none', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em', color: 'var(--ink)', cursor: 'pointer', boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Accepting\u2026' : 'Accept invoice'}
          </button>
        )}

        {isAccepted && !showPayDialog && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {dueDateFormatted && (
              <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>Due {dueDateFormatted}</span>
            )}
            <button
              onClick={handlePay}
              disabled={loading}
              className="neonbtn"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 54, padding: '0 28px', borderRadius: 14, background: 'var(--neon)', border: 'none', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em', color: 'var(--ink)', cursor: 'pointer', boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)', opacity: loading ? 0.6 : 1 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>
              {loading ? 'Processing\u2026' : `Pay ${formatRupeesShort(invoice.brand_pays_paise)}`}
            </button>
          </div>
        )}
      </div>

      {/* Pay now dialog — shown immediately after accepting */}
      {showPayDialog && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(4px)' }} onClick={() => setShowPayDialog(false)} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 420, borderRadius: 20, background: 'var(--card, #fff)', boxShadow: '0 24px 64px rgba(0,0,0,.18)', padding: '32px 28px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Proceed to payment?</h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-soft)', margin: '10px 0 0' }}>
                Invoice accepted. You&apos;ll be redirected to complete the payment of <b style={{ color: 'var(--ink)' }}>{formatRupees(invoice.brand_pays_paise)}</b>.
                {dueDateFormatted && <> Payment is due by <b style={{ color: 'var(--ink)' }}>{dueDateFormatted}</b>.</>}
              </p>
            </div>

            {error && (
              <span style={{ fontSize: 12, color: 'var(--danger, #D2545A)', fontWeight: 600 }}>{error}</span>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowPayDialog(false)}
                style={{ flex: 1, height: 50, borderRadius: 12, background: 'var(--sec-2, #F4F8FC)', border: '1px solid var(--hairline, #EAEAE3)', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14, color: 'var(--ink)', cursor: 'pointer' }}
              >
                Pay later
              </button>
              <button
                onClick={handlePay}
                disabled={loading}
                className="neonbtn"
                style={{ flex: 1, height: 50, borderRadius: 12, background: 'var(--neon)', border: 'none', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 14, letterSpacing: '-0.01em', color: 'var(--ink)', cursor: 'pointer', boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.6 : 1 }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>
                {loading ? 'Processing\u2026' : `Pay ${formatRupeesShort(invoice.brand_pays_paise)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
