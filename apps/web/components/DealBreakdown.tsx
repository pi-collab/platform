import { formatPaiseINR } from '@/lib/money'
import { formatBasisPoints, boostingPerDayPaise } from '@/lib/addons'

/**
 * The itemised money on a deal: what each deliverable cost and what was added
 * to it.
 *
 * ONE component, rendered to both parties. A brand-side breakdown and a
 * creator-side breakdown that are written separately are two chances to
 * disagree about a number they are both looking at, and the one place that
 * cannot happen is money.
 *
 * Every figure here is READ from the row. Nothing is recomputed from a rate:
 * the deliverable total is price + stored charges, and the deal total is the
 * sum of those. That is the same rule lib/addons enforces at write time, held
 * again at display time so the invoice cannot drift from the payment.
 */

export interface BreakdownItem {
  label: string
  platform: string
  handle: string
  price_paise: number | null
  collab_charge_paise?: number | null
  collab_rate_type?: 'fixed' | 'percent' | null
  collab_rate_value?: number | null
  boosting_days?: number | null
  boosting_charge_paise?: number | null
  boosting_30day_paise?: number | null
}

/** True when any line carries an add-on — used to skip the section entirely. */
export function hasAddons(items: BreakdownItem[]): boolean {
  return items.some(i => i.collab_charge_paise != null || i.boosting_charge_paise != null)
}

export default function DealBreakdown({ items, totalPaise }: {
  items: BreakdownItem[]
  /** The deal's stored total. Shown as-is; never derived from the lines here. */
  totalPaise?: number | null
}) {
  if (!items.length) return null

  // Only the sum of what is printed above it, so the column always adds up.
  const summed = items.reduce(
    (t, i) => t + (i.price_paise ?? 0) + (i.collab_charge_paise ?? 0) + (i.boosting_charge_paise ?? 0),
    0,
  )

  return (
    <div className="dbd">
      {items.map((it, idx) => {
        const base = it.price_paise ?? 0
        const collab = it.collab_charge_paise ?? null
        const boost = it.boosting_charge_paise ?? null
        const lineTotal = base + (collab ?? 0) + (boost ?? 0)
        const hasExtras = collab != null || boost != null

        return (
          <div key={idx} className="dbd-item">
            <div className="dbd-row dbd-row-base">
              <span className="dbd-label">
                {it.label}
                <span className="dbd-channel">{it.platform} @{String(it.handle).replace(/^@/, '')}</span>
              </span>
              <span className="dbd-amt">{formatPaiseINR(base)}</span>
            </div>

            {boost != null && (
              <div className="dbd-row dbd-row-extra">
                {/* The per-day figure is shown, not used: the charge is
                    (30-day rate x days / 30) rounded once, so multiplying the
                    displayed per-day back up will not always reproduce it. */}
                <span className="dbd-label">
                  Boosting
                  <span className="dbd-note">
                    {it.boosting_days} day{it.boosting_days === 1 ? '' : 's'}
                    {it.boosting_30day_paise != null && (
                      <> &middot; {formatPaiseINR(boostingPerDayPaise({
                        collabRateType: null,
                        collabRateValue: null,
                        boostingThirtyDayPaise: it.boosting_30day_paise,
                      }))}/day</>
                    )}
                  </span>
                </span>
                <span className="dbd-amt">+{formatPaiseINR(boost)}</span>
              </div>
            )}

            {collab != null && (
              <div className="dbd-row dbd-row-extra">
                <span className="dbd-label">
                  Collab
                  {it.collab_rate_type === 'percent' && it.collab_rate_value != null && (
                    <span className="dbd-note">
                      {formatBasisPoints(it.collab_rate_value)} of {formatPaiseINR(base)}
                    </span>
                  )}
                </span>
                <span className="dbd-amt">+{formatPaiseINR(collab)}</span>
              </div>
            )}

            {hasExtras && (
              <div className="dbd-row dbd-row-sub">
                <span className="dbd-label">Deliverable total</span>
                <span className="dbd-amt">{formatPaiseINR(lineTotal)}</span>
              </div>
            )}
          </div>
        )
      })}

      <div className="dbd-row dbd-row-total">
        <span className="dbd-label">Total</span>
        <span className="dbd-amt">{formatPaiseINR(totalPaise ?? summed)}</span>
      </div>

      {/* A deal priced before add-ons existed, or one whose price was set by a
          manual override, will not match the sum of its lines. Saying so is
          better than showing two numbers and letting someone find it. */}
      {totalPaise != null && totalPaise !== summed && (
        <p className="dbd-note-block">
          The agreed total was set directly and differs from the sum of the lines above.
        </p>
      )}
    </div>
  )
}
