'use client'

import { useState } from 'react'
import NewCampaignFields, { parseBudget } from '@/components/NewCampaignFields'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createCampaign } from './actions'
import TrackTag from '@/components/track/TrackTag'
import CampaignTypeModal from './CampaignTypeModal'
import TrackFilter, { type TrackFilterValue } from '@/components/track/TrackFilter'
import { PRODUCT_TYPES } from '@/lib/product-types'
import type { Track } from '@/lib/track'

interface Campaign {
  id: string
  name: string
  description: string
  status: 'active' | 'completed' | 'archived'
  createdAt: string
  totalDeals: number
  committedPaise: number
  paidPaise: number
  track: Track
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

export default function CampaignsClient({ campaigns, canGrowth = false }: {
  campaigns: Campaign[]
  canGrowth?: boolean
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  /* Defaults to All. A filter that starts narrowed is a mode wearing a
     filter's clothes — the brand would wonder where their campaigns went. */
  const [trackFilter, setTrackFilter] = useState<TrackFilterValue>('all')
  const [formTrack, setFormTrack] = useState<Track>('deals')
  const [formMode, setFormMode] = useState<'uniform' | 'per_creator'>('per_creator')
  const [formUniformType, setFormUniformType] = useState<string>(PRODUCT_TYPES[0])
  /* Two steps, not one panel. The chooser decides the track; the panel then
     collects a name for a campaign whose kind is already settled. */
  const [chooserOpen, setChooserOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formBudget, setFormBudget] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const q = search.trim().toLowerCase()
  const filtered = campaigns.filter((c) =>
    (!q || c.name.toLowerCase().includes(q)) &&
    (trackFilter === 'all' || c.track === trackFilter),
  )
  /* Counted over the SEARCH result, not the whole list, so the chips describe
     what they would actually show rather than the roster in the abstract. */
  const searched = campaigns.filter((c) => !q || c.name.toLowerCase().includes(q))
  const trackCounts = {
    deals: searched.filter((c) => c.track === 'deals').length,
    growth: searched.filter((c) => c.track === 'growth').length,
  }
  const activeCount = campaigns.filter((c) => c.status === 'active').length

  async function handleCreate() {
    if (!formName.trim()) { setError('Name is required'); return }
    setCreating(true)
    setError(null)
    const budget = parseBudget(formBudget)
    if (budget.error) { setError(budget.error); setCreating(false); return }
    const budgetPaise = budget.paise
    const res = await createCampaign(formName, formDesc || undefined, budgetPaise, {
      track: formTrack,
      deliverableMode: formMode,
      uniformProductType: formMode === 'uniform' ? formUniformType : undefined,
    })
    if (res.error) { setCreating(false); setError(res.error); return }
    setCreateOpen(false)
    setFormName('')
    setFormDesc('')
    setFormBudget('')
    setCreating(false)
    if (res.campaignId) router.push(`/campaigns/${res.campaignId}`)
  }

  return (
    /* 1200 and the deals page's padding: the width every app page and every
       drawn empty state uses. This one sat at 1120 with its own gutters, so
       switching tabs nudged the whole layout sideways. */
    /* boxSizing content-box: the cap measures the CONTENT, not the padded
       box. Global box-sizing is border-box, which left this page ~1112 of
       usable width while dashboard and browse — which pad an outer wrapper and
       cap an inner div — got the full 1200. Same result, one property. */
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(20px, 3vw, 40px) clamp(18px, 4vw, 44px) clamp(56px, 6vw, 90px)', boxSizing: 'content-box' }}>

      {/* ===== HERO =====
          Hidden while the create panel is open. Everything in it belongs to
          browsing campaigns, not making one: a count of campaigns that are not
          on screen, a search box for a list that is hidden, and a New Campaign
          button sitting above the New Campaign form it already opened. */}
      {!createOpen && (
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
            onClick={() => {
              if (createOpen) { setCreateOpen(false); return }
              setChooserOpen(true)
            }}
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
      )}

      {chooserOpen && (
        <CampaignTypeModal
          canGrowth={canGrowth}
          onClose={() => setChooserOpen(false)}
          onChoose={(t) => {
            setFormTrack(t)
            /* Growth campaigns are one deliverable for everyone by default:
               it is the mode that makes a bulk campaign quick, which is the
               reason to run one. The brand can still switch to per-creator in
               the panel. */
            setFormMode(t === 'growth' ? 'uniform' : 'per_creator')
            setChooserOpen(false)
            setCreateOpen(true)
          }}
        />
      )}

      {/* ===== CREATE PANEL ===== */}
      {createOpen && (
        <div className="surface reveal" style={{ padding: '26px 28px' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
            New Campaign
          </span>
          <NewCampaignFields
            draft={{ name: formName, description: formDesc, budget: formBudget }}
            onChange={(d) => { setFormName(d.name); setFormDesc(d.description); setFormBudget(d.budget) }}
            error={error}
            busy={creating}
            onSubmit={handleCreate}
            onCancel={() => { setCreateOpen(false); setError(null) }}
            extra={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
                {/* Settled in the chooser. Shown, not offered — a brand that
                    picked Growth and then meets a track toggle would
                    reasonably wonder whether their choice took. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="t-meta">Track</span>
                  <TrackTag track={formTrack} />
                </div>

                <div>
                  <div className="t-meta" style={{ marginBottom: 7 }}>Deliverables</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {([
                      ['uniform', 'Same for everyone'],
                      ['per_creator', 'Different per creator'],
                    ] as const).map(([m, label]) => (
                      <button
                        key={m} type="button" onClick={() => setFormMode(m)}
                        style={{
                          padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
                          background: formMode === m ? 'var(--ink)' : 'var(--card)',
                          border: `1px solid ${formMode === m ? 'var(--ink)' : 'var(--hairline)'}`,
                          color: formMode === m ? '#fff' : 'var(--ink-soft)',
                          fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5,
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {formMode === 'uniform' && (
                    <>
                      <select
                        className="ffield"
                        value={formUniformType}
                        onChange={(e) => setFormUniformType(e.target.value)}
                        style={{ marginTop: 10 }}
                      >
                        {PRODUCT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 6 }}>
                        Each creator&rsquo;s own price for this applies. The deliverable is the same, the rates are theirs.
                      </div>
                    </>
                  )}
                </div>
              </div>
            }
          />
        </div>
      )}

      {/* ===== CAMPAIGN LIST =====
          Hidden while the create panel is open. Naming a new campaign is a
          single task, and a list of the previous ones underneath it is the
          thing the brand has just navigated away from — it pushes the form's
          own buttons down the page and gives the eye somewhere else to go at
          the exact moment there is one thing to do. */}
      {!createOpen && (
      <>
      {/* Shown only once there is something to filter. Chips over a list of one
          are furniture. */}
      {trackCounts.growth > 0 && (
        <div style={{ marginTop: 22 }}>
          <TrackFilter value={trackFilter} onChange={setTrackFilter} counts={trackCounts} />
        </div>
      )}

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
                  {/* Beside the status, because "what kind of campaign" and
                      "where is it up to" are read together. */}
                  <TrackTag track={c.track} size="sm" />
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
      </>
      )}
    </div>
  )
}
