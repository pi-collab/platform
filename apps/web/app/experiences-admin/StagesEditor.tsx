'use client'

import { STAGE_MOMENTS, STAGE_PRESETS, formatRupees, scheduleProblem, stageAmounts } from '@/lib/experience-request'
import { pillBtn } from './ui'

export type StageRow = { label: string; pct: string; on: string }

/**
 * 0579: how the brand pays the ONE invoice: stages, each a % of the price and
 * the moment it falls due. No stages = the whole amount on acceptance. The
 * brand sees these with the price and accepts them together; the database
 * checks the same rules as scheduleProblem.
 */
export default function StagesEditor({ rows, onChange, totalPaise }: { rows: StageRow[]; onChange: (rows: StageRow[]) => void; totalPaise: number | null }) {
  const parsed = rows.map((r) => ({ label: r.label, pct: Number(r.pct), on: r.on }))
  const problem = rows.length ? scheduleProblem(parsed) : null
  const amounts = totalPaise && !problem && rows.length ? stageAmounts(totalPaise, parsed) : null
  const sum = Math.round(parsed.reduce((a, s) => a + (Number.isFinite(s.pct) ? s.pct : 0), 0) * 100) / 100
  const set = (i: number, k: keyof StageRow, v: string) => onChange(rows.map((y, j) => j === i ? { ...y, [k]: v } : y))

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '2px 0 10px' }}>
        {STAGE_PRESETS.map((p) => {
          const active = JSON.stringify(p.stages.map((s) => [s.label, s.pct, s.on])) === JSON.stringify(parsed.map((s) => [s.label, s.pct, s.on]))
          return (
            <button key={p.name} type="button" aria-pressed={active}
              style={{ ...pillBtn, height: 32, padding: '0 12px', fontSize: 12.5, background: active ? 'var(--ink)' : pillBtn.background, color: active ? '#fff' : pillBtn.color }}
              onClick={() => onChange(p.stages.map((s) => ({ label: s.label, pct: String(s.pct), on: s.on })))}>
              {p.name}
            </button>
          )
        })}
      </div>
      {rows.length === 0 && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--wg-500)', margin: '2px 0 8px' }}>The whole amount is due when the brand accepts. Add stages to split it.</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map((x, i) => (
          <div key={i} className="xp-stage" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px 170px 110px auto', gap: 8, alignItems: 'center' }}>
            <input className="dinput" aria-label={`Stage ${i + 1}: name`} placeholder="Advance" maxLength={40} value={x.label} onChange={(e) => set(i, 'label', e.target.value)} />
            <input className="dinput" aria-label={`Stage ${i + 1}: percent`} inputMode="decimal" placeholder="%" value={x.pct} onChange={(e) => set(i, 'pct', e.target.value.replace(/[^\d.]/g, ''))} />
            <select className="dinput" aria-label={`Stage ${i + 1}: when it is due`} value={x.on} onChange={(e) => set(i, 'on', e.target.value)}>
              {STAGE_MOMENTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{amounts ? formatRupees(amounts[i]) : '—'}</div>
            <button type="button" style={{ ...pillBtn, height: 36, padding: '0 12px' }} aria-label={`Remove stage ${i + 1}`} onClick={() => onChange(rows.filter((_, k) => k !== i))}>Remove</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
        {rows.length < 6 && (
          <button type="button" style={{ ...pillBtn, height: 34 }}
            onClick={() => onChange([...rows, { label: '', pct: '', on: rows[rows.length - 1]?.on ?? 'accepted' }])}>+ Add a stage</button>
        )}
        {rows.length > 0 && (
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: problem ? '#9C4147' : 'var(--wg-500)' }}>
            {problem ?? `Adds up to ${sum}%. One invoice; the brand pays each stage as it falls due.`}
          </span>
        )}
      </div>
      <style>{`@media (max-width: 720px) { .xp-stage { grid-template-columns: 1fr 80px !important; } .xp-stage select { grid-column: 1 / -1; } .xp-stage button { justify-self: start; } }`}</style>
    </div>
  )
}
