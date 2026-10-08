'use client'

import { useState } from 'react'
import { creatorLegTerms } from '@/lib/experience-money'
import { formatPaiseINR } from '@/lib/money'
import { saveDayRate, pauseDayRate } from './actions'

/**
 * The creator's shoot day rate: what they charge Guapd for one day of a
 * managed shoot (a Guapd Experience). A rate-card item like any package, but
 * priced per day. Not shown to brands (enforced in the data layer, 0533); the
 * copy does not say so, by decision: it read as a lack of transparency.
 *
 * The worked example runs the same maths as a real Experience deal
 * (creatorLegTerms: day rate × days → the creator's own track % → net), so the
 * figure here is the figure a sent deal would show for one day.
 */
export default function ShootDayRate({
  dayRate,
  feePct,
  isGrowth,
}: {
  dayRate: { paise: number; active: boolean } | null
  feePct: number
  isGrowth: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(dayRate ? String(Math.round(dayRate.paise / 100)) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const track = isGrowth ? 'growth' : 'deals'
  const trackName = isGrowth ? 'Growth' : 'Deals'
  const example = (paise: number) => {
    const t = creatorLegTerms({ dayRatePaise: paise, days: 1, track })
    return `${formatPaiseINR(t.creatorGrossPaise)} a day → ${t.platformPct}% ${trackName} fee → ${formatPaiseINR(t.creatorNetPaise)} to you`
  }
  const typed = /^\d+$/.test(value) && Number(value) > 0 ? Number(value) * 100 : null

  async function save() {
    if (!typed) { setError('Enter your day rate in whole rupees.'); return }
    setBusy(true); setError('')
    const res = await saveDayRate({ rupees: typed / 100 })
    setBusy(false)
    if (!res.ok) { setError(res.message); return }
    setEditing(false)
  }

  async function pause() {
    setBusy(true); setError('')
    const res = await pauseDayRate()
    setBusy(false)
    if (!res.ok) setError(res.message)
  }

  async function resume() {
    if (!dayRate) return
    setBusy(true); setError('')
    const res = await saveDayRate({ rupees: Math.round(dayRate.paise / 100) })
    setBusy(false)
    if (!res.ok) setError(res.message)
  }

  const showForm = editing || !dayRate

  return (
    <section className="pk-channel pk-day-section" aria-labelledby="pk-day-title">
      <div className="pk-channel-head">
        <span id="pk-day-title" className="pk-channel-handle">Shoot day rate · managed shoots</span>
        <span className="pk-channel-count">
          {!dayRate ? 'Not set' : dayRate.active ? 'Active' : 'Paused'}
        </span>
      </div>

      <div className="pk-card">
        <p className="pk-day-intro">
          What you charge for one day when Guapd books you for a managed shoot. Guapd
          sets what you make on each shoot when it sends you the deal, and keeps
          the {feePct}% {trackName} fee, the same as your other deals.
        </p>

        {showForm ? (
          <div className="pk-day-form">
            <label className="pk-field pk-field-grow">
              <span className="pk-label">Day rate (₹)</span>
              <input
                className="pk-input"
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                placeholder="10000"
                aria-describedby="pk-day-example"
              />
            </label>
            <p id="pk-day-example" className="pk-day-example">
              {typed ? example(typed) : `For example, ${example(1000000)}`}
            </p>
            <div className="pk-row-actions">
              <button type="button" className="pk-btn pk-btn-primary" disabled={busy} onClick={save}>
                {busy ? 'Saving…' : dayRate ? 'Save day rate' : 'Set day rate'}
              </button>
              {dayRate && (
                <button type="button" className="pk-mini" disabled={busy} onClick={() => { setEditing(false); setError('') }}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="pk-row" style={{ borderTop: 'none' }}>
            <div className="pk-row-main">
              <div className="pk-row-type">Shoot day</div>
              <div className="pk-row-desc">{example(dayRate.paise)}</div>
            </div>
            <div className="pk-row-price">
              {formatPaiseINR(dayRate.paise)}<span className="pk-day-unit">/day</span>
            </div>
            <div className="pk-row-actions">
              <button type="button" className="pk-mini" disabled={busy} onClick={() => setEditing(true)}>Edit</button>
              {dayRate.active
                ? <button type="button" className="pk-mini" disabled={busy} onClick={pause}>{busy ? '…' : 'Pause'}</button>
                : <button type="button" className="pk-mini" disabled={busy} onClick={resume}>{busy ? '…' : 'Turn back on'}</button>}
            </div>
          </div>
        )}

        {error && <p role="alert" className="pk-error pk-day-error">{error}</p>}
      </div>
    </section>
  )
}
