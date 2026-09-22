'use client'

import { useState } from 'react'
import { createCampaign } from './actions'
import { useRouter } from 'next/navigation'
import { PRODUCT_TYPES } from '@/lib/product-types'
import { TRACK_BLURB, TRACK_LABEL, TRACK_TONE, type Track } from '@/lib/track'

/**
 * Starting a campaign is where the two decisions that shape it are made: which
 * TRACK it runs on, and how deliverables are chosen.
 *
 * Both are here rather than later because both are structural. The track
 * decides what one billable unit is and which creators can join; the
 * deliverable mode decides what the roster looks like. Neither is something a
 * brand should discover halfway through building one.
 *
 * The Growth option only appears for a brand that holds the entitlement —
 * offering it and then refusing at create would be worse than not offering it.
 * The server checks again regardless: the UI is a courtesy, not the boundary.
 */
export default function NewCampaignButton({ canGrowth = false }: { canGrowth?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [budget, setBudget] = useState('')
  const [track, setTrack] = useState<Track>('deals')
  const [mode, setMode] = useState<'uniform' | 'per_creator'>('per_creator')
  const [uniformType, setUniformType] = useState<string>(PRODUCT_TYPES[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim()) { setError('Name is required'); return }
    setLoading(true)
    setError(null)
    const budgetPaise = budget.trim() ? Math.round(parseFloat(budget) * 100) : undefined
    if (budget.trim() && (isNaN(budgetPaise!) || budgetPaise! < 0)) { setError('Budget must be a positive number'); setLoading(false); return }
    const res = await createCampaign(name, description || undefined, budgetPaise, {
      track,
      deliverableMode: mode,
      uniformProductType: mode === 'uniform' ? uniformType : undefined,
    })
    if (res.error) { setLoading(false); setError(res.error); return }
    setOpen(false)
    setName('')
    setDescription('')
    setBudget('')
    if (res.campaignId) router.push(`/campaigns/${res.campaignId}`)
    else setLoading(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ padding: '0.5rem 1rem', background: '#111', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: '0.875rem', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        + New Campaign
      </button>
    )
  }

  return (
    <div style={{ padding: '1rem', border: '1px solid var(--color-border, #e5e5e5)', borderRadius: 8, background: 'var(--glass-bg, #fafafa)', minWidth: 280 }}>
      <p style={{ fontSize: '0.875rem', fontWeight: 700, margin: '0 0 0.75rem', color: 'var(--color-heading)' }}>New Campaign</p>
      {error && <p style={{ fontSize: '0.75rem', color: '#dc2626', margin: '0 0 0.5rem' }}>{error}</p>}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Campaign name"
        style={inputStyle}
        autoFocus
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description / brief (optional)"
        rows={2}
        style={{ ...inputStyle, marginTop: '0.5rem', resize: 'vertical' }}
      />

      {/* ── Track ──────────────────────────────────────────────────────────
          Shown only when the brand has both to choose from. A single-option
          "choice" is a decision presented as one, and it would make every
          Deals campaign look like it had opted out of something. */}
      {canGrowth && (
        <div style={{ marginTop: '0.75rem' }}>
          <Label>Track</Label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {(['deals', 'growth'] as Track[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTrack(t)}
                style={{
                  flex: 1, textAlign: 'left', cursor: 'pointer', borderRadius: 8, padding: '8px 10px',
                  background: track === t ? TRACK_TONE[t].bg : '#fff',
                  border: `1px solid ${track === t ? TRACK_TONE[t].border : '#e5e5e5'}`,
                  color: track === t ? TRACK_TONE[t].fg : '#444',
                }}
              >
                <span style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700 }}>{TRACK_LABEL[t]}</span>
                <span style={{ display: 'block', fontSize: '0.6875rem', marginTop: 2, opacity: 0.85, lineHeight: 1.4 }}>
                  {TRACK_BLURB[t]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Deliverables ───────────────────────────────────────────────────
          Uniform is the fast common case: a brand adding fifteen creators
          should not make fifteen identical choices. The TYPE is what is
          uniform — each creator's own price applies, because each sets their
          own rates. */}
      <div style={{ marginTop: '0.75rem' }}>
        <Label>Deliverables</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          <Radio
            checked={mode === 'uniform'}
            onChange={() => setMode('uniform')}
            title="Same for everyone"
            hint="One deliverable; each creator's own price applies"
          />
          <Radio
            checked={mode === 'per_creator'}
            onChange={() => setMode('per_creator')}
            title="Different per creator"
            hint="Pick each creator's package as you add them"
          />
        </div>
        {mode === 'uniform' && (
          <select
            value={uniformType}
            onChange={(e) => setUniformType(e.target.value)}
            style={{ ...inputStyle, marginTop: '0.5rem' }}
          >
            {PRODUCT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>
      <input
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        type="number"
        min="0"
        step="1"
        placeholder="Budget in ₹ (optional)"
        style={{ ...inputStyle, marginTop: '0.5rem' }}
      />
      <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.75rem' }}>
        <button
          onClick={() => { setOpen(false); setError(null) }}
          disabled={loading}
          style={{ padding: '0.375rem 0.75rem', background: 'transparent', border: '1px solid var(--color-border, #e5e5e5)', borderRadius: 6, fontSize: '0.8125rem', cursor: 'pointer', color: 'var(--color-muted)' }}
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={loading || !name.trim()}
          style={{ padding: '0.375rem 0.75rem', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.8125rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}
        >
          {loading ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.625rem',
  border: '1px solid var(--color-border, #d5d5d5)',
  borderRadius: 6,
  fontSize: '0.875rem',
  outline: 'none',
  boxSizing: 'border-box',
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#888' }}>
      {children}
    </span>
  )
}

function Radio({ checked, onChange, title, hint }: {
  checked: boolean; onChange: () => void; title: string; hint: string
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', padding: '4px 0' }}>
      <input type="radio" checked={checked} onChange={onChange} style={{ marginTop: 3 }} />
      <span>
        <span style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#111' }}>{title}</span>
        <span style={{ display: 'block', fontSize: '0.6875rem', color: '#888', marginTop: 1 }}>{hint}</span>
      </span>
    </label>
  )
}
