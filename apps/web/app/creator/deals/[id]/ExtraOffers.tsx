'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatPaiseINR } from '@/lib/money'
import { countOf } from '@/lib/experience-request'
import type { CreatorLegExtra } from '@/lib/creator-leg-money'
import { respondToExtra } from './leg-actions'
import LegInvoiceForm from './LegInvoiceForm'
import { CardActions, DeliverableRow, MoneyRow, chipStyle } from './deal-cards'
import { metaLabel, sectionHeading } from './deal-shell'

/**
 * 0555: extra deliverables Guapd offers on an Experience deal, on the deal
 * page's card design. Open: what it adds, what the creator receives (the fee at
 * the % locked on this deal), Accept / Decline. Accepted: its own invoice and
 * payment, separate from the main fee. Every figure is from creator_leg_context
 * (this creator's own deal only).
 */
const fmt = (iso: string | null) => iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''

function ExtraCard({ dealId, x, defaultName }: { dealId: string; x: CreatorLegExtra; defaultName: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const answer = (accept: boolean) => {
    setError(null)
    start(async () => {
      const r = await respondToExtra(dealId, x.id, accept, accept ? '' : reason, Number(x.net_paise))
      if (!r.ok) { setError(r.message); return }
      setDeclining(false); router.refresh()
    })
  }
  const open = x.status === 'open'
  const pill = open ? 'Waiting for you' : x.status === 'accepted' ? (x.payout?.status === 'paid' ? 'Paid' : x.invoice ? 'Invoice sent' : x.can_invoice ? 'Ready to invoice' : 'Accepted') : x.status === 'declined' ? 'Declined' : 'Withdrawn'
  const dot = open ? 'var(--warning)' : x.status === 'accepted' ? (x.payout?.status === 'paid' ? 'var(--success, #16a34a)' : 'var(--neon-deep)') : 'var(--ink-faint)'
  const items = x.deliverables.reduce((n, d) => n + Number(d.count), 0)
  return (
    <div className="surface" style={{ padding: '22px 24px', ...(open ? { boxShadow: '0 0 0 2px var(--neon) inset, 0 8px 16px rgba(22,23,15,.04)' } : {}) }} id={`extra-${x.number}`}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={metaLabel}>Extra #{x.number}{x.created_at ? ` · ${fmt(x.created_at)}` : ''}</div>
          <h3 style={{ ...sectionHeading, marginTop: 6 }}>{open ? 'Extra offer from Guapd' : 'Extra deliverables'}</h3>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />{pill}
        </span>
      </div>
      {open && <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '10px 0 0' }}>The brand wants more from your shoot. This is on top of your agreed deal; your deal does not change unless you accept.</p>}
      <div style={{ marginTop: 10 }}>
        {x.deliverables.map((d, i) => (
          <DeliverableRow key={d.type} last={i === x.deliverables.length - 1} icon="video" label={`+ ${countOf(Number(d.count), d.type)}`}
            chips={i === 0 && x.pricing === 'per_item' && x.unit_paise ? [<span key="u" style={chipStyle}>{formatPaiseINR(Number(x.unit_paise))} each</span>] : []} />
        ))}
      </div>
      <MoneyRow label={x.pricing === 'per_item' && x.unit_paise ? `${items} × ${formatPaiseINR(Number(x.unit_paise))}` : 'Flat amount'} value={formatPaiseINR(Number(x.gross_paise))} />
      <MoneyRow label={`Platform fee (${Number(x.platform_pct)}%)`} value={`−${formatPaiseINR(Number(x.platform_fee_paise))}`} />
      <MoneyRow label="You receive" value={formatPaiseINR(Number(x.net_paise))} strong last />
      {x.message && <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '10px 0 0' }}>“{x.message}”</p>}
      {x.status === 'declined' && x.decline_reason && <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '10px 0 0' }}>You declined: “{x.decline_reason}”</p>}

      {open && !declining && (
        <CardActions>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" disabled={pending} onClick={() => setDeclining(true)}
              style={{ height: 44, padding: '0 18px', borderRadius: 12, border: '1px solid var(--border-hairline, #EAEAE3)', background: 'var(--card)', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Decline</button>
            <button type="button" className="neonbtn" disabled={pending} onClick={() => answer(true)}
              style={{ height: 44, padding: '0 22px', borderRadius: 12, border: 'none', background: 'var(--neon)', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
              {pending ? 'Saving…' : `Accept extra (${formatPaiseINR(Number(x.net_paise))})`}
            </button>
          </div>
        </CardActions>
      )}
      {open && declining && (
        <CardActions>
          <label style={{ ...metaLabel, display: 'block', marginBottom: 6 }} htmlFor={`extra-why-${x.id}`}>Tell Guapd why (optional)</label>
          <textarea id={`extra-why-${x.id}`} className="dinput" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
            style={{ width: '100%', height: 'auto', padding: '10px 12px' }} placeholder="e.g. I can do one more, not two" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <button type="button" disabled={pending} onClick={() => setDeclining(false)} style={{ height: 40, padding: '0 16px', borderRadius: 11, border: '1px solid var(--border-hairline, #EAEAE3)', background: 'var(--card)', fontWeight: 700, cursor: 'pointer' }}>Back</button>
            <button type="button" disabled={pending} onClick={() => answer(false)} style={{ height: 40, padding: '0 16px', borderRadius: 11, border: '1px solid #E5B8BB', background: '#FDF0F0', color: '#9C4147', fontWeight: 700, cursor: 'pointer' }}>{pending ? 'Sending…' : 'Decline extra'}</button>
          </div>
        </CardActions>
      )}

      {x.status === 'accepted' && (
        <CardActions>
          {x.can_invoice
            ? <LegInvoiceForm dealId={dealId} extraId={x.id} payablePaise={Number(x.net_paise)} payableLabel={formatPaiseINR(Number(x.net_paise))} shootLabel="" defaultName={defaultName} />
            : (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                  {x.payout?.status === 'paid' ? `Paid ${formatPaiseINR(Number(x.payout.paid_paise))}${x.payout.paid_on ? ` on ${fmt(x.payout.paid_on)}` : ''}${x.payout.reference ? ` · bank reference ${x.payout.reference}` : ''}.`
                    : x.payout ? (x.payout.status === 'approved' ? 'Approved. Guapd is sending this payout.' : 'Guapd is preparing this payout.')
                    : x.invoice ? `You sent invoice ${x.invoice.number}. Guapd pays you next.`
                    : 'Once your part of this extra is complete, confirm it here and raise its invoice.'}
                </span>
                {x.invoice && <a href={`/creator/deals/${dealId}/invoice?extra=${x.id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>Invoice {x.invoice.number} (PDF)</a>}
              </div>
            )}
        </CardActions>
      )}
      {error && <p role="alert" style={{ margin: '10px 0 0', fontSize: 12.5, color: '#9C4147' }}>{error}</p>}
    </div>
  )
}

export default function ExtraOffers({ dealId, extras, defaultName }: { dealId: string; extras: CreatorLegExtra[]; defaultName: string }) {
  if (extras.length === 0) return null
  const ordered = [...extras].sort((a, b) => (a.status === 'open' ? -1 : 0) - (b.status === 'open' ? -1 : 0) || b.number - a.number)
  return <>{ordered.map((x) => <ExtraCard key={x.id} dealId={dealId} x={x} defaultName={defaultName} />)}</>
}
