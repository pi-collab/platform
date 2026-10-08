'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { formatRupees } from '@/lib/experience-request'
import type { ExperiencePnl } from '@/lib/experience-pnl-server'
import { reopenExperience } from '../actions'
import { card, fieldLabel, formError, kpiLabel, pillBtn } from '../ui'

/**
 * The Experience P&L (staff console). Rendered ONLY for staff with financial
 * access, and fed only by experience_pnl(), which checks that access again in
 * Postgres (0537). One margin, two ways:
 *
 *   brand revenue (INVOICED before GST; ₹0 and "pending invoice" until one is issued)
 *   − creator payouts at gross   (accepted legs only)
 *   − Guapd costs
 *   = sub-total
 *   + platform fee kept          (Σ per creator at their own track %)
 *   = Guapd margin               = revenue − Σ creator net − costs
 *
 * Reviewed exception in scripts/check-pnl-isolation.ts: the one component
 * allowed to display margin figures.
 */
export default function PnlPanel({ experienceId, status, pnl }: { experienceId: string; status: string; pnl: ExperiencePnl }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirm, setConfirm] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const n = (v: number | null | undefined) => Number(v ?? 0)

  const reopen = () => {
    setError(null)
    start(async () => {
      const r = await reopenExperience(experienceId, reason)
      if (!r.ok) { setError(r.error); return }
      setConfirm(false); router.refresh()
    })
  }

  const line = (label: string, value: string, opts: { sub?: string; strong?: boolean; muted?: boolean; indent?: boolean } = {}) => (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: opts.strong ? '12px 0' : '8px 0', paddingLeft: opts.indent ? 14 : 0,
      borderTop: opts.strong ? '1px solid var(--hairline)' : 'none' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: opts.strong ? 14.5 : 13.5, fontWeight: opts.strong ? 700 : 500, color: opts.muted ? 'var(--ink-soft)' : 'var(--ink)' }}>{label}</div>
        {opts.sub && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>{opts.sub}</div>}
      </div>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: opts.strong ? 15.5 : 13.5, fontWeight: opts.strong ? 700 : 600, color: opts.muted ? 'var(--ink-soft)' : 'var(--ink)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
  const neg = (v: number) => (v ? `−${formatRupees(v)}` : formatRupees(0))

  return (
    <section className="surface" style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="sect-head">P&amp;L</h2>
          <div className="sect-rule" />
        </div>
        <span style={{ ...kpiLabel, fontSize: 10.5 }}>{pnl.source === 'snapshot' ? `Final · ${pnl.captured_at ? new Date(pnl.captured_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}` : 'Live'} · finance only</span>
      </div>

      <div style={{ marginTop: 12 }}>
        {line('Brand revenue', pnl.revenue_pending_invoice ? '₹0' : formatRupees(n(pnl.brand_revenue_paise)), {
          sub: pnl.revenue_pending_invoice ? 'Revenue pending invoice: counted once a service invoice is issued' : `Invoiced before GST (${pnl.invoices_counted} invoice${pnl.invoices_counted === 1 ? '' : 's'})`,
        })}
        {pnl.invoiced_vs_agreed_paise != null && n(pnl.invoiced_vs_agreed_paise) !== 0 && (
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: '#8C6417', padding: '0 0 6px 14px' }}>
            Invoiced {n(pnl.invoiced_vs_agreed_paise) > 0 ? 'more' : 'less'} than agreed by {formatRupees(Math.abs(n(pnl.invoiced_vs_agreed_paise)))}
          </div>
        )}
        {pnl.brand_agreed_paise != null && line('Agreed with the brand', formatRupees(n(pnl.brand_agreed_paise)), { sub: 'Context only, not revenue until invoiced', muted: true, indent: true })}
        {line('Creator payouts (gross)', neg(n(pnl.creator_gross_total_paise)), { sub: `${pnl.legs_counted} accepted creator${pnl.legs_counted === 1 ? '' : 's'}` })}
        {line('Guapd costs', neg(n(pnl.guapd_costs_total_paise)))}
        {(pnl.costs_by_category ?? []).map((c) => line(c.category.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()), neg(n(c.total_paise)), { muted: true, indent: true }))}
        {line('Sub-total', formatRupees(n(pnl.subtotal_paise)), { strong: true })}
        {line('+ Platform fee kept', formatRupees(n(pnl.platform_fee_kept_paise)), { sub: 'Difference between creator gross and what Guapd pays them, per creator at their own track %', muted: true })}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '14px 16px', marginTop: 6, borderRadius: 14, background: '#F4FBDC' }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Guapd margin</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{formatRupees(n(pnl.guapd_margin_paise))}</span>
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 6 }}>= revenue − what Guapd pays creators (net) − costs</div>
      </div>

      {pnl.invoiced_total_paise != null && (
        <div style={{ marginTop: 16 }}>
          <div style={kpiLabel}>Cash</div>
          {line('Received from the brand', formatRupees(n(pnl.brand_received_paise)), { sub: `Of ${formatRupees(n(pnl.invoiced_total_paise))} invoiced incl. GST${n(pnl.brand_tds_withheld_paise) ? ` · TDS withheld ${formatRupees(n(pnl.brand_tds_withheld_paise))}` : ''}` })}
          {line('Outstanding', formatRupees(n(pnl.brand_outstanding_paise)), { muted: !n(pnl.brand_outstanding_paise), indent: true })}
          {n(pnl.gst_liability_paise) > 0 && line('GST billed', formatRupees(n(pnl.gst_liability_paise)), { sub: 'Collected for the government: a liability, not revenue', muted: true, indent: true })}
          {line('Paid to creators', formatRupees(n(pnl.creator_paid_out_paise)), { sub: `${pnl.creator_payouts_paid ?? 0} paid · ${pnl.creator_payouts_due ?? 0} still to pay${n(pnl.creator_tds_withheld_paise) ? ` · TDS withheld ${formatRupees(n(pnl.creator_tds_withheld_paise))}` : ''}` })}
          {(pnl.invoices_draft ?? 0) > 0 && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-soft)' }}>{pnl.invoices_draft} draft invoice{pnl.invoices_draft === 1 ? '' : 's'}: not counted until issued.</div>}
        </div>
      )}

      {(pnl.per_leg ?? []).length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={kpiLabel}>Per creator (accepted)</div>
          {pnl.per_leg.map((l) => (
            <div key={l.deal_id} className="xp-pnl-leg" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 10, padding: '10px 0', borderTop: '1px solid var(--hairline)', fontFamily: 'var(--font-ui)', fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{l.full_name ?? 'Creator'}<span style={{ display: 'block', fontWeight: 400, fontSize: 11.5, color: 'var(--ink-faint)' }}>{l.platform_track === 'growth' ? 'Growth' : 'Deals'} · {Number(l.platform_pct)}%</span></span>
              <span>{formatRupees(n(l.creator_gross_paise))}<span style={{ display: 'block', fontSize: 11, color: 'var(--ink-faint)' }}>gross</span></span>
              <span>{formatRupees(n(l.platform_fee_paise))}<span style={{ display: 'block', fontSize: 11, color: 'var(--ink-faint)' }}>fee kept</span></span>
              <span>{formatRupees(n(l.creator_net_paise))}<span style={{ display: 'block', fontSize: 11, color: 'var(--ink-faint)' }}>net</span></span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-soft)', marginTop: 14, display: 'grid', gap: 4 }}>
        {pnl.legs_awaiting > 0 && <span>{pnl.legs_awaiting} offer{pnl.legs_awaiting === 1 ? '' : 's'} awaiting an answer ({formatRupees(n(pnl.awaiting_net_paise))} net if accepted). Not counted.</span>}
        {pnl.legs_declined > 0 && <span>{pnl.legs_declined} declined or withdrawn. Not counted.</span>}
        {(pnl.legs_did_not_shoot ?? 0) > 0 && <span>{pnl.legs_did_not_shoot} accepted but did not shoot. Not counted.</span>}
        {(pnl.prospects_pending ?? 0) > 0 && <span>{pnl.prospects_pending} not on Guapd yet (about {formatRupees(n(pnl.prospects_estimate_paise))} expected). Not counted until they join and accept a deal.</span>}
      </div>

      {status === 'complete' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--hairline)', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)' }}>Frozen at Complete. A late cost needs a reopen, which clears both sign-offs.</span>
          <button type="button" style={pillBtn} onClick={() => { setReason(''); setError(null); setConfirm(true) }}>Reopen</button>
        </div>
      )}
      {error && <div role="alert" style={{ ...formError, marginTop: 12 }}>{error}</div>}

      <ConfirmDialog open={confirm} title="Reopen this Experience" tone="danger"
        body="This un-freezes its P&L and moves it back to Delivering so a late cost can be added. Complete it again afterwards. The reopen and your reason are recorded."
        detail={<div style={{ marginTop: 12 }}><label style={fieldLabel} htmlFor="reopen-why">Why</label>
          <input id="reopen-why" className="dinput" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Makeup invoice arrived late" /></div>}
        confirmLabel="Reopen" busy={pending} onConfirm={reopen} onCancel={() => setConfirm(false)} />

      <style>{`@media (max-width: 860px) { .xp-pnl-leg { grid-template-columns: 1fr 1fr !important; } }`}</style>
    </section>
  )
}
