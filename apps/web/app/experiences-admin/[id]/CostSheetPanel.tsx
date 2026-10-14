'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { costLineTotalPaise } from '@/lib/experience-money'
import { formatRupees, rupeesToPaise } from '@/lib/experience-request'
import type { ConsoleCostLine, ConsoleCosts } from '@/lib/experience-console-server'
import { addCost, editCost, removeCost, type CostForm } from '../actions'
import { card, fieldLabel, formError, kpiLabel, neonBtn, pillBtn } from '../ui'

/**
 * The cost sheet (staff console, operational access): what Guapd spends
 * running this Experience. Recording only: nothing is paid from here
 * (creator payouts are the Payouts panel; Complete is the Completion panel, 0540). Creator pay is never a cost line; it lives on the
 * creator deals, so the database refuses per-video / day-rate / retainer
 * categories here. Lines are removed with a reason, never erased.
 *
 * The total shown is the figure the P&L subtracts (Guapd-provided lines only;
 * brand- or creator-provided items are noted at their value but cost Guapd
 * nothing). No brand price or margin appears here.
 */
const PROVIDED: Record<string, string> = { guapd: 'Guapd pays', brand: 'Brand provides', creator: 'Creator provides' }
const label = (c: string) => c.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase())

type Draft = { label: string; category: string; basis: 'per_unit' | 'flat_total'; quantity: string; unitRate: string; total: string; providedBy: 'guapd' | 'brand' | 'creator'; creatorLegDealId: string; note: string }
const empty = (cat: string): Draft => ({ label: '', category: cat, basis: 'flat_total', quantity: '', unitRate: '', total: '', providedBy: 'guapd', creatorLegDealId: '', note: '' })

export default function CostSheetPanel({ experienceId, costs, creators }: {
  experienceId: string
  costs: ConsoleCosts
  /** Creator legs on this Experience, to link a cost to one (e.g. their travel). */
  creators: { dealId: string; name: string }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [d, setD] = useState<Draft>(empty(costs.categories[0] ?? 'misc'))
  const [removing, setRemoving] = useState<ConsoleCostLine | null>(null)
  const [reason, setReason] = useState('')

  const open = ['rostering', 'confirmed', 'shoot_scheduled', 'shoot_done', 'delivering'].includes(costs.status)
  const complete = costs.status === 'complete'

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) { setError(r.error ?? 'Something went wrong'); return }
      after?.(); router.refresh()
    })
  }

  const openNew = () => { setError(null); setD(empty(costs.categories[0] ?? 'misc')); setEditing('new') }
  const openEdit = (l: ConsoleCostLine) => {
    setError(null)
    setD({ label: l.label, category: l.category, basis: l.basis, quantity: l.quantity != null ? String(l.quantity) : '',
      unitRate: l.unit_rate_paise != null ? String(l.unit_rate_paise / 100) : '', total: String(l.total_paise / 100),
      providedBy: l.provided_by, creatorLegDealId: l.creator_leg_deal_id ?? '', note: l.note ?? '' })
    setEditing(l.id)
  }
  const form = (): CostForm => ({ label: d.label, category: d.category, basis: d.basis, quantity: d.quantity, unitRate: d.unitRate,
    total: d.total, providedBy: d.providedBy, creatorLegDealId: d.creatorLegDealId || null, note: d.note })

  let preview: number | null = null
  if (d.basis === 'per_unit') {
    const rate = rupeesToPaise(d.unitRate)
    try { preview = rate != null && Number(d.quantity) > 0 ? costLineTotalPaise({ quantity: Number(d.quantity), unitRatePaise: rate }) : null } catch { preview = null }
  } else preview = rupeesToPaise(d.total)

  const save = () => {
    if (editing === 'new') run(() => addCost(experienceId, form()), () => setEditing(null))
    else if (editing) {
      const line = costs.lines.find((l) => l.id === editing)
      if (line) run(() => editCost(experienceId, line.id, form(), line.updated_at), () => setEditing(null))
    }
  }

  const editor = (
    <div style={{ marginTop: 14, padding: 16, borderRadius: 14, background: '#F7F7F4' }}>
      <div className="xp-cost-form" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
        <div>
          <label style={fieldLabel} htmlFor="cost-label">What it is</label>
          <input id="cost-label" className="dinput" maxLength={120} value={d.label} placeholder="Makeup artist, day 1" onChange={(e) => setD({ ...d, label: e.target.value })} />
        </div>
        <div>
          <label style={fieldLabel} htmlFor="cost-cat">Category</label>
          <select id="cost-cat" className="dinput" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })}>
            {costs.categories.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </div>
        <div>
          <label style={fieldLabel} htmlFor="cost-by">Who provides it</label>
          <select id="cost-by" className="dinput" value={d.providedBy} onChange={(e) => setD({ ...d, providedBy: e.target.value as Draft['providedBy'] })}>
            {Object.entries(PROVIDED).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={fieldLabel} htmlFor="cost-basis">Priced as</label>
          <select id="cost-basis" className="dinput" value={d.basis} onChange={(e) => setD({ ...d, basis: e.target.value as Draft['basis'] })}>
            <option value="flat_total">A flat amount</option>
            <option value="per_unit">Quantity × rate</option>
          </select>
        </div>
        {d.basis === 'per_unit' ? (
          <>
            <div>
              <label style={fieldLabel} htmlFor="cost-q">Quantity</label>
              <input id="cost-q" className="dinput" inputMode="decimal" value={d.quantity} placeholder="2" onChange={(e) => setD({ ...d, quantity: e.target.value.replace(/[^0-9.]/g, '') })} />
            </div>
            <div>
              <label style={fieldLabel} htmlFor="cost-rate">Rate (₹)</label>
              <input id="cost-rate" className="dinput" inputMode="decimal" value={d.unitRate} placeholder="4500" onChange={(e) => setD({ ...d, unitRate: e.target.value.replace(/[^0-9.]/g, '') })} />
            </div>
          </>
        ) : (
          <div>
            <label style={fieldLabel} htmlFor="cost-total">Amount (₹)</label>
            <input id="cost-total" className="dinput" inputMode="decimal" value={d.total} placeholder="9000" onChange={(e) => setD({ ...d, total: e.target.value.replace(/[^0-9.]/g, '') })} />
          </div>
        )}
        {creators.length > 0 && (
          <div>
            <label style={fieldLabel} htmlFor="cost-creator">For a creator (optional)</label>
            <select id="cost-creator" className="dinput" value={d.creatorLegDealId} onChange={(e) => setD({ ...d, creatorLegDealId: e.target.value })}>
              <option value="">Not one creator</option>
              {creators.map((c) => <option key={c.dealId} value={c.dealId}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={fieldLabel} htmlFor="cost-note">Note (optional)</label>
          <input id="cost-note" className="dinput" maxLength={1000} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-soft)' }}>
          {preview != null ? <>Total <b style={{ color: 'var(--ink)' }}>{formatRupees(preview)}</b>{d.providedBy !== 'guapd' ? ' (noted only, not a Guapd cost)' : ''}</> : 'Total —'}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" style={pillBtn} onClick={() => setEditing(null)}>Cancel</button>
        <button type="button" className="neonbtn" style={{ ...neonBtn, height: 40 }} disabled={pending} onClick={save}>{pending ? 'Saving…' : editing === 'new' ? 'Add cost' : 'Save'}</button>
      </div>
    </div>
  )

  return (
    <section className="surface" style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="sect-head">Costs <span style={{ color: 'var(--wg-500)', fontWeight: 500, marginLeft: 6 }}>{formatRupees(costs.guapd_total_paise)}</span></h2>
          <div className="sect-rule" />
        </div>
        {open && editing !== 'new' && <button type="button" className="neonbtn" style={{ ...neonBtn, height: 40 }} onClick={openNew}>Add a cost</button>}
      </div>
      <p className="t-body" style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--ink-soft)' }}>
        What Guapd spends running the shoot: travel, makeup, studio, editing. Creator pay is on the creator deals, not here.
        {complete && ' This Experience is Complete, so its costs are frozen; finance can reopen it to add a late cost.'}
      </p>

      {error && <div role="alert" style={{ ...formError, marginTop: 14 }}>{error}</div>}
      {editing === 'new' && editor}

      {costs.lines.length === 0 ? (
        <p className="t-body" style={{ margin: '16px 0 0' }}>No costs recorded yet.</p>
      ) : (
        <div style={{ marginTop: 10 }}>
          {costs.lines.map((l) => (
            <div key={l.id} style={{ borderTop: '1px solid var(--hairline)', padding: '14px 2px' }}>
              <div className="xp-cost-row" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr auto', gap: 12, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14.5, color: 'var(--ink)' }}>{l.label}</div>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)', marginTop: 2 }}>
                    {label(l.category)} · {PROVIDED[l.provided_by]}{l.creator_name ? ` · ${l.creator_name}` : ''}{l.note ? ` · ${l.note}` : ''}
                  </div>
                </div>
                <div className="t-body" style={{ fontSize: 13.5, textAlign: 'right' }}>
                  <b style={{ color: l.provided_by === 'guapd' ? 'var(--ink)' : 'var(--wg-500)' }}>{formatRupees(l.total_paise)}</b>
                  {l.basis === 'per_unit' && <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{l.quantity} × {formatRupees(l.unit_rate_paise)}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {open && <button type="button" style={{ ...pillBtn, height: 32 }} onClick={() => openEdit(l)}>Edit</button>}
                  {open && <button type="button" style={{ ...pillBtn, height: 32, color: '#9C4147' }} onClick={() => { setReason(''); setRemoving(l) }}>Remove</button>}
                </div>
              </div>
              {editing === l.id && editor}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog open={!!removing} title={`Remove "${removing?.label ?? ''}"`} tone="danger"
        body="It comes off the cost sheet and out of the P&L. The line is kept on record with your reason."
        detail={<div style={{ marginTop: 12 }}><label style={fieldLabel} htmlFor="cost-why">Why</label>
          <input id="cost-why" className="dinput" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Entered twice" /></div>}
        confirmLabel="Remove" busy={pending}
        onConfirm={() => removing && run(() => removeCost(experienceId, removing.id, reason, removing.updated_at), () => setRemoving(null))}
        onCancel={() => setRemoving(null)} />

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 860px) {
          .xp-cost-form { grid-template-columns: 1fr !important; }
          .xp-cost-row { grid-template-columns: 1fr auto !important; }
          .xp-cost-row > :last-child { grid-column: 1 / -1; justify-content: flex-start !important; }
        }
      ` }} />
    </section>
  )
}
