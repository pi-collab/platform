'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createCampaign } from './actions'

interface Campaign {
  id: string
  name: string
  description: string
  status: 'active' | 'completed' | 'archived'
  createdAt: string
  totalDeals: number
  committedPaise: number
  paidPaise: number
}

function formatINR(paise: number): string {
  const rupees = Math.round(paise / 100)
  const s = String(rupees)
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  return '\u20B9' + (rest ? rest.replace(/\B(?=(\d\d)+(?!\d))/g, ',') + ',' + last3 : last3)
}

const STATUS_MAP: Record<string, { label: string; bg: string; fg: string }> = {
  active:    { label: 'Active',    bg: 'var(--lime-50)',  fg: 'var(--lime-700)' },
  completed: { label: 'Completed', bg: 'var(--sec-2)',    fg: 'var(--ink-soft)' },
  archived:  { label: 'Archived',  bg: 'var(--sec-2)',    fg: 'var(--ink-faint)' },
}

export default function CampaignsClient({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formBudget, setFormBudget] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const q = search.trim().toLowerCase()
  const filtered = campaigns.filter((c) => !q || c.name.toLowerCase().includes(q))
  const activeCount = campaigns.filter((c) => c.status === 'active').length

  async function handleCreate() {
    if (!formName.trim()) { setError('Name is required'); return }
    setCreating(true)
    setError(null)
    const budgetPaise = formBudget.trim() ? Math.round(parseFloat(formBudget) * 100) : undefined
    if (formBudget.trim() && (isNaN(budgetPaise!) || budgetPaise! < 0)) { setError('Budget must be a positive number'); setCreating(false); return }
    const res = await createCampaign(formName, formDesc || undefined, budgetPaise)
    if (res.error) { setCreating(false); setError(res.error); return }
    setCreateOpen(false)
    setFormName('')
    setFormDesc('')
    setFormBudget('')
    setCreating(false)
    if (res.campaignId) router.push(`/campaigns/${res.campaignId}`)
  }

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(18px,2.4vw,30px) clamp(22px,4vw,56px) clamp(56px,6vw,96px)' }}>

      {/* ===== HERO ===== */}
      <div className="surface reveal" style={{ padding: '28px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <span className="t-meta">Campaign overview</span>
        </div>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(30px,4vw,36px)', fontWeight: 700, letterSpacing: '-0.03em', margin: '12px 0 0' }}>
          Your <span className="t-accent">campaigns</span>
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: 'var(--lime-50)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lime-700)' }} />
            <span className="t-meta" style={{ color: 'var(--lime-700)' }}>{activeCount} active</span>
          </span>
          <span className="t-meta">{campaigns.length} total</span>
        </div>

        {/* Search + New Campaign */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--hairline)' }}>
          <div className="searchwrap" style={{
            display: 'flex', alignItems: 'center', gap: 10,
            flex: '1 1 240px', minWidth: 180, height: 44,
            padding: '0 8px 0 16px', borderRadius: 999,
            background: '#F4F6F2', border: 'none',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              placeholder="Search campaigns"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'none',
                fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 500, color: 'var(--ink)',
              }}
            />
          </div>
          <button
            className="neonbtn"
            onClick={() => setCreateOpen((v) => !v)}
            style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7,
              height: 44, padding: '0 18px', borderRadius: 11,
              background: 'var(--neon)', border: 'none',
              boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
              fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5,
              color: 'var(--ink)', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Campaign
          </button>
        </div>
      </div>

      {/* ===== CREATE PANEL ===== */}
      {createOpen && (
        <div className="surface reveal" style={{ padding: '26px 28px', marginTop: 18 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
            New Campaign
          </span>
          {error && (
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: '#dc2626', marginTop: 12 }}>{error}</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 20 }}>
            <div>
              <div className="t-meta" style={{ marginBottom: 7 }}>Campaign name</div>
              <input className="ffield" type="text" placeholder="e.g. Winter capsule" value={formName} onChange={(e) => setFormName(e.target.value)} autoFocus />
            </div>
            <div>
              <div className="t-meta" style={{ marginBottom: 7 }}>Description / brief (optional)</div>
              <textarea className="ffield" rows={3} placeholder="What is this campaign about?" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
            </div>
            <div style={{ maxWidth: 260 }}>
              <div className="t-meta" style={{ marginBottom: 7 }}>Budget in ₹ (optional)</div>
              <input className="ffield" type="text" placeholder="e.g. 150000" value={formBudget} onChange={(e) => setFormBudget(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            <button
              className="neonbtn"
              onClick={handleCreate}
              disabled={creating || !formName.trim()}
              style={{
                display: 'inline-flex', alignItems: 'center', height: 42, padding: '0 20px',
                borderRadius: 11, background: 'var(--neon)', border: 'none',
                boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
                fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, color: 'var(--ink)',
                cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.5 : 1,
              }}
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              className="pill"
              onClick={() => { setCreateOpen(false); setError(null) }}
              style={{
                display: 'inline-flex', alignItems: 'center', height: 42, padding: '0 20px',
                borderRadius: 11, background: 'var(--card)',
                border: '1px solid var(--hairline)',
                fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ===== CAMPAIGN LIST ===== */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 22 }}>
        {filtered.map((c) => {
          const st = STATUS_MAP[c.status] ?? STATUS_MAP.active
          const hasSpend = c.committedPaise > 0
          const budgetPct = hasSpend ? Math.min(100, Math.round((c.paidPaise / c.committedPaise) * 100)) : 0
          const dateStr = new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          return (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="surface ccard reveal"
              style={{ display: 'flex', alignItems: 'center', gap: 32, padding: '24px 28px', textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
            >
              {/* Left: name + description */}
              <div style={{ flex: 1.3, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3 style={{
                    fontFamily: 'var(--font-ui)', fontSize: 15.5, fontWeight: 600,
                    color: 'var(--ink)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {c.name}
                  </h3>
                  <span style={{ width: 1, height: 12, background: 'var(--hairline)', flexShrink: 0 }} />
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '4px 10px', borderRadius: 999,
                    fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 10.5, letterSpacing: '.01em',
                    background: st.bg, color: st.fg,
                  }}>
                    {st.label}
                  </span>
                </div>
                {c.description && (
                  <p style={{
                    fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 400,
                    color: 'var(--ink-soft)', margin: '6px 0 0',
                    lineHeight: 1.6,
                  }}>
                    {c.description}
                  </p>
                )}
              </div>

              {/* Right: metrics */}
              {hasSpend ? (
                <div style={{ flex: 1, borderLeft: '1px solid var(--hairline)', paddingLeft: 28, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span className="t-meta">{c.totalDeals} {c.totalDeals === 1 ? 'deal' : 'deals'}</span>
                    <span className="t-meta">Created {dateStr}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--sec-2)', marginTop: 10, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      background: 'var(--lime-400)',
                      width: `${budgetPct}%`,
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 12 }}>
                    <span>
                      <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 19, lineHeight: '.9', letterSpacing: '-0.045em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums lining-nums' }}>
                        {formatINR(c.committedPaise)}
                      </span>
                      <span className="t-meta" style={{ marginLeft: 6 }}>committed</span>
                    </span>
                    <span>
                      <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 19, lineHeight: '.9', letterSpacing: '-0.045em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums lining-nums' }}>
                        {formatINR(c.paidPaise)}
                      </span>
                      <span className="t-meta" style={{ marginLeft: 6 }}>paid</span>
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, borderLeft: '1px solid var(--hairline)', paddingLeft: 28 }}>
                  <span className="t-meta">{c.totalDeals} {c.totalDeals === 1 ? 'deal' : 'deals'} · Created {dateStr}</span>
                </div>
              )}
            </Link>
          )
        })}
      </div>

      {/* ===== EMPTY STATE ===== */}
      {filtered.length === 0 && (
        <div className="surface reveal" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'clamp(40px,5vw,64px) 24px', marginTop: 16 }}>
          <div className="t-headline" style={{ marginTop: 16 }}>
            {search.trim() ? 'No campaigns match' : 'No campaigns yet'}
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 400, color: 'var(--ink-soft)', marginTop: 8, maxWidth: 360, lineHeight: 1.6 }}>
            {search.trim() ? 'Try a different search term.' : 'Create a campaign to organise your deals and brief creators.'}
          </div>
        </div>
      )}
    </div>
  )
}
