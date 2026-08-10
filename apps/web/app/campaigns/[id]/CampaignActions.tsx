'use client'

import { useState } from 'react'
import { updateCampaign } from '../actions'
import { useRouter } from 'next/navigation'

export default function CampaignActions({
  campaignId,
  currentStatus,
  currentName,
  currentDescription,
  currentBudgetPaise,
}: {
  campaignId: string
  currentStatus: string
  currentName: string
  currentDescription: string | null
  currentBudgetPaise: number | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(currentName)
  const [description, setDescription] = useState(currentDescription ?? '')
  const [budget, setBudget] = useState(currentBudgetPaise != null ? String(currentBudgetPaise / 100) : '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    setLoading(true)
    setError(null)
    const budgetPaise = budget.trim() ? Math.round(parseFloat(budget) * 100) : null
    if (budget.trim() && (isNaN(budgetPaise!) || budgetPaise! < 0)) { setError('Budget must be a positive number'); setLoading(false); return }
    const res = await updateCampaign(campaignId, { name, description, budget_paise: budgetPaise })
    setLoading(false)
    if (res.error) { setError(res.error); return }
    setEditing(false)
    router.refresh()
  }

  async function handleStatusChange(status: 'active' | 'completed' | 'archived') {
    setLoading(true)
    const res = await updateCampaign(campaignId, { status })
    setLoading(false)
    if (res.error) setError(res.error)
    else router.refresh()
  }

  if (editing) {
    return (
      <div style={{ padding: 22, border: '1px solid var(--border-hairline, #EAEAE3)', borderRadius: 16, background: 'var(--card)', minWidth: 280 }}>
        {error && <p style={{ fontSize: 12, color: 'var(--danger, #D2545A)', margin: '0 0 10px', fontFamily: 'var(--font-ui)' }}>{error}</p>}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
          placeholder="Campaign name"
          autoFocus
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          style={{ ...inputStyle, marginTop: 10, resize: 'vertical' }}
        />
        <input
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          type="number"
          min="0"
          step="1"
          placeholder="Budget (₹, optional)"
          style={{ ...inputStyle, marginTop: 10 }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={() => setEditing(false)} disabled={loading} style={cancelBtn}>Cancel</button>
          <button onClick={handleSave} disabled={loading || !name.trim()} style={{ ...saveBtn, opacity: loading ? 0.5 : 1 }}>
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <button onClick={() => setEditing(true)} style={pillBtn}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
        Edit
      </button>

      {currentStatus === 'active' && (
        <button onClick={() => handleStatusChange('completed')} disabled={loading} style={pillBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 7 17l-5-5" />
            <path d="m22 10-9.5 9.5L10 17" />
          </svg>
          Mark completed
        </button>
      )}
      {currentStatus === 'completed' && (
        <button onClick={() => handleStatusChange('active')} disabled={loading} style={pillBtn}>
          Reactivate
        </button>
      )}
      {currentStatus === 'completed' && (
        <button onClick={() => handleStatusChange('archived')} disabled={loading} style={{ ...pillBtn, color: 'var(--ink-faint)' }}>
          Archive
        </button>
      )}
      {currentStatus === 'archived' && (
        <button onClick={() => handleStatusChange('active')} disabled={loading} style={pillBtn}>
          Unarchive
        </button>
      )}
      {error && <p style={{ fontSize: 12, color: 'var(--danger, #D2545A)', margin: 0, alignSelf: 'center', fontFamily: 'var(--font-ui)' }}>{error}</p>}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  border: '1px solid var(--border-hairline, #EAEAE3)',
  borderRadius: 12,
  fontSize: 14,
  fontFamily: 'var(--font-ui)',
  color: 'var(--ink)',
  outline: 'none',
  boxSizing: 'border-box',
  background: 'var(--card)',
  transition: 'border-color .16s ease',
}

const pillBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '10px 20px',
  borderRadius: 999,
  border: '1px solid var(--border-hairline, #EAEAE3)',
  background: 'var(--card)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-ui)',
  fontSize: 13.5,
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'border-color .16s ease, opacity .16s ease',
  whiteSpace: 'nowrap',
}

const cancelBtn: React.CSSProperties = {
  padding: '9px 18px',
  background: 'transparent',
  border: '1px solid var(--border-hairline, #EAEAE3)',
  borderRadius: 999,
  fontSize: 13,
  fontFamily: 'var(--font-ui)',
  fontWeight: 600,
  cursor: 'pointer',
  color: 'var(--ink-soft)',
}

const saveBtn: React.CSSProperties = {
  padding: '9px 18px',
  background: 'var(--ink)',
  color: '#fff',
  border: 'none',
  borderRadius: 999,
  fontSize: 13,
  fontFamily: 'var(--font-ui)',
  fontWeight: 700,
  cursor: 'pointer',
}
