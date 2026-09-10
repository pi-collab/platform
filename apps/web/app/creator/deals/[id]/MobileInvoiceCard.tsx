'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { generateInvoice, issueInvoice } from './actions'

/**
 * The invoice card on the creator's phone, built to
 * "Creator Deal Detail - Invoice Mobile".
 *
 * ── One button, two server actions ─────────────────────────────────────────
 * The export has a single "Issue to brand". Ours is two steps: generateInvoice
 * writes the draft from the deal's snapshotted fee and terms, issueInvoice
 * sends it. A creator has no reason to care about that seam, so the button runs
 * both — and only the second when a draft already exists, which is what happens
 * if a previous attempt failed halfway.
 */
export default function MobileInvoiceCard({
  dealId, dealRef, hasDraft, issued, accepted, issuedAt, acceptedAt, dueLabel, dueUrgent,
  basePaise, feePaise, feePercent, receivesPaise,
}: {
  dealId: string
  dealRef: string | null
  hasDraft: boolean
  issued: boolean
  /* The brand has agreed the invoice but the money has not arrived. Desktop
     already separates this from "sent, awaiting payment"; without it a creator
     cannot tell a brand that has acknowledged the bill from one that has not
     opened it. */
  accepted: boolean
  issuedAt: string | null
  acceptedAt: string | null
  dueLabel: string | null
  dueUrgent: boolean
  basePaise: number | null
  feePaise: number | null
  feePercent: number | null
  receivesPaise: number | null
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function inr(paise: number): string {
    return '₹' + Math.round(paise / 100).toLocaleString('en-IN')
  }

  async function handleIssue() {
    setError(null)
    setLoading(true)
    if (!hasDraft) {
      const gen = await generateInvoice(dealId)
      if (gen.status === 'error') { setLoading(false); setError(gen.message); return }
    }
    const res = await issueInvoice(dealId)
    setLoading(false)
    if (res.status === 'error') setError(res.message)
    else router.refresh()
  }

  return (
    <section className="offer-m__card offer-m__invoice">
      <div className="offer-m__submithead">
        <h2 className="offer-m__submittitle">Invoice</h2>
        {dealRef && <span className="offer-m__label">#{dealRef}</span>}
      </div>

      <div className="offer-m__invrows">
        {basePaise !== null && (
          <div className="offer-m__termrow"><span>Deliverables</span><span>{inr(basePaise)}</span></div>
        )}
        {feePaise !== null && feePaise > 0 && (
          <div className="offer-m__termrow">
            <span>Platform fee{feePercent ? ` (${feePercent}%)` : ''}</span>
            <span>&minus;{inr(feePaise)}</span>
          </div>
        )}
        {receivesPaise !== null && (
          <div className="offer-m__termrow offer-m__termrow--total">
            <span>You receive</span>
            <b>{inr(receivesPaise)}</b>
          </div>
        )}
      </div>

      <div className="offer-m__invnote">
        Per agreed terms &middot;{' '}
        {accepted && acceptedAt ? `accepted ${acceptedAt}`
          : issued ? `issued ${issuedAt ?? ''}`.trim()
          : 'not yet sent'}
      </div>

      {issued ? (
        <div className="offer-m__invoicestate">
          {/* Amber while it is merely sent; green once the brand has accepted
              it. Same two colours desktop uses for these statuses. */}
          <span
            className={`offer-m__invoicedot${accepted ? ' offer-m__invoicedot--done' : ''}`}
            aria-hidden="true"
          />
          <span className="offer-m__label">
            {accepted ? 'Accepted, awaiting payment' : 'Sent, awaiting payment'}
            {dueLabel && (
              <> &middot; <span className={dueUrgent ? 'offer-m__invdue' : undefined}>{dueLabel}</span></>
            )}
          </span>
        </div>
      ) : (
        <button type="button" className="offer-m__invbtn" onClick={handleIssue} disabled={loading}>
          {loading ? 'Issuing…' : 'Issue to brand'}
        </button>
      )}

      {error && <div className="offer-m__inverr">{error}</div>}
    </section>
  )
}
