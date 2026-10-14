'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import StatusChip, { type ChipTone } from '@/components/StatusChip'
import { formatRupees } from '@/lib/experience-request'
import type { ConsoleAffiliate } from '@/lib/experience-console-server'
import { billAffiliates, closeAffiliate, reviewAffiliateClaim } from '../actions'
import { card, fieldLabel, formError, kpiLabel, neonBtn, pillBtn } from '../ui'
import { InvoiceEditor } from './InvoicesPanel'

/**
 * Affiliate commissions (0563). Each creator deal with an affiliate % locked on
 * it: once the brand marks their collab ads complete, the creator claims (the
 * sales through their link and their invoice). Operational staff approve it or
 * turn it down with a reason, or close a deal with no commission due. The
 * payout is under Creator payouts. Finance bills approved commissions to the
 * brand on a follow-on invoice (GST entered, as for every invoice).
 */
const STATE: Record<string, { label: string; tone: ChipTone }> = {
  sales_entered: { label: 'To review', tone: 'amber' },
  verified:      { label: 'Approved', tone: 'lime' },
  paid:          { label: 'Paid', tone: 'green' },
  cancelled:     { label: 'Turned down', tone: 'red' },
  closed:        { label: 'Closed, none due', tone: 'neutral' },
}

type Ask = { kind: 'decline' | 'close'; row: ConsoleAffiliate }

export default function CommissionPanel({ experienceId, rows, canBill, registered, open }: {
  experienceId: string
  rows: ConsoleAffiliate[]
  /** Finance bills the brand. */
  canBill: boolean
  /** Guapd's GST registration (for the invoice editor). */
  registered: boolean
  open: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [billing, setBilling] = useState(false)
  if (rows.length === 0) return null

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) { setError(r.error ?? 'Something went wrong'); return }
      after?.(); setAsk(null); setText(''); router.refresh()
    })
  }
  const billable = rows.filter((r) => r.claim && (r.claim.status === 'verified' || r.claim.status === 'paid') && !r.claim.billed_on)
  const sel = picked.filter((id) => billable.some((r) => r.claim!.id === id))
  const selSum = billable.filter((r) => sel.includes(r.claim!.id)).reduce((n, r) => n + Number(r.claim!.gross_paise ?? 0), 0)
  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''

  return (
    <section className="surface" style={{ ...card, marginTop: 20 }} id="xp-commission">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="sect-head">Affiliate commission</h2>
          <div className="sect-rule" />
        </div>
        {canBill && billable.length > 0 && !billing && (
          <button type="button" className="neonbtn" style={{ ...neonBtn, opacity: sel.length === 0 ? 0.45 : 1 }} disabled={pending || sel.length === 0}
            title={sel.length === 0 ? 'Tick the approved commissions to bill' : undefined} onClick={() => { setError(null); setBilling(true) }}>
            Bill the brand{sel.length ? ` (${sel.length})` : ''}
          </button>
        )}
      </div>
      <p className="t-body" style={{ margin: '10px 0 0', fontSize: 13 }}>
        Once the brand marks a creator&rsquo;s collab ads complete, the creator claims: the sales through their link, and their invoice for the % on their deal less their fee.
        Check the sales against the brand&rsquo;s affiliate report, then approve; the payout is under Creator payouts. Finance bills the brand for approved commissions.
      </p>

      {rows.map((r) => {
        const c = r.claim
        const st = c ? STATE[c.status] : null
        const canTick = canBill && c && billable.some((b) => b.claim!.id === c.id)
        return (
          <div key={r.deal_id} style={{ borderTop: '1px solid var(--hairline)', padding: '14px 0', marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {canTick && <input type="checkbox" aria-label={`Bill ${r.creator_name}'s commission`} checked={picked.includes(c!.id)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, c!.id] : picked.filter((x) => x !== c!.id))} />}
              <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14 }}>{r.creator_name}</span>
              <span style={{ ...kpiLabel, fontSize: 10 }}>{Number(r.affiliate_pct)}% of sales · fee {Number(r.platform_pct)}%</span>
              {st && <StatusChip label={st.label} tone={st.tone} />}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {open && c?.status === 'sales_entered' && <>
                  <button type="button" style={pillBtn} disabled={pending} onClick={() => { setText(''); setAsk({ kind: 'decline', row: r }) }}>Turn down</button>
                  <button type="button" className="neonbtn" style={{ ...neonBtn, height: 36 }} disabled={pending} onClick={() => run(() => reviewAffiliateClaim(experienceId, c.id, true, ''))}>Approve</button>
                </>}
                {open && (!c || c.status === 'cancelled') && (
                  <button type="button" style={pillBtn} disabled={pending} onClick={() => { setText(''); setAsk({ kind: 'close', row: r }) }}>No commission due</button>
                )}
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 6, display: 'grid', gap: 3 }}>
              {!c && <span>{r.claimable ? 'Ads complete: waiting for the creator to claim.' : `Collab ads complete: ${r.collabs_complete} of ${r.collabs}. The creator claims after the brand marks them all complete.`}</span>}
              {c && c.gross_paise != null && c.status !== 'closed' && (
                <span style={{ color: 'var(--ink)' }}>Sales {formatRupees(Number(c.sales_paise))} → commission {formatRupees(Number(c.gross_paise))} → fee {formatRupees(Number(c.platform_fee_paise))} → net <b>{formatRupees(Number(c.net_paise))}</b>{c.claimed_at ? ` · claimed ${fmt(c.claimed_at)}` : ''}</span>
              )}
              {c?.invoice && <span>Creator invoice <a href={`/experiences-admin/creator-invoice/${c.invoice.id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', fontWeight: 700 }}>{c.invoice.number}</a>{c.invoice.gstin ? ` · GSTIN ${c.invoice.gstin}` : ''}</span>}
              {c?.review_note && (c.status === 'cancelled' || c.status === 'closed') && <span style={{ color: '#8C6417' }}>{c.status === 'closed' ? 'Closed' : 'Turned down'}: {c.review_note}</span>}
              {c?.billed_on && <span>Billed to the brand on {c.billed_on.number ?? 'a draft invoice'} ({c.billed_on.status})</span>}
              {c && (c.status === 'verified' || c.status === 'paid') && !c.billed_on && <span style={{ color: '#8C6417' }}>Not billed to the brand yet.</span>}
            </div>
            {ask?.row.deal_id === r.deal_id && (
              <div style={{ marginTop: 10, padding: 14, borderRadius: 12, background: '#F7F7F4', display: 'grid', gap: 10 }}>
                <label style={fieldLabel} htmlFor={`cm-${r.deal_id}`}>{ask.kind === 'decline' ? 'Why (the creator sees this and can claim again)' : 'Why no commission is due'}</label>
                <input id={`cm-${r.deal_id}`} className="dinput" maxLength={300} value={text} onChange={(e) => setText(e.target.value)}
                  placeholder={ask.kind === 'decline' ? 'The brand report shows lower sales' : 'No sales through the link'} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" style={pillBtn} disabled={pending} onClick={() => setAsk(null)}>Cancel</button>
                  <button type="button" className="neonbtn" style={{ ...neonBtn, height: 38 }} disabled={pending || text.trim().length < 3}
                    onClick={() => run(() => ask.kind === 'decline' ? reviewAffiliateClaim(experienceId, c!.id, false, text) : closeAffiliate(experienceId, r.deal_id, text))}>
                    {pending ? 'Saving…' : ask.kind === 'decline' ? 'Turn it down' : 'Close it'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {billing && sel.length > 0 && (
        <InvoiceEditor registered={registered} busy={pending} fixedAmountLabel={formatRupees(selSum)}
          defaults={{ description: 'Affiliate commission on collab sales', amount: '' }}
          onCancel={() => setBilling(false)}
          onSave={(f) => run(() => billAffiliates(experienceId, sel, f), () => { setBilling(false); setPicked([]) })} />
      )}
      {error && <div role="alert" style={{ ...formError, marginTop: 12 }}>{error}</div>}
    </section>
  )
}
