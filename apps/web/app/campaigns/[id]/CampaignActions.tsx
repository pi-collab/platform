'use client'

import { useState } from 'react'
import { updateCampaign } from '../actions'
import { useRouter } from 'next/navigation'

export default function CampaignActions({
  campaignId,
  currentStatus,
  currentName,
  currentDescription,
}: {
  campaignId: string
  currentStatus: string
  currentName: string
  currentDescription: string | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(currentName)
  const [description, setDescription] = useState(currentDescription ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    setLoading(true)
    setError(null)
    const res = await updateCampaign(campaignId, { name, description })
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
      <div style={{ padding: '1rem', border: '1px solid var(--color-border, #e5e5e5)', borderRadius: 8, background: 'var(--glass-bg, #fafafa)', minWidth: 280 }}>
        {error && <p style={{ fontSize: '0.75rem', color: '#dc2626', margin: '0 0 0.5rem' }}>{error}</p>}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
          autoFocus
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          style={{ ...inputStyle, marginTop: '0.5rem', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.75rem' }}>
          <button onClick={() => setEditing(false)} disabled={loading} style={cancelBtn}>Cancel</button>
          <button onClick={handleSave} disabled={loading || !name.trim()} style={{ ...saveBtn, opacity: loading ? 0.5 : 1 }}>
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
      <button onClick={() => setEditing(true)} style={actionBtn}>Edit</button>
      {currentStatus === 'active' && (
        <button onClick={() => handleStatusChange('completed')} disabled={loading} style={actionBtn}>Mark completed</button>
      )}
      {currentStatus === 'completed' && (
        <button onClick={() => handleStatusChange('active')} disabled={loading} style={actionBtn}>Reactivate</button>
      )}
      {currentStatus !== 'archived' && (
        <button onClick={() => handleStatusChange('archived')} disabled={loading} style={{ ...actionBtn, color: '#888' }}>Archive</button>
      )}
      {currentStatus === 'archived' && (
        <button onClick={() => handleStatusChange('active')} disabled={loading} style={actionBtn}>Unarchive</button>
      )}
      {error && <p style={{ fontSize: '0.75rem', color: '#dc2626', margin: 0, alignSelf: 'center' }}>{error}</p>}
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

const actionBtn: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: 'var(--glass-bg, #fafafa)',
  color: 'var(--color-heading, #111)',
  border: '1px solid var(--color-border, #e5e5e5)',
  borderRadius: 6,
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const cancelBtn: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: 'transparent',
  border: '1px solid var(--color-border, #e5e5e5)',
  borderRadius: 6,
  fontSize: '0.8125rem',
  cursor: 'pointer',
  color: 'var(--color-muted)',
}

const saveBtn: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: '0.8125rem',
  fontWeight: 600,
  cursor: 'pointer',
}
