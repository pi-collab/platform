'use client'

import { useState } from 'react'
import { createCampaign } from './actions'
import { useRouter } from 'next/navigation'

export default function NewCampaignButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [budget, setBudget] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim()) { setError('Name is required'); return }
    setLoading(true)
    setError(null)
    const budgetPaise = budget.trim() ? Math.round(parseFloat(budget) * 100) : undefined
    if (budget.trim() && (isNaN(budgetPaise!) || budgetPaise! < 0)) { setError('Budget must be a positive number'); setLoading(false); return }
    const res = await createCampaign(name, description || undefined, budgetPaise)
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
