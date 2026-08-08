'use client'

import { useState } from 'react'
import Link from 'next/link'
import { generateInvoice, issueInvoice } from './actions'
import { formatDueStatus } from '@/lib/invoice'

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

interface InvoiceItem {
  label: string
  price_paise: number | null
}

function formatINR(paise: number): string {
  const rupees = paise / 100
  const s = String(Math.round(rupees))
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  return '\u20B9' + (rest ? rest.replace(/\B(?=(\d\d)+(?!\d))/g, ',') + ',' + last3 : last3)
}

function fmtDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getDate()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${day} ${months[d.getMonth()]}, ${h12}:${m} ${ampm}`
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getDate()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${day} ${months[d.getMonth()]}`
}

interface Props {
  dealId: string
  dealRef?: string | null
  invoice: Invoice | null
  isPosted: boolean
  creatorReceivesPaise?: number | null
  brandPaysPaise?: number | null
  feePaise?: number | null
  feePercent?: number | null
  feeMode?: string | null
  paymentTerms?: string | null
  items?: InvoiceItem[]
  brandName?: string
}

export default function InvoiceCard({ dealId, dealRef, invoice, isPosted, creatorReceivesPaise, brandPaysPaise, feePaise, feePercent, feeMode, paymentTerms, items, brandName }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setError(null)
    setLoading(true)
    const res = await generateInvoice(dealId)
    setLoading(false)
    if (res.status === 'error') setError(res.message)
  }

  async function handleIssue() {
    setError(null)
    setLoading(true)
    const res = await issueInvoice(dealId)
    setLoading(false)
    if (res.status === 'error') setError(res.message)
  }

  // If invoice exists, show the invoice detail view
  if (invoice) {
    return <InvoiceDetail invoice={invoice} dealRef={dealRef} dealId={dealId} onIssue={handleIssue} loading={loading} error={error} items={items} brandName={brandName} />
  }

  // Pre-invoice state — show the money breakdown
  const hasAmounts = creatorReceivesPaise != null && creatorReceivesPaise > 0
  const invoiceDot = isPosted ? 'var(--neon-deep)' : 'var(--ink-faint)'
  const invoiceStatus = isPosted ? 'READY' : 'AWAITING POST'

  const helperText = !isPosted
    ? 'Invoicing opens as soon as the post is marked live.'
    : 'Your content is posted. Raise an invoice to request payment.'

  const termsText = paymentTerms || 'paid 7 days after the invoice is raised'

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Invoice</h3>
        <span style={statusPill}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: invoiceDot }} />
          {invoiceStatus}
        </span>
      </div>

      {/* Info helper */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, maxWidth: 640 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
        <span style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-soft)' }}>{helperText}</span>
      </div>

      {/* Two-column money breakdown */}
      {hasAmounts && (
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginTop: 22 }}>
          <div style={{ flex: 1.3, paddingRight: 32 }}>
            <div style={metaLabel}>You receive</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 8 }}>
              {formatINR(creatorReceivesPaise!)}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 8 }}>{termsText}</div>
          </div>
          <div style={{ flex: 1, paddingLeft: 32, borderLeft: '1px solid var(--border-hairline, #EAEAE3)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
            {brandPaysPaise != null && (
              <div>
                <div style={metaLabel}>Deal total</div>
                <div style={amountValue}>{formatINR(brandPaysPaise)}</div>
              </div>
            )}
            {feePaise != null && feePaise > 0 && feePercent != null && (
              <div>
                <div style={metaLabel}>Platform fee ({feePercent}%), paid by the brand</div>
                <div style={amountValue}>{formatINR(feePaise)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer with action */}
      <div style={{ padding: '20px 0 0', marginTop: 20, borderTop: '1px solid var(--border-hairline, #EAEAE3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-soft)', maxWidth: 440 }}>
          {!isPosted ? 'Invoicing opens as soon as the post is marked live.' : 'Ready to invoice — raise it to notify the brand.'}
        </span>
        <button
          className="neonbtn"
          onClick={handleGenerate}
          disabled={loading || !isPosted}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            height: 42, padding: '0 18px', borderRadius: 11,
            background: isPosted ? 'var(--neon)' : 'var(--sec-2, #f5f5f0)', border: 'none',
            boxShadow: isPosted ? '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)' : 'none',
            fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5,
            color: isPosted ? 'var(--ink)' : 'var(--ink-faint)',
            cursor: !isPosted || loading ? 'not-allowed' : 'pointer',
            opacity: !isPosted ? 0.6 : 1,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
          {loading ? 'Generating...' : 'Raise invoice'}
        </button>
      </div>

      {error && <p style={errorStyle}>{error}</p>}
    </>
  )
}

function InvoiceDetail({ invoice, dealRef, dealId, onIssue, loading, error, items, brandName }: {
  invoice: Invoice; dealRef?: string | null; dealId: string; onIssue: () => void; loading: boolean; error: string | null; items?: InvoiceItem[]; brandName?: string
}) {
  const dueStatus = formatDueStatus(invoice.due_date)
  const isIssued = invoice.status === 'issued'
  const isAccepted = invoice.status === 'accepted'
  const isPaid = invoice.status === 'paid'
  const isAwaitingPayment = isIssued || isAccepted

  // Status label
  const statusLabel = isPaid ? 'Paid'
    : isAccepted ? 'Accepted, awaiting payment'
    : isIssued ? 'Sent, awaiting payment'
    : invoice.status === 'draft' ? 'Draft'
    : invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)

  const statusDot = STATUS_DOTS[invoice.status] ?? 'var(--ink-faint)'

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
          Invoice {dealRef && <span style={{ color: 'var(--ink-faint)', fontWeight: 600 }}>#{dealRef}</span>}
        </h3>
        <span style={statusPill}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusDot }} />
          {statusLabel}
        </span>
      </div>

      {/* Line items */}
      <div style={{ marginTop: 18 }}>
        {items && items.length > 0 && items.map((item, i) => (
          item.price_paise != null && (
            <div key={i} style={lineRow}>
              <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{item.label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>{formatINR(item.price_paise)}</span>
            </div>
          )
        ))}
        {invoice.fee_paise > 0 && (
          <div style={lineRow}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
              Platform fee ({invoice.fee_percent}%), {invoice.fee_mode === 'deducted' ? 'deducted' : 'paid by the brand'}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>{formatINR(invoice.fee_paise)}</span>
          </div>
        )}
        <div style={lineRow}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Deal total</span>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>{formatINR(invoice.brand_pays_paise)}</span>
        </div>
      </div>

      {/* "You receive" dark bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        padding: '18px 24px', margin: '16px -24px 0', background: 'var(--ink)', color: '#FFFFFF',
      }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>You receive</span>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1, fontSize: 34 }}>
          {formatINR(invoice.creator_receives_paise)}
        </span>
      </div>

      {/* Sent info */}
      {invoice.issued_at && (
        <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 18 }}>
          Sent to {brandName || 'brand'} {fmtDateTime(invoice.issued_at)}
          {invoice.payment_terms ? ` · ${invoice.payment_terms}` : invoice.due_date ? ` · payment due by ${fmtDate(invoice.due_date)}` : ''}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
        {/* Left: status info */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, maxWidth: 460 }}>
          {isAwaitingPayment && (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
              <div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: '.04em', color: 'var(--ink-soft)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)' }} />
                  Payment on the way
                </span>
                <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-soft)', marginTop: 6 }}>
                  Your invoice has been sent to {brandName || 'the brand'}.
                  {invoice.due_date ? ` Payment is due by ${fmtDate(invoice.due_date)}.` : ''}
                </span>
              </div>
            </>
          )}

          {isPaid && (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--success, #16a34a)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M20 6 9 17l-5-5" /></svg>
              <div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: '.04em', color: 'var(--success, #16a34a)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success, #16a34a)' }} />
                  Payment received
                </span>
                <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-soft)', marginTop: 6 }}>
                  {formatINR(invoice.creator_receives_paise)} received
                  {invoice.accepted_at ? ` · paid ${fmtDate(invoice.accepted_at)}` : ''}
                </span>
              </div>
            </>
          )}

          {invoice.status === 'draft' && (
            <span style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-soft)' }}>
              Invoice generated. Issue it to send to the brand.
            </span>
          )}

          {dueStatus?.urgent && (
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#dc2626', marginTop: 4 }}>
              {dueStatus.text}
            </span>
          )}
        </div>

        {/* Right: action */}
        {invoice.status === 'draft' && (
          <button
            className="neonbtn"
            onClick={onIssue}
            disabled={loading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              height: 42, padding: '0 18px', borderRadius: 11,
              background: 'var(--neon)', border: 'none',
              boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
              fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, color: 'var(--ink)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Issuing...' : 'Issue to brand'}
          </button>
        )}

        {isAwaitingPayment && (
          <Link href="/creator/inbox" className="pill-hover" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            height: 54, padding: '0 20px', borderRadius: 14,
            background: 'var(--card)', border: '1px solid var(--frost-edge, var(--border-hairline, #EAEAE3))',
            boxShadow: '0 8px 18px -12px rgba(40,45,25,.42)',
            fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer', textDecoration: 'none',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>
            Message brand
          </Link>
        )}
      </div>

      {error && <p style={errorStyle}>{error}</p>}
    </>
  )
}

const metaLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '.14em',
  textTransform: 'uppercase',
  color: 'var(--ink-faint)',
}

const amountValue: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: '-0.025em',
  marginTop: 5,
}

const lineRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 14,
  padding: '13px 0',
  borderBottom: '1px solid var(--border-hairline, #EAEAE3)',
}

const statusPill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.04em',
  color: 'var(--ink-soft)',
}

const errorStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: '#dc2626',
  margin: '10px 0 0',
  background: '#fef2f2',
  padding: '6px 10px',
  borderRadius: 8,
}

const STATUS_DOTS: Record<string, string> = {
  draft: 'var(--ink-faint)',
  issued: 'var(--warning)',
  accepted: 'var(--neon-deep)',
  paid: 'var(--success, #16a34a)',
  overdue: '#dc2626',
}
