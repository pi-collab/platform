'use client'

import { pillBtn } from './ui'

export type ExtraRow = { label: string; amount: string }

/**
 * Named extras (0553): what each is for and its amount. Shared by the quote
 * form and the add-on form so both read the same. Empty rows are ignored on
 * submit; the server parses and the database sums.
 */
export default function ExtrasEditor({ rows, onChange, hint = 'Anything on top of the videos: travel, styling, express edit, location…', max = 20 }: {
  rows: ExtraRow[]
  onChange: (rows: ExtraRow[]) => void
  hint?: string
  max?: number
}) {
  return (
    <div>
      {rows.length === 0 && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--wg-500)', margin: '2px 0 8px' }}>{hint}</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map((x, i) => (
          <div key={i} className="xp-extra" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 160px auto', gap: 8, alignItems: 'center' }}>
            <input className="dinput" aria-label={`Extra ${i + 1}: what it is for`} placeholder="What it is for, e.g. Travel to Goa" maxLength={120}
              value={x.label} onChange={(e) => onChange(rows.map((y, k) => k === i ? { ...y, label: e.target.value } : y))} />
            <input className="dinput" aria-label={`Extra ${i + 1}: amount in rupees`} inputMode="decimal" placeholder="₹ amount"
              value={x.amount} onChange={(e) => onChange(rows.map((y, k) => k === i ? { ...y, amount: e.target.value } : y))} />
            <button type="button" style={{ ...pillBtn, height: 36, padding: '0 12px' }} aria-label={`Remove extra ${i + 1}`} onClick={() => onChange(rows.filter((_, k) => k !== i))}>Remove</button>
          </div>
        ))}
      </div>
      {rows.length < max && <button type="button" style={{ ...pillBtn, height: 34, marginTop: 8 }} onClick={() => onChange([...rows, { label: '', amount: '' }])}>+ Add an extra</button>}
      <style>{`@media (max-width: 720px) { .xp-extra { grid-template-columns: 1fr 110px !important; } .xp-extra button { grid-column: 1 / -1; justify-self: start; } }`}</style>
    </div>
  )
}

/** The sum of the filled rows in paise, or null if any amount is not a valid rupee figure. */
export function extrasPaise(rows: ExtraRow[], toPaise: (s: string) => number | null): number | null {
  let sum = 0
  for (const x of rows) {
    if (!x.label.trim() && !x.amount.trim()) continue
    const v = toPaise(x.amount)
    if (v === null) return null
    sum += v
  }
  return sum
}
