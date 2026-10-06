'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DatePill } from '@/components/DealOptionPills'
import { CHANNELS, DELIVERABLE_TYPES } from '@/lib/experience-request'
import { recordExperienceRequest } from '../actions'
import { card, fieldLabel, formError, neonBtn, pillBtn } from '../ui'

/**
 * Staff record a brand's Experience request ON THE BRAND'S BEHALF (it arrived
 * on WhatsApp, email or a call). The brand-facing request form comes later and
 * will write the same fields.
 */
export default function NewExperienceForm({ brands }: { brands: { id: string; name: string; brand_status: string }[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [brandId, setBrandId] = useState('')
  const [title, setTitle] = useState('')
  const [items, setItems] = useState<{ type: string; count: string }[]>([{ type: DELIVERABLE_TYPES[0], count: '' }])
  const [affiliate, setAffiliate] = useState(false)
  const [adRights, setAdRights] = useState(false)
  const [adMonths, setAdMonths] = useState('')
  const [boost, setBoost] = useState(false)
  const [boostMonths, setBoostMonths] = useState('')
  const [location, setLocation] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [brief, setBrief] = useState('')
  const [channel, setChannel] = useState('')

  const total = items.reduce((n, i) => n + (Number(i.count) || 0), 0)

  const submit = () => {
    setError(null)
    if (!brandId) return setError('Pick the brand.')
    start(async () => {
      const r = await recordExperienceRequest({
        brandId, title, deliverables: items.map((i) => ({ type: i.type, count: i.count })),
        affiliate, adRights, adRightsMonths: adMonths, boost, boostMonths, location, dateFrom, dateTo, brief, channel,
      })
      if (r.ok) router.push(`/experiences-admin/${r.data}`)
      else setError(r.error)
    })
  }

  return (
    <div style={{ display: 'grid', gap: 20, marginTop: 20 }}>
      {/* ── Who and how ── */}
      <section className="surface" style={card}>
        <h2 className="sect-head">The request</h2>
        <div className="sect-rule" />
        <div className="xp-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 18 }}>
          <div>
            <label style={fieldLabel} htmlFor="xp-brand">Brand</label>
            <select id="xp-brand" className="dinput" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">Select a brand…</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}{b.brand_status !== 'approved' ? ' (not yet approved)' : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={fieldLabel} htmlFor="xp-channel">Arrived via</label>
            <select id="xp-channel" className="dinput" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">Select…</option>
              {CHANNELS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fieldLabel} htmlFor="xp-title">Title</label>
            <input id="xp-title" className="dinput" placeholder="e.g. Kiro Beauty · Diwali UGC day shoot" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
      </section>

      {/* ── Deliverables + rights ── */}
      <section className="surface" style={card}>
        <h2 className="sect-head">What they want <span style={{ color: 'var(--wg-500)', fontWeight: 500, marginLeft: 6 }}>{total ? `${total} in total` : ''}</span></h2>
        <div className="sect-rule" />
        <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select className="dinput" aria-label="Deliverable type" value={it.type} style={{ flex: 2 }}
                onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}>
                {DELIVERABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input className="dinput" aria-label="How many" inputMode="numeric" placeholder="How many" value={it.count} style={{ flex: 1 }}
                onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, count: e.target.value.replace(/\D/g, '') } : x))} />
              {items.length > 1 && (
                <button type="button" style={{ ...pillBtn, height: 46 }} onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove">Remove</button>
              )}
            </div>
          ))}
          <div>
            <button type="button" style={pillBtn} onClick={() => setItems([...items, { type: DELIVERABLE_TYPES[0], count: '' }])}>+ Add another type</button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12, marginTop: 22 }}>
          <Toggle label="Affiliate" hint="The creators also earn on sales" on={affiliate} onChange={setAffiliate} />
          <Toggle label="Ad rights" hint="The brand runs the videos as paid ads" on={adRights} onChange={setAdRights}
            months={adMonths} onMonths={setAdMonths} />
          <Toggle label="Boost" hint="The brand boosts the creators' own posts" on={boost} onChange={setBoost}
            months={boostMonths} onMonths={setBoostMonths} />
        </div>
      </section>

      {/* ── Where, when, brief ── */}
      <section className="surface" style={card}>
        <h2 className="sect-head">Where and when</h2>
        <div className="sect-rule" />
        <div className="xp-grid3" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 18, marginTop: 18 }}>
          <div>
            <label style={fieldLabel} htmlFor="xp-loc">Location</label>
            <input id="xp-loc" className="dinput" placeholder="City or venue" value={location} maxLength={120} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div>
            <span style={fieldLabel}>From</span>
            <DatePill value={dateFrom} onChange={setDateFrom} id="xp-from" />
          </div>
          <div>
            <span style={fieldLabel}>To</span>
            <DatePill value={dateTo} onChange={setDateTo} id="xp-to" invalid={!!dateFrom && !!dateTo && dateTo < dateFrom} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fieldLabel} htmlFor="xp-brief">Brief</label>
            <textarea id="xp-brief" className="dinput" rows={5} maxLength={4000} placeholder="What the brand told us: the product, the look, the audience, anything to avoid."
              value={brief} onChange={(e) => setBrief(e.target.value)} style={{ height: 'auto', padding: '12px 14px', lineHeight: 1.5 }} />
          </div>
        </div>
      </section>

      {error && <div role="alert" style={formError}>{error}</div>}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Link href="/experiences-admin" style={{ ...pillBtn, height: 46 }}>Cancel</Link>
        <button type="button" className="neonbtn" style={{ ...neonBtn, opacity: pending ? 0.6 : 1 }} disabled={pending} onClick={submit}>
          {pending ? 'Saving…' : 'Record request'}
        </button>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .xp-grid2, .xp-grid3 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function Toggle({ label, hint, on, onChange, months, onMonths }: {
  label: string; hint: string; on: boolean; onChange: (v: boolean) => void; months?: string; onMonths?: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
        style={{ width: 42, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
          background: on ? 'var(--ink)' : '#DADAD3', transition: 'background .15s ease' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: on ? 'var(--neon)' : '#fff', transition: 'left .15s ease' }} />
      </button>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--wg-500)' }}>{hint}</div>
      </div>
      {on && onMonths && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)' }}>
          <input className="dinput" inputMode="numeric" aria-label={`${label} months`} value={months ?? ''} style={{ width: 70, height: 38, textAlign: 'center' }}
            onChange={(e) => onMonths(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          months
        </label>
      )}
    </div>
  )
}
