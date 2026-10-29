'use client'

import { formatPaiseINR } from '@/lib/money'

/**
 * Guapd-managed shoots on the creator's Payments page (0542):
 *   - "Paid by Guapd": each Experience payout, its status, what was paid, the
 *     date and the bank reference (from creator_payouts, their own only);
 *   - bank details moved to BankRow, under UPI in "Payout method" (0580).
 */
export interface GuapdPayout {
  deal_id: string; title: string | null; brand_label: string; status: 'requested' | 'approved' | 'processing' | 'paid'
  net_paise: number; allowance_paise?: number; tds_paise: number; paid_paise: number; paid_on: string | null; reference: string | null
}
const STATUS: Record<string, string> = { requested: 'Being prepared', approved: 'Approved · on its way', processing: 'On its way', paid: 'Paid' }
const fmt = (iso: string | null) => iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export default function GuapdPayoutsSection({ payouts }: { payouts: GuapdPayout[] }) {
  if (payouts.length === 0) return null
  return (
    <section className="gp-wrap" aria-labelledby="gp-head">
      <h2 id="gp-head" className="gp-h2">Paid by Guapd</h2>

      <div className="gp-card">
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
                <div className="gp-muted">Net {formatPaiseINR(p.net_paise)}{p.allowance_paise ? ` · Allowance ${formatPaiseINR(p.allowance_paise)}` : ''}{p.tds_paise ? ` · TDS ${formatPaiseINR(p.tds_paise)}` : ''}</div>
              </div>
              <div className="gp-status">
                <span className={`gp-chip ${p.status === 'paid' ? 'gp-ok' : ''}`}>{STATUS[p.status] ?? p.status}</span>
                {p.status === 'paid' && <div className="gp-muted">{fmt(p.paid_on)} · ref {p.reference}</div>}
              </div>
            </div>
          ))}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .gp-wrap { margin: 24px 0 0; box-sizing: border-box; font-family: var(--font-ui); }
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
