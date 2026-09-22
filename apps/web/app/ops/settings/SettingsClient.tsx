'use client'

import { useState, useTransition } from 'react'
import { setGrowthMinimum, setBrandEntitlement } from './actions'
import type { GrowthMinimum, MinimumMetric } from '@/lib/platform-settings'

/**
 * The two things ops tunes for Growth: the minimum, and who can run one.
 *
 * The minimum is here rather than hardcoded because nobody yet knows whether
 * the right threshold is five creators or twenty thousand rupees, and finding
 * out means changing it repeatedly while the pilot runs. A constant in the code
 * would make every experiment a deploy.
 */
export default function SettingsClient({
  minimum, brands,
}: {
  minimum: GrowthMinimum
  brands: { id: string; name: string; growth: boolean }[]
}) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [metric, setMetric] = useState<MinimumMetric>(minimum.metric)
  const [minCreators, setMinCreators] = useState(String(minimum.minCreators))
  const [minRupees, setMinRupees] = useState(String(Math.round(minimum.minValuePaise / 100)))

  const [grants, setGrants] = useState(() => new Map(brands.map((b) => [b.id, b.growth])))

  function saveMinimum() {
    setMsg(null)
    startTransition(async () => {
      const res = await setGrowthMinimum({
        metric,
        minCreators: parseInt(minCreators, 10),
        // Entered in rupees, stored in paise. Money is integer paise, never float.
        minValuePaise: Math.round(parseFloat(minRupees || '0') * 100),
      })
      setMsg({ ok: res.ok, text: res.ok ? 'Minimum saved.' : res.message ?? 'Failed.' })
    })
  }

  function toggleGrowth(brandId: string, next: boolean) {
    setMsg(null)
    setGrants((prev) => new Map(prev).set(brandId, next))
    startTransition(async () => {
      const res = await setBrandEntitlement({ brandId, key: 'growth_campaigns', granted: next })
      if (!res.ok) {
        setGrants((prev) => new Map(prev).set(brandId, !next))
        setMsg({ ok: false, text: res.message ?? 'Failed.' })
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: 720 }}>
      <section style={card}>
        <h2 style={h2}>Growth campaign minimum</h2>
        <p style={sub}>
          A Growth campaign cannot be sent until it clears this. Both numbers are stored; the metric
          decides which one is enforced, so switching is a change here rather than a deploy.
        </p>

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <label style={radio}>
            <input type="radio" checked={metric === 'creators'} onChange={() => setMetric('creators')} />
            Minimum creators
          </label>
          <label style={radio}>
            <input type="radio" checked={metric === 'value'} onChange={() => setMetric('value')} />
            Minimum campaign value
          </label>
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <Field label="Creators" hint={metric === 'creators' ? 'Enforced' : 'Stored, not enforced'}>
            <input style={input} type="number" min={1} value={minCreators}
                   onChange={(e) => setMinCreators(e.target.value)} />
          </Field>
          <Field label="Value (₹)" hint={metric === 'value' ? 'Enforced' : 'Stored, not enforced'}>
            <input style={input} type="number" min={0} value={minRupees}
                   onChange={(e) => setMinRupees(e.target.value)} />
          </Field>
        </div>

        <button type="button" onClick={saveMinimum} disabled={pending} style={btn}>
          {pending ? 'Saving…' : 'Save minimum'}
        </button>
      </section>

      <section style={card}>
        <h2 style={h2}>Growth campaign access</h2>
        <p style={sub}>
          Which brands can create a Growth campaign. Granted here today, by subscription later — the
          app asks the same question either way and never looks at which.
        </p>

        <div style={{ marginTop: '1rem' }}>
          {brands.map((b) => (
            <label key={b.id} style={row}>
              <input
                type="checkbox"
                checked={grants.get(b.id) ?? false}
                onChange={(e) => toggleGrowth(b.id, e.target.checked)}
                disabled={pending}
              />
              <span style={{ fontSize: '0.875rem' }}>{b.name}</span>
            </label>
          ))}
          {brands.length === 0 && <p style={sub}>No brands yet.</p>}
        </div>
      </section>

      {msg && (
        <div style={{
          borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.8125rem',
          background: msg.ok ? '#f0fdf4' : '#fef2f2', color: msg.ok ? '#166534' : '#9B3030',
          border: `1px solid ${msg.ok ? '#bbf7d0' : '#fecaca'}`,
        }}>{msg.text}</div>
      )}
    </div>
  )
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e5e5', borderRadius: 12, padding: '1.25rem 1.5rem' }
const h2: React.CSSProperties = { fontSize: '0.9375rem', fontWeight: 700, margin: 0 }
const sub: React.CSSProperties = { color: '#666', fontSize: '0.8125rem', margin: '0.375rem 0 0' }
const input: React.CSSProperties = { width: 120, padding: '0.5rem 0.625rem', border: '1px solid #e5e5e5', borderRadius: 6, fontSize: '0.875rem' }
const btn: React.CSSProperties = { marginTop: '1.25rem', padding: '0.55rem 1.1rem', borderRadius: 999, border: 'none', background: '#111', color: '#fff', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer' }
const radio: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', cursor: 'pointer' }
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '0.5rem 0', borderTop: '1px solid #f0f0f0' }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#444', marginBottom: 4 }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: '0.6875rem', color: '#888', marginTop: 4 }}>{hint}</span>}
    </label>
  )
}
