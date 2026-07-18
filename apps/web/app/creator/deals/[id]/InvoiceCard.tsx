'use client'

import { useState } from 'react'
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

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `\u20B9${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `\u20B9${(rupees / 1000).toFixed(0)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

export default function InvoiceCard({ dealId, invoice, isPosted }: { dealId: string; invoice: Invoice | null; isPosted: boolean }) {
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

  // No invoice yet
  if (!invoice) {
    // Gate: must post before invoicing
    if (!isPosted) {
      return (
        <div style={cardStyle}>
          <h3 style={cardTitle}>Invoice</h3>
          <p style={cardDesc}>Post your content first, then generate an invoice for payment.</p>
          <p style={{ fontSize: '0.75rem', color: '#854d0e', fontWeight: 600, margin: 0, padding: '0.375rem 0.5rem', background: '#fef9c3', borderRadius: 6 }}>
            Mark the content as posted before invoicing
          </p>
        </div>
      )
    }

    return (
      <div style={cardStyle}>
        <h3 style={cardTitle}>Invoice</h3>
        <p style={cardDesc}>Your content is posted and approved. Generate an invoice to send to the brand for payment.</p>
        {error && <p style={errorStyle}>{error}</p>}
        <button onClick={handleGenerate} disabled={loading} style={{ ...actionBtn, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Generating...' : 'Generate invoice'}
        </button>
      </div>
    )
  }

  const dueStatus = formatDueStatus(invoice.due_date)

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ ...cardTitle, margin: 0 }}>Invoice</h3>
        <span style={{ ...statusBadge, ...STATUS_STYLES[invoice.status] }}>{invoice.status}</span>
      </div>

      {/* Line items — fee only shown to creator when deducted (it affects their payout) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.75rem' }}>
        <Row label="Deliverables" value={formatRupees(invoice.base_paise)} />
        {invoice.overage_paise > 0 && (
          <Row label="Revision overage" value={formatRupees(invoice.overage_paise)} />
        )}
        {invoice.fee_paise > 0 && invoice.fee_mode === 'deducted' && (
          <Row
            label={`Platform fee (${invoice.fee_percent}%)`}
            value={`\u2212${formatRupees(invoice.fee_paise)}`}
          />
        )}
        <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '0.375rem', marginTop: '0.15rem' }}>
          <Row label="You receive" value={formatRupees(invoice.creator_receives_paise)} bold />
        </div>
      </div>

      {/* Payment terms + due date */}
      {invoice.payment_terms && (
        <p style={{ fontSize: '0.75rem', color: '#888', margin: '0 0 0.25rem' }}>
          Terms: {invoice.payment_terms}
        </p>
      )}
      {dueStatus && (
        <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: dueStatus.urgent ? '#dc2626' : '#16a34a', margin: '0 0 0.5rem' }}>
          {dueStatus.text}
        </p>
      )}
      {invoice.issued_at && (
        <p style={{ fontSize: '0.6875rem', color: '#aaa', margin: '0 0 0.25rem' }}>
          Issued {new Date(invoice.issued_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      )}
      {invoice.accepted_at && (
        <p style={{ fontSize: '0.6875rem', color: '#aaa', margin: '0 0 0.25rem' }}>
          Accepted {new Date(invoice.accepted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      )}

      {error && <p style={errorStyle}>{error}</p>}

      {/* Draft: issue to brand */}
      {invoice.status === 'draft' && (
        <button onClick={handleIssue} disabled={loading} style={{ ...actionBtn, opacity: loading ? 0.6 : 1, marginTop: '0.5rem' }}>
          {loading ? 'Issuing...' : 'Issue to brand'}
        </button>
      )}

      {/* Issued: waiting */}
      {invoice.status === 'issued' && (
        <p style={{ fontSize: '0.8125rem', color: '#854d0e', fontWeight: 600, margin: '0.5rem 0 0' }}>
          Waiting for brand to accept
        </p>
      )}

      {/* Accepted: waiting for payment */}
      {invoice.status === 'accepted' && (
        <p style={{ fontSize: '0.8125rem', color: '#166534', fontWeight: 600, margin: '0.5rem 0 0' }}>
          Invoice accepted — awaiting payment
        </p>
      )}

      {/* Paid: done */}
      {invoice.status === 'paid' && (
        <p style={{ fontSize: '0.8125rem', color: '#065f46', fontWeight: 600, margin: '0.5rem 0 0' }}>
          Paid — {formatRupees(invoice.creator_receives_paise)} received
        </p>
      )}
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ fontSize: '0.8125rem', color: bold ? '#111' : '#666', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize: '0.8125rem', fontFamily: 'monospace', fontWeight: bold ? 700 : 500, color: '#111' }}>{value}</span>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  padding: '1.25rem',
  border: '1px solid #e5e5e5',
  borderRadius: 12,
  background: '#fff',
}

const cardTitle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#555',
  margin: '0 0 0.75rem',
}

const cardDesc: React.CSSProperties = {
  fontSize: '0.8125rem',
  color: '#666',
  margin: '0 0 1rem',
  lineHeight: 1.5,
}

const actionBtn: React.CSSProperties = {
  width: '100%',
  padding: '0.625rem',
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: '0.875rem',
  fontWeight: 700,
  cursor: 'pointer',
}

const errorStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  color: '#dc2626',
  margin: '0.5rem 0 0',
  background: '#fef2f2',
  padding: '0.375rem 0.5rem',
  borderRadius: 6,
}

const statusBadge: React.CSSProperties = {
  fontSize: '0.625rem',
  fontWeight: 600,
  padding: '0.1rem 0.4rem',
  borderRadius: 9999,
  textTransform: 'capitalize',
}

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  draft:    { background: '#f3f4f6', color: '#6b7280' },
  issued:   { background: '#fef9c3', color: '#854d0e' },
  accepted: { background: '#dcfce7', color: '#166534' },
  paid:     { background: '#d1fae5', color: '#065f46' },
  overdue:  { background: '#fee2e2', color: '#991b1b' },
}
