'use client'

import { useState } from 'react'
import NewCampaignFields, { parseBudget } from '@/components/NewCampaignFields'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createCampaign } from './actions'
import TrackTag from '@/components/track/TrackTag'
import CampaignTypeModal from './CampaignTypeModal'
import { type TrackFilterValue } from '@/components/track/TrackFilter'
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
  /** One letter per distinct creator, for the overlapping avatars. */
  creatorInitials: string[]
  creatorCount: number
}

/* Transcribed from "Brand Campaigns". The tier chip and the status dot are the
   row's two labels, and they carry their own palettes rather than reusing the
   deal-status one: a campaign is active or finished, which is a different
   question from where a single deal has got to. */
const TIER_CHIP: Record<Track, { bg: string; color: string; label: string }> = {
  deals:  { bg: '#E7F1FC', color: '#1F4E80', label: 'Deals' },
  growth: { bg: '#F0EAFD', color: '#4B3B8F', label: 'Growth' },
}

const CAMPAIGN_STATUS: Record<string, { label: string; dot: string }> = {
  active:    { label: 'Active',    dot: '#7FA11A' },
  completed: { label: 'Completed', dot: 'var(--ink-soft)' },
  archived:  { label: 'Archived',  dot: 'var(--ink-faint)' },
}

/* Six washes, cycled by position. Warmer than one flat grey and quiet enough
   that four circles side by side read as a group rather than a chart. */
const AVATAR_WASHES = [
  'linear-gradient(135deg,#F3F1FB,#EAF0FB)',
  'linear-gradient(135deg,#FBEFF0,#F3F1FB)',
  'linear-gradient(135deg,#FCF6E4,#FBEFF0)',
  'linear-gradient(135deg,#E7F1FC,#F3F1FB)',
  'linear-gradient(135deg,#FCF6E4,#E9F7F0)',
  'linear-gradient(135deg,#E9F7F0,#E7F1FC)',
]

function formatINR(paise: number): string {
  const rupees = Math.round(paise / 100)
  const s = String(rupees)
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  return '\u20B9' + (rest ? rest.replace(/\B(?=(\d\d)+(?!\d))/g, ',') + ',' + last3 : last3)
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
  /* Paged at 8, as drawn. A brand with forty campaigns had forty rows and no
     way to say "show me the next lot". */
  const [page, setPage] = useState(1)
  const [sortNewest, setSortNewest] = useState(true)
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

  /* Sorted, then paged. Sorting AFTER the filter rather than before, so the
     order describes what is on screen; a list sorted over everything and then
     cut would put page one's oldest campaign above page two's newest. */
  const ordered = filtered.slice().sort((a, b) => {
    const t = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    return sortNewest ? t : -t
  })
  const PAGE_SIZE = 8
  const totalPages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE))
  /* Clamped rather than reset: a brand on page 3 who narrows the filter should
     land on the last page that still has rows, not silently back at the top. */
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * PAGE_SIZE
  const pageItems = ordered.slice(start, start + PAGE_SIZE)
  const rangeFrom = ordered.length === 0 ? 0 : start + 1
  const rangeTo = start + pageItems.length

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
      <div className="surface reveal" style={{ padding: 'clamp(28px,3.4vw,40px) clamp(24px,3.6vw,40px) clamp(24px,3vw,32px)' }}>
        {/* Title on the left, the two counts on the right of the SAME row.
            They sat under the title before, which pushed the search bar down a
            line and left the hero's right half empty. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' as const }}>
          <div>
            <span className="t-meta">Campaign overview</span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em', fontSize: 'clamp(28px,3.2vw,36px)', margin: '12px 0 0', lineHeight: 1.1 }}>
              Your <span className="t-accent">campaigns</span>
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 30, padding: '0 13px', borderRadius: 999, background: '#EEF6D8', whiteSpace: 'nowrap' as const, fontSize: 10.5, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: '#4F6118' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7FA11A' }} />
              {activeCount} active
            </span>
            <span className="t-meta" style={{ color: 'var(--ink-soft)' }}>{campaigns.length} total</span>
          </div>
        </div>

        {/* Search + New campaign, both 52px and both radius 14 — a matched
            pair rather than a pill beside a rounded rectangle. */}
        <div className="herosearch" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 26, paddingTop: 22, borderTop: '1px solid var(--border-hairline)' }}>
          <label className="search" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: '0 18px', borderRadius: 14, background: '#F5F7FA', border: '1px solid transparent' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              placeholder="Search campaigns"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-ui)', fontSize: 14.5, color: 'var(--ink)' }}
            />
          </label>
          <button
            className="neonbtn"
            onClick={() => { if (createOpen) { setCreateOpen(false); return } setChooserOpen(true) }}
            style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 52, padding: '0 24px', borderRadius: 14,
              background: 'var(--neon)', border: 'none',
              fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14, color: 'var(--ink)',
              whiteSpace: 'nowrap' as const, cursor: 'pointer',
              boxShadow: '0 8px 20px -12px rgba(180,210,60,.95)',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New campaign
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
      {/* ── Segmented control + sort ─────────────────────────────────
            One pill group on a tinted track, as drawn: the selected segment is
            a white chip that sits up out of it, which reads as a switch rather
            than three chips that happen to be adjacent. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' as const, marginTop: 26 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: 4, borderRadius: 999, background: 'rgba(24,28,36,.06)' }}>
            {([
              ['all', 'All', campaigns.filter((c) => !q || c.name.toLowerCase().includes(q)).length],
              ['deals', 'Deals', trackCounts.deals],
              ['growth', 'Growth', trackCounts.growth],
            ] as const).map(([k, label, count]) => {
              const on = trackFilter === k
              return (
                <button
                  key={k}
                  onClick={() => { setTrackFilter(k as TrackFilterValue); setPage(1) }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    height: 34, padding: '0 18px', borderRadius: 999, border: 'none',
                    background: on ? '#FFFFFF' : 'transparent',
                    boxShadow: on ? '0 1px 2px rgba(18,21,28,.08), 0 4px 10px -4px rgba(18,21,28,.14)' : 'none',
                    fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13,
                    color: on ? 'var(--ink)' : 'var(--ink-soft)', cursor: 'pointer',
                    transition: 'background .18s ease, color .18s ease, box-shadow .18s ease',
                  }}
                >
                  {label}
                  <span style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontWeight: 600, fontSize: 12, color: 'var(--ink-faint)' }}>{count}</span>
                </button>
              )
            })}
          </div>

          {/* The design draws "Newest" and "Filter". Newest is real — it
              flips the order. A second Filter button beside a segmented
              control that already filters would be a control with nothing
              left to do, so it is not drawn here. */}
          <button
            className="ghostbtn"
            onClick={() => setSortNewest((v) => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 999, border: '1px solid var(--border-hairline)', background: 'transparent', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'var(--ink-soft)', cursor: 'pointer' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 16 4 4 4-4M7 20V4M21 8l-4-4-4 4M17 4v16" />
            </svg>
            {sortNewest ? 'Newest' : 'Oldest'}
          </button>
        </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
        {pageItems.map((c) => {
          const st = CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.active!
          const tier = TIER_CHIP[c.track]
          const paidPct = c.committedPaise > 0
            ? Math.min(100, Math.round((c.paidPaise / c.committedPaise) * 100))
            : 0
          const shown = c.creatorInitials.slice(0, 4)
          const overflow = c.creatorCount - shown.length
          return (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="surface ccard reveal"
              style={{ display: 'block', padding: '24px 30px', borderRadius: 22, textDecoration: 'none', color: 'inherit' }}
            >
              {/* Three columns, as drawn: who and what on the left, the people
                  in the middle, the money on the right behind a rule. The
                  description is deliberately absent — the drawing gives the
                  row one line for a name, and a paragraph underneath is what
                  made the old rows different heights. */}
              <div className="rowgrid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto 280px', gap: 36, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ height: 22, padding: '0 9px', display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: tier.bg, color: tier.color, fontSize: 11.5, fontWeight: 700 }}>
                      {tier.label}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-soft)' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.dot }} />
                      {st.label}
                    </span>
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 17, letterSpacing: '-0.005em', color: 'var(--ink)', margin: '10px 0 0', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.name}
                  </h3>
                </div>

                {/* Who is in it. The old row counted deals and never named a
                    person; four overlapping initials answer "who" at a glance,
                    and the +N carries the rest rather than widening the column. */}
                <div style={{ display: 'flex', paddingLeft: 7, minWidth: 32 }}>
                  {shown.map((initial, i) => (
                    <span key={i} style={{ width: 32, height: 32, marginLeft: -7, borderRadius: '50%', border: '2px solid #FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, background: AVATAR_WASHES[i % AVATAR_WASHES.length] }}>
                      {initial}
                    </span>
                  ))}
                  {overflow > 0 && (
                    <span style={{ width: 32, height: 32, marginLeft: -7, borderRadius: '50%', border: '2px solid #FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-num, var(--font-ui))', fontWeight: 700, fontSize: 10.5, background: '#F0F2F5', color: 'var(--ink-soft)' }}>
                      +{overflow}
                    </span>
                  )}
                </div>

                <div style={{ paddingLeft: 30, borderLeft: '1px solid rgba(24,28,36,.07)' }}>
                  {/* PAID against COMMITTED, which is the question a brand has
                      about a running campaign. The bar is ink rather than neon:
                      it is a reading, not a thing to press. */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, fontSize: 12.5, color: 'var(--ink-faint)' }}>
                    <span style={{ whiteSpace: 'nowrap' as const }}>
                      <b style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontSize: 16, color: 'var(--ink)' }}>{formatINR(c.paidPaise)}</b> paid
                    </span>
                    <span style={{ whiteSpace: 'nowrap' as const }}>of {formatINR(c.committedPaise)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 6, background: '#F0F2F5', marginTop: 10, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${paidPct}%`, background: 'var(--ink)', borderRadius: 6 }} />
                  </div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* ===== RESULT COUNT + PAGES ===== */}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 22, padding: '0 4px', flexWrap: 'wrap' as const }}>
          <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            Showing {rangeFrom}&ndash;{rangeTo} of {filtered.length} campaign{filtered.length !== 1 ? 's' : ''}
          </span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 999, background: '#FFFFFF', border: '1px solid var(--border-hairline)' }}>
              <button onClick={() => setPage(Math.max(1, safePage - 1))} aria-label="Previous page" style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: safePage > 1 ? 1 : 0.35, cursor: safePage > 1 ? 'pointer' : 'default' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button key={n} onClick={() => setPage(n)} aria-current={n === safePage ? 'page' : undefined} style={{ minWidth: 34, height: 34, padding: '0 6px', borderRadius: 999, border: 'none', background: n === safePage ? 'var(--ink)' : 'transparent', color: n === safePage ? '#FFFFFF' : 'var(--ink-soft)', fontFamily: 'var(--font-num, var(--font-ui))', fontSize: 13, fontWeight: n === safePage ? 700 : 500, cursor: 'pointer' }}>
                  {n}
                </button>
              ))}
              <button onClick={() => setPage(Math.min(totalPages, safePage + 1))} aria-label="Next page" style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: safePage < totalPages ? 1 : 0.35, cursor: safePage < totalPages ? 'pointer' : 'default' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== EMPTY STATE ===== */}
      {filtered.length === 0 && (
        <div className="surface reveal" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'clamp(40px,5vw,64px) 24px', marginTop: 16 }}>
          <div className="t-headline" style={{ marginTop: 16 }}>
            {search.trim() || trackFilter !== 'all' ? 'No campaigns found' : 'No campaigns yet'}
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 400, color: 'var(--ink-soft)', marginTop: 8, maxWidth: 360, lineHeight: 1.6 }}>
            {search.trim() || trackFilter !== 'all' ? 'Try a different search or tier.' : 'Create a campaign to organise your deals and brief creators.'}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}
