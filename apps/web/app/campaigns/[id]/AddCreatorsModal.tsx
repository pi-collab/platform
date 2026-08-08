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

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
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

  const n = selected.size

  if (!open) {
    return (
      <button
        className="neonbtn"
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          height: 44, padding: '0 20px', borderRadius: 12,
          background: 'var(--neon)', border: 'none',
          boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
          fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5,
          color: 'var(--ink)', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        Add creators
      </button>
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => { setOpen(false); setError(null) }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(22,23,15,.35)', backdropFilter: 'blur(4px)', zIndex: 99 }}
      />
      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '92%', maxWidth: 540, maxHeight: '82vh',
        background: 'var(--card)', borderRadius: 24, padding: '32px 32px 24px',
        boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 10px 20px rgba(22,23,15,.045), 0 40px 80px rgba(22,23,15,.06)',
        zIndex: 100, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em', margin: 0 }}>
            Add creators to campaign
          </h2>
          <button
            onClick={() => { setOpen(false); setError(null) }}
            style={{
              width: 34, height: 34, borderRadius: 8, background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {error && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{error}</div>}

        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          height: 48, padding: '0 16px', borderRadius: 14,
          background: '#FFFFFF', border: '1px solid var(--hairline)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or handle..."
            autoFocus
            style={{
              flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'none',
              fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 400, color: 'var(--ink)',
            }}
          />
        </div>

        {/* Creator list */}
        <div style={{ flex: 1, overflowY: 'auto', margin: '18px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.length === 0 ? (
            <p className="t-body" style={{ padding: 24, textAlign: 'center', color: 'var(--ink-faint)' }}>No creators found</p>
          ) : (
            filtered.map((c) => {
              const alreadyAdded = existingSet.has(c.id)
              const isSelected = selected.has(c.id)
              const niche = c.niches?.length ? c.niches[0] : null
              return (
                <button
                  key={c.id}
                  onClick={() => !alreadyAdded && toggle(c.id)}
                  disabled={alreadyAdded}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 16px', width: '100%', textAlign: 'left',
                    border: isSelected ? '1.5px solid var(--neon-deep)' : '1.5px solid var(--hairline)',
                    borderRadius: 16,
                    background: alreadyAdded ? 'transparent' : isSelected ? 'var(--lime-50)' : '#FFFFFF',
                    cursor: alreadyAdded ? 'default' : 'pointer',
                    opacity: alreadyAdded ? 0.4 : 1,
                    transition: 'background .15s, border-color .15s',
                  }}
                >
                  {/* Avatar */}
                  {c.profile_photo_url ? (
                    <img src={c.profile_photo_url} alt={c.full_name} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <span style={{
                      width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14,
                      color: 'var(--ink-soft)', background: '#F0EDF5',
                    }}>
                      {getInitials(c.full_name)}
                    </span>
                  )}

                  {/* Name + handle */}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>
                      {c.full_name}{niche && <span style={{ fontWeight: 400, color: 'var(--ink-soft)' }}> ({niche})</span>}
                    </div>
                    {c.handle && (
                      <div style={{
                        fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 11,
                        letterSpacing: '.04em', textTransform: 'uppercase',
                        color: 'var(--ink-faint)', marginTop: 3,
                      }}>
                        @{c.handle.replace(/^@/, '')}
                      </div>
                    )}
                  </div>

                  {/* Circle checkbox */}
                  {alreadyAdded ? (
                    <span className="t-meta" style={{ color: 'var(--ink-faint)', flexShrink: 0 }}>Added</span>
                  ) : (
                    <span style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isSelected ? 'var(--neon)' : 'transparent',
                      border: isSelected ? '2px solid var(--neon-deep)' : '2px solid var(--hairline)',
                      transition: 'background .15s, border-color .15s',
                    }}>
                      {isSelected && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      )}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: '1px solid var(--hairline)' }}>
          <span style={{
            fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 11,
            letterSpacing: '.13em', textTransform: 'uppercase',
            color: 'var(--ink-soft)',
          }}>
            {n} selected
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="pill"
              onClick={() => { setOpen(false); setError(null) }}
              style={{
                display: 'inline-flex', alignItems: 'center', height: 42, padding: '0 20px',
                borderRadius: 12, background: '#FFFFFF',
                border: '1px solid var(--hairline)',
                fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'var(--ink)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              className="neonbtn"
              onClick={handleAdd}
              disabled={loading || n === 0}
              style={{
                display: 'inline-flex', alignItems: 'center', height: 42, padding: '0 22px',
                borderRadius: 12, background: 'var(--neon)', border: 'none',
                boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
                fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, color: 'var(--ink)',
                cursor: loading || n === 0 ? 'not-allowed' : 'pointer',
                opacity: loading || n === 0 ? 0.5 : 1,
              }}
            >
              {loading ? 'Adding...' : `Add ${n > 0 ? n + ' ' : ''}creator${n !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
