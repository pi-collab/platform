'use client'

import { useState, useMemo } from 'react'
import { addCreatorsToCampaign } from './draft-actions'
import { useRouter } from 'next/navigation'

interface Creator {
  id: string
  full_name: string
  handle: string | null
  profile_photo_url: string | null
  niches: string[] | null
}

export default function AddCreatorsModal({
  campaignId,
  creators,
  existingCreatorIds,
}: {
  campaignId: string
  creators: Creator[]
  existingCreatorIds: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existingSet = useMemo(() => new Set(existingCreatorIds), [existingCreatorIds])

  const filtered = useMemo(() => {
    if (!search) return creators
    const q = search.toLowerCase()
    return creators.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.handle?.toLowerCase().includes(q)
    )
  }, [creators, search])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleAdd() {
    if (selected.size === 0) return
    setLoading(true)
    setError(null)
    const res = await addCreatorsToCampaign(campaignId, Array.from(selected))
    setLoading(false)
    if (res.error) { setError(res.error); return }
    setOpen(false)
    setSelected(new Set())
    setSearch('')
    router.refresh()
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={addBtn}>
        + Add creators
      </button>
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div style={backdrop} onClick={() => { setOpen(false); setError(null) }} />
      {/* Modal */}
      <div style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0, color: 'var(--color-heading)' }}>
            Add creators to campaign
          </p>
          <button onClick={() => { setOpen(false); setError(null) }} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#888' }}>×</button>
        </div>

        {error && <p style={{ fontSize: '0.75rem', color: '#dc2626', margin: '0 0 0.5rem' }}>{error}</p>}

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or handle..."
          style={searchInput}
          autoFocus
        />

        <div style={{ maxHeight: 320, overflowY: 'auto', margin: '0.75rem 0', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {filtered.length === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: '#888', padding: '1rem', textAlign: 'center' }}>No creators found</p>
          ) : (
            filtered.map((c) => {
              const alreadyAdded = existingSet.has(c.id)
              const isSelected = selected.has(c.id)
              return (
                <button
                  key={c.id}
                  onClick={() => !alreadyAdded && toggle(c.id)}
                  disabled={alreadyAdded}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.625rem',
                    padding: '0.5rem 0.75rem',
                    border: isSelected ? '1.5px solid var(--color-heading, #111)' : '1px solid var(--color-border, #e5e5e5)',
                    borderRadius: 6,
                    background: alreadyAdded ? '#f9fafb' : isSelected ? 'var(--section-bg-alt, #f5f5f0)' : 'var(--glass-bg, #fafafa)',
                    cursor: alreadyAdded ? 'default' : 'pointer',
                    opacity: alreadyAdded ? 0.5 : 1,
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  {c.profile_photo_url ? (
                    <img src={c.profile_photo_url} alt={c.full_name} style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', border: '1px solid #e5e5e5', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: '#f0f0f0', border: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.625rem', fontWeight: 700, color: '#888', flexShrink: 0 }}>
                      {c.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-heading)', margin: 0 }}>{c.full_name}</p>
                    {c.handle && <p style={{ fontSize: '0.7rem', color: '#888', margin: 0 }}>{c.handle}</p>}
                  </div>
                  {alreadyAdded && (
                    <span style={{ fontSize: '0.625rem', fontWeight: 600, color: '#888' }}>Added</span>
                  )}
                  {isSelected && !alreadyAdded && (
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-heading)' }}>✓</span>
                  )}
                </button>
              )
            })
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: '#888' }}>
            {selected.size} selected
          </span>
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            <button onClick={() => { setOpen(false); setError(null) }} style={cancelBtn}>Cancel</button>
            <button onClick={handleAdd} disabled={loading || selected.size === 0} style={{ ...saveBtn, opacity: loading || selected.size === 0 ? 0.5 : 1 }}>
              {loading ? 'Adding...' : `Add ${selected.size > 0 ? selected.size : ''} creator${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

const addBtn: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: '#111',
  color: '#fff',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: '0.8125rem',
  border: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const backdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 99,
}

const modal: React.CSSProperties = {
  position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  width: '90%', maxWidth: 480, maxHeight: '80vh',
  background: '#fff', borderRadius: 12, padding: '1.25rem',
  boxShadow: '0 8px 30px rgba(0,0,0,0.15)', zIndex: 100,
  display: 'flex', flexDirection: 'column',
}

const searchInput: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.625rem',
  border: '1px solid var(--color-border, #d5d5d5)', borderRadius: 6,
  fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
}

const cancelBtn: React.CSSProperties = {
  padding: '0.375rem 0.75rem', background: 'transparent',
  border: '1px solid var(--color-border, #e5e5e5)', borderRadius: 6,
  fontSize: '0.8125rem', cursor: 'pointer', color: 'var(--color-muted)',
}

const saveBtn: React.CSSProperties = {
  padding: '0.375rem 0.75rem', background: '#111', color: '#fff',
  border: 'none', borderRadius: 6, fontSize: '0.8125rem',
  fontWeight: 600, cursor: 'pointer',
}
