'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import Toast from '@/components/Toast'
import { useRouter } from 'next/navigation'
import FilterDropdown from '@/components/FilterDropdown'
import Link from 'next/link'
import type { BrowseCreator } from './page'
import { NICHES } from '@/lib/niches'

/* ── Helpers ────────────────────────────────────────────────────── */

/** The typed figure. Kept as the fallback for creators who have not connected. */
function bestFollowers(sa: Array<{ follower_count: number | null }> | null): number {
  if (!sa || sa.length === 0) return 0
  return Math.max(0, ...sa.map((s) => s.follower_count ?? 0))
}

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString('en-IN')
}

function lowestRate(rc: Record<string, number> | null): number | null {
  if (!rc) return null
  const values = Object.values(rc).filter((v) => v > 0)
  if (values.length === 0) return null
  return Math.min(...values)
}

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(rupees % 100_000 === 0 ? 0 : 1)}L`
  if (rupees >= 1_000) return `₹${Math.round(rupees / 1_000)}K`
  return `₹${rupees.toLocaleString('en-IN')}`
}

function primarySocial(sa: Array<{ platform: string; handle: string; follower_count: number | null }> | null) {
  if (!sa || sa.length === 0) return null
  return sa.reduce((best, cur) =>
    (cur.follower_count ?? 0) > (best.follower_count ?? 0) ? cur : best
  , sa[0])
}

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

function PlatformIcon({ platform, size = 13 }: { platform: string; size?: number }) {
  const p = platform.toLowerCase()
  if (p === 'instagram' || p === 'ig') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" />
    </svg>
  )
  if (p === 'youtube' || p === 'yt') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9.5 5 2.5-5 2.5z" />
    </svg>
  )
  return <span style={{ fontSize: size - 2, fontWeight: 700 }}>{platform.slice(0, 2).toUpperCase()}</span>
}

/* ── Rate filter brackets ────────────────────────────────────────── */
const RATE_FILTERS = [
  { value: 'any', label: 'Any rate' },
  { value: 'lt50', label: 'Under ₹50K' },
  { value: '50to100', label: '₹50K – ₹1L' },
  { value: 'gt100', label: '₹1L+' },
]

const SORT_OPTIONS = [
  { value: 'followers', label: 'Followers' },
  { value: 'rateLow', label: 'Rate ↑' },
  { value: 'name', label: 'Name' },
]

const PAGE_SIZE = 9

/* ── Animated placeholder hook ───────────────────────────────────── */
function useAnimatedPlaceholder() {
  const phrases = [
    'Search name or @handle',
    'Try "finance creators"',
    'Try "beauty under 50K"',
    'Try "tech in Bangalore"',
  ]
  const [ph, setPh] = useState('')
  useEffect(() => {
    let i = 0, n = 0, del = false
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const word = phrases[i]
      n += del ? -1 : 1
      setPh(word.slice(0, n))
      let wait = del ? 34 : 62
      if (!del && n === word.length) { del = true; wait = 1900 }
      else if (del && n === 0) { del = false; i = (i + 1) % phrases.length; wait = 320 }
      timer = setTimeout(tick, wait)
    }
    timer = setTimeout(tick, 500)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ph
}

/* ── Component ──────────────────────────────────────────────────── */

export default function BrowseGrid({ creators, storefrontSlugs = {}, verifiedFollowers = {} }: {
  creators: BrowseCreator[]
  storefrontSlugs?: Record<string, string>
  /** creatorId -> followers from a connected Instagram account. */
  verifiedFollowers?: Record<string, number>
}) {
  // Verified first, typed second. Connecting Instagram does not write into
  // social_accounts, so a connected creator's typed count is usually absent and
  // reading it alone showed them as 0 and sorted them last.
  const followersOf = (c: BrowseCreator) =>
    verifiedFollowers[c.id] ?? bestFollowers(c.social_accounts)

  const [search, setSearch] = useState('')
  // An array, empty meaning no niche filter. A creator's storefront can carry
  // several categories, so filtering on one at a time asked a brand to guess
  // which of them we happened to match on.
  const [nicheFilter, setNicheFilter] = useState<string[]>([])

  // Built from the creators actually listed, not a fixed list. NICHES was a
  // hardcoded set, so it offered options nobody matched and hid the ones
  // creators had entered on their storefront.
  const nicheOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of creators) {
      for (const n of c.niches ?? []) counts.set(n, (counts.get(n) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, n]) => ({ value: label, label, hint: String(n) }))
  }, [creators])
  const [platformFilter, setPlatformFilter] = useState<'all' | 'instagram' | 'youtube'>('all')
  const [rateFilter, setRateFilter] = useState('any')
  const [sort, setSort] = useState('followers')
  const [savedView, setSavedView] = useState(false)
  /* SAVED SURVIVES A RELOAD. It was component state, so a brand who saved six
     creators and refreshed had saved nothing. Per browser rather than per
     account: a table would be the right home and would follow them between
     devices and teammates, but that is a migration and RLS, and losing the list
     on every reload was the bug in front of us. */
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('guapd_saved_creators')
      if (raw) setSaved(JSON.parse(raw))
    } catch { /* private mode, cleared storage: start empty rather than break */ }
  }, [])
  useEffect(() => {
    try { window.localStorage.setItem('guapd_saved_creators', JSON.stringify(saved)) } catch { /* ignore */ }
  }, [saved])

  /* Selection is only for the saved list, and is separate from `saved`:
     ticking a creator to put in a campaign is not the same act as keeping
     them. */
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [startingCampaign, setStartingCampaign] = useState(false)
  const router = useRouter()
  const pickedIds = Object.keys(picked).filter((id) => picked[id])
  const [shown, setShown] = useState(PAGE_SIZE)
  const searchRef = useRef<HTMLInputElement>(null)
  const ph = useAnimatedPlaceholder()

  /* Grid or list, remembered. Which way a brand reads a roster is a working
     preference, not a per-visit choice, and it is a browser-local one for the
     same reason `saved` is. Grid stays the default: it is what this page has
     always opened as. */
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('guapd_browse_view')
      if (raw === 'list' || raw === 'grid') setViewMode(raw)
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try { window.localStorage.setItem('guapd_browse_view', viewMode) } catch { /* ignore */ }
  }, [viewMode])

  const savedCount = Object.values(saved).filter(Boolean).length

  /* Say what just happened.
   *
   * The bookmark filling in is the only feedback a save had, and it is a 20px
   * icon under the thumb that just covered it. `seq` remounts the toast so a
   * second save re-announces itself rather than being swallowed by the first
   * one's dismissal timer. */
  const [toast, setToast] = useState<{ msg: string; seq: number } | null>(null)
  const toastSeq = useRef(0)

  const toggleSave = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    /* Read outside the updater. A setState updater has to be pure - React is
       free to run it twice - and announcing from inside one gives two toasts in
       development and a double-counted seq. */
    const next = !saved[id]
    setSaved((prev) => ({ ...prev, [id]: next }))
    const name = creators.find((c) => c.id === id)?.full_name ?? 'Creator'
    toastSeq.current += 1
    setToast({
      msg: next ? `${name} added to your saved list.` : `${name} removed from your saved list.`,
      seq: toastSeq.current,
    })
  }, [creators, saved])

  const filtered = useMemo(() => {
    let list = creators

    // Saved view
    if (savedView) list = list.filter((c) => saved[c.id])

    // Search
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((c) => {
        const nameMatch = c.full_name.toLowerCase().includes(q)
        const handleMatch = c.handle?.toLowerCase().includes(q)
        const nicheMatch = (c.niches ?? []).some((n) => n.toLowerCase().includes(q))
        return nameMatch || handleMatch || nicheMatch
      })
    }

    // Niche
    if (nicheFilter.length > 0) {
      // ANY, not all: a brand picking Beauty and Fashion wants either, not
      // creators who happen to carry both.
      list = list.filter((c) => (c.niches ?? []).some((n) => nicheFilter.includes(n)))
    }

    // Platform
    if (platformFilter !== 'all') {
      list = list.filter((c) =>
        (c.social_accounts ?? []).some((sa) => sa.platform.toLowerCase() === platformFilter)
      )
    }

    // Rate
    if (rateFilter !== 'any') {
      list = list.filter((c) => {
        const low = lowestRate(c.rate_card)
        if (low === null) return false
        const rupees = low / 100
        if (rateFilter === 'lt50') return rupees < 50_000
        if (rateFilter === '50to100') return rupees >= 50_000 && rupees <= 100_000
        if (rateFilter === 'gt100') return rupees > 100_000
        return true
      })
    }

    // Sort
    list = [...list].sort((a, b) => {
      if (sort === 'followers') return followersOf(b) - followersOf(a)
      if (sort === 'rateLow') return (lowestRate(a.rate_card) ?? 0) - (lowestRate(b.rate_card) ?? 0)
      return a.full_name.localeCompare(b.full_name)
    })

    return list
  }, [creators, search, nicheFilter, platformFilter, rateFilter, sort, savedView, saved])

  const pageList = filtered.slice(0, shown)
  const hasMore = shown < filtered.length

  // Active filter chips
  const chips: { label: string; onRemove: () => void }[] = []
  if (platformFilter !== 'all') chips.push({ label: platformFilter === 'instagram' ? 'Instagram' : 'YouTube', onRemove: () => setPlatformFilter('all') })
  for (const n of nicheFilter) chips.push({ label: n, onRemove: () => setNicheFilter((prev) => prev.filter((x) => x !== n)) })
  if (rateFilter !== 'any') chips.push({ label: RATE_FILTERS.find((r) => r.value === rateFilter)?.label ?? rateFilter, onRemove: () => setRateFilter('any') })
  const hasChips = chips.length > 0

  function clearAll() {
    setSearch('')
    setNicheFilter([])
    setPlatformFilter('all')
    setRateFilter('any')
    setSort('followers')
    setSavedView(false)
    setShown(PAGE_SIZE)
  }

  const igActive = platformFilter === 'instagram'
  const ytActive = platformFilter === 'youtube'

  return (
    <section style={{ padding: 'clamp(18px,2.4vw,30px) clamp(22px,4vw,56px) clamp(48px,5vw,80px)' }}>
      <style>{`
        .creator-card {
          transition: border-color .2s ease, box-shadow .2s ease, transform .15s ease;
        }
        .creator-card:hover {
          border-color: var(--neon) !important;
          box-shadow: 0 0 0 2px var(--neon), 0 20px 46px -34px rgba(40,45,25,.34);
          transform: translateY(-2px);
        }
      `}</style>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        {/* ══════ HEADER CARD ══════ */}
        <div style={{
          borderRadius: 20,
          background: '#FFFFFF',
          boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 8px 16px rgba(22,23,15,.04), 0 32px 64px rgba(22,23,15,.05)',
          padding: '32px 36px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link
              href="/dashboard"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--ink-faint)', whiteSpace: 'nowrap', textDecoration: 'none' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              Back to dashboard
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <div style={{ display: 'flex', gap: 22, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
              <button
                onClick={() => setSavedView(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13,
                  padding: '0 0 4px',
                  color: !savedView ? 'var(--ink)' : 'var(--ink-faint)',
                  borderBottom: `2px solid ${!savedView ? 'var(--ink)' : 'transparent'}`,
                }}
              >
                All creators
              </button>
              <button
                onClick={() => setSavedView(true)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13,
                  padding: '0 0 4px',
                  color: savedView ? 'var(--ink)' : 'var(--ink-faint)',
                  borderBottom: `2px solid ${savedView ? 'var(--ink)' : 'transparent'}`,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                Saved
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
                  background: savedView ? 'var(--neon)' : 'var(--sec-2)',
                  fontSize: 10.5, fontWeight: 800,
                }}>
                  {savedCount}
                </span>
              </button>
            </div>

            {/* List or grid. Cards are for weighing one creator at a time;
                rows are for running down twenty and ticking the ones you
                want, which is why the checkbox lives on the row. */}
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-hairline)', borderRadius: 10, overflow: 'hidden' }}>
              <button
                onClick={() => setViewMode('list')}
                aria-label="List view"
                aria-pressed={viewMode === 'list'}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 34, height: 30, border: 'none', cursor: 'pointer',
                  background: viewMode === 'list' ? 'var(--neon)' : 'transparent',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={viewMode === 'list' ? 'var(--ink)' : 'var(--ink-faint)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
              </button>
              <div style={{ width: 1, height: 20, background: 'var(--border-hairline)' }} />
              <button
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 34, height: 30, border: 'none', cursor: 'pointer',
                  background: viewMode === 'grid' ? 'var(--neon)' : 'transparent',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={viewMode === 'grid' ? 'var(--ink)' : 'var(--ink-faint)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></svg>
              </button>
            </div>
            </div>
          </div>

          {/* The heading line doubles as the selection line. The action for
              what you have ticked belongs beside the thing you ticked it in,
              not in a bar further down the page that the list can scroll away
              from. Nothing is there until something is selected. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', margin: '18px 0 0' }}>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600,
              letterSpacing: '-0.02em', margin: 0,
            }}>
              Browse <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, fontSize: 36 }}>creators</span>
            </h1>

            {pickedIds.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
                  {pickedIds.length} selected
                </span>
                {/* One creator is a deal; several are a campaign. The word
                    follows the count, because "Start a campaign" over a single
                    creator is heavier than the thing it does. */}
                {pickedIds.length === 1 ? (
                  <Link
                    href={`/deals/new?creator=${pickedIds[0]}`}
                    style={{
                      height: 38, padding: '0 20px', borderRadius: 11,
                      backgroundColor: 'var(--neon)', border: 'none',
                      fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13,
                      color: 'var(--ink)', textDecoration: 'none', whiteSpace: 'nowrap',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      boxShadow: '0 12px 24px -14px rgba(180,210,60,.9)',
                    }}
                  >
                    Start deal
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </Link>
                ) : (
                  <button
                    disabled={startingCampaign}
                    onClick={async () => {
                      const name = window.prompt('Name this campaign')
                      if (!name?.trim()) return
                      setStartingCampaign(true)
                      const { startCampaignWithCreators } = await import('@/app/campaigns/actions')
                      const res = await startCampaignWithCreators(name, pickedIds)
                      setStartingCampaign(false)
                      if ('error' in res && res.error) { window.alert(res.error); return }
                      router.push(`/campaigns/${(res as { campaignId: string }).campaignId}`)
                    }}
                    style={{
                      height: 38, padding: '0 20px', borderRadius: 11,
                      background: 'var(--neon)', border: 'none',
                      fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13,
                      color: 'var(--ink)', cursor: startingCampaign ? 'wait' : 'pointer',
                      opacity: startingCampaign ? 0.6 : 1, whiteSpace: 'nowrap',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      boxShadow: '0 12px 24px -14px rgba(180,210,60,.9)',
                    }}
                  >
                    {startingCampaign ? 'Starting...' : 'Start campaign'}
                    {!startingCampaign && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
                  </button>
                )}
                <button
                  onClick={() => setPicked({})}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12.5,
                    color: 'var(--ink-faint)', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* ── Filter bar ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginTop: 20,
            paddingTop: 18, borderTop: '1px solid var(--border-hairline)', flexWrap: 'nowrap',
          }}>
            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--ink-faint)', flex: '1 1 240px', minWidth: 150 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShown(PAGE_SIZE) }}
                placeholder={ph}
                style={{
                  flex: 1, minWidth: 0, border: 'none',
                  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500,
                  outline: 'none', background: 'none', color: 'var(--ink)',
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  style={{
                    flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 22, height: 22, borderRadius: '50%', background: 'rgba(40,45,25,.08)',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            <div style={{ width: 1, height: 20, background: 'var(--border-hairline)' }} />

            {/* Platform toggles + dropdowns */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 1 auto', minWidth: 0 }}>
              {/* Platform toggle pill */}
              <div style={{
                display: 'flex', alignItems: 'stretch', flexShrink: 0,
                border: '1px solid #D4D4CB', borderRadius: 12, background: '#fff', overflow: 'hidden',
              }}>
                <button
                  onClick={() => setPlatformFilter(igActive ? 'all' : 'instagram')}
                  aria-label="Instagram creators"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    padding: '6px 12px', background: igActive ? 'var(--neon)' : 'transparent', border: 'none', cursor: 'pointer',
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={igActive ? 'var(--ink)' : '#9EA096'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></svg>
                </button>
                <div style={{ width: 1, background: '#D4D4CB', flexShrink: 0 }} />
                <button
                  onClick={() => setPlatformFilter(ytActive ? 'all' : 'youtube')}
                  aria-label="YouTube creators"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    padding: '6px 12px', background: ytActive ? 'var(--neon)' : 'transparent', border: 'none', cursor: 'pointer',
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ytActive ? 'var(--ink)' : '#9EA096'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9.5 5 2.5-5 2.5z" /></svg>
                </button>
              </div>

              {/* All three share the dashboard's dropdown, so one page stops
                  carrying two visual languages. Niche is multi-select, which a
                  native <select> cannot do without ctrl-click. */}
              <FilterDropdown
                multiple
                placeholder="All niches"
                value={nicheFilter}
                onChange={(v) => { setNicheFilter(v); setShown(PAGE_SIZE) }}
                options={[
                  { value: 'all', label: 'All niches' },
                  // Only niches some creator actually has, with a count. An
                  // option that returns nothing is a dead end dressed as a
                  // choice.
                  ...nicheOptions,
                ]}
              />

              <FilterDropdown
                placeholder="Any rate"
                value={rateFilter}
                onChange={(v) => { setRateFilter(v); setShown(PAGE_SIZE) }}
                options={RATE_FILTERS.map((r) => ({ value: r.value, label: r.label }))}
                minWidth={190}
              />

              <FilterDropdown
                placeholder="Sort"
                value={sort}
                onChange={setSort}
                options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                align="right"
                minWidth={190}
              />
            </div>
          </div>
        </div>

        {/* ══════ RESULT META + CHIPS ══════ */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' }}>
              {filtered.length} creator{filtered.length !== 1 ? 's' : ''}
            </span>

            {hasChips && <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--ink-faint)' }} />}

            {chips.map((chip) => (
              <button
                key={chip.label}
                onClick={chip.onRemove}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 8px 5px 12px', borderRadius: 'var(--radius-pill)',
                  background: 'var(--card)', border: '1px solid var(--frost-edge)',
                  fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
                  color: 'var(--ink)', cursor: 'pointer',
                }}
              >
                {chip.label}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 16, height: 16, borderRadius: '50%', background: 'rgba(40,45,25,.08)',
                }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </span>
              </button>
            ))}

            {hasChips && (
              <button
                onClick={clearAll}
                style={{
                  background: 'none', border: 'none', fontFamily: 'var(--font-ui)',
                  fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', cursor: 'pointer',
                  textDecoration: 'underline', textUnderlineOffset: 2,
                }}
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* ══════ GRID ══════ */}
        {filtered.length === 0 ? (
          <div style={{
            borderRadius: 26, background: 'var(--card)',
            border: '1px dashed var(--border-hairline)',
            boxShadow: '0 28px 58px -36px rgba(40,45,25,.42), inset 0 1.5px 0 rgba(255,255,255,.9)',
            padding: 'clamp(40px,5vw,64px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
            marginTop: 20,
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, marginTop: 20 }}>
              {savedView ? 'No saved creators yet' : 'No creators match your filters'}
            </div>
            <p style={{ margin: '9px 0 0', color: 'var(--ink-soft)', maxWidth: 380, lineHeight: 1.55, fontSize: 14 }}>
              {savedView ? 'Tap the bookmark icon on any creator card to save them here.' : 'Try adjusting your search or filters to find what you\'re looking for.'}
            </p>
            <button
              onClick={clearAll}
              style={{
                marginTop: 22, padding: '12px 24px', borderRadius: 'var(--radius-pill)',
                backgroundColor: 'var(--neon)', border: 'none',
                fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14,
                color: 'var(--ink)', cursor: 'pointer',
                boxShadow: '0 14px 28px -8px rgba(180,210,60,.9)',
              }}
            >
              {savedView ? 'Browse all creators' : 'Clear filters'}
            </button>
          </div>
        ) : (
          <>
            {viewMode === 'list' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
                {pageList.map((c) => (
                  <CreatorRow
                    key={c.id}
                    creator={c}
                    verifiedFollowers={verifiedFollowers[c.id]}
                    isPicked={!!picked[c.id]}
                    onTogglePick={(id) => setPicked((prev) => ({ ...prev, [id]: !prev[id] }))}
                    isSaved={!!saved[c.id]}
                    onToggleSave={toggleSave}
                  />
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 20 }}>
                {pageList.map((c) => (
                  <CreatorCard
                    key={c.id}
                    creator={c}
                    isSaved={!!saved[c.id]}
                    onToggleSave={toggleSave}
                    storefrontSlug={storefrontSlugs[c.id] ?? null}
                    verifiedFollowers={verifiedFollowers[c.id]}
                    hideDealCta={savedView}
                    isPicked={!!picked[c.id]}
                    onTogglePick={(id) => setPicked((prev) => ({ ...prev, [id]: !prev[id] }))}
                  />
                ))}
              </div>
            )}

            {/* Load more */}
            {hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 36 }}>
                <button
                  onClick={() => setShown((s) => s + PAGE_SIZE)}
                  style={{
                    padding: '13px 26px', borderRadius: 'var(--radius-pill)',
                    background: 'var(--card)', border: '1px solid rgba(40,45,25,.18)',
                    fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13,
                    color: 'var(--ink)', cursor: 'pointer',
                  }}
                >
                  Show more ({filtered.length - shown} remaining)
                </button>
              </div>
            )}
          </>
        )}

        {/* The selection action lives on the heading line, beside "Browse
            creators". A bar down here restated a count the list already shows
            with ticks, and the list can scroll it off the screen. */}

        {toast && <Toast key={toast.seq} message={toast.msg} duration={2600} />}

        {/* No bar over the browse grid.
            Saving used to raise a "N shortlisted / Review / Clear / Start a
            deal" bar, which put a campaign-shaped action on an act that is not
            one: saving a creator is keeping them, nothing more. Its "Start a
            deal" went to an empty /deals/new, dropping the shortlist it was
            sitting on top of. The count already lives on the Saved tab, and the
            campaign is started from there, where the brand has ticked who is in
            it. See the SELECTION BAR above. */}
      </div>
    </section>
  )
}

/* ── Creator Row (list view) ────────────────────────────────────
   The compact row from "Browse Creators (standalone)": a 24px checkbox, a
   52px round photo, the name with its verified tick, one meta line carrying
   everything the card spreads over four blocks, and the starting rate on the
   right. A selected row takes a 4px neon rail down its left edge.

   The checkbox is the point of this view. Twenty cards is a wall to compare
   against; twenty rows is a list to tick down, which is what putting several
   creators into one campaign actually is. */
function CreatorRow({ creator: c, verifiedFollowers, isPicked, onTogglePick, isSaved, onToggleSave }: {
  creator: BrowseCreator
  verifiedFollowers?: number
  isPicked: boolean
  onTogglePick: (id: string) => void
  isSaved: boolean
  onToggleSave: (id: string, e: React.MouseEvent) => void
}) {
  const router = useRouter()
  const primary = primarySocial(c.social_accounts)
  const followers = verifiedFollowers ?? bestFollowers(c.social_accounts)
  const low = lowestRate(c.rate_card)
  const niches = (c.niches ?? []).filter(Boolean)
  const brands = c.worked_with?.length ?? 0

  /* One line, in the order a brand reads it: what they make, where, how big,
     how proven. Empty parts drop out rather than leaving stray separators. */
  const meta = [
    niches[0],
    primary ? `${primary.handle || c.handle || ''}` : (c.handle || ''),
    followers ? `${formatFollowers(followers)} followers` : '',
    brands > 0 ? `${brands} brand${brands === 1 ? '' : 's'}` : '',
  ].filter(Boolean)

  return (
    <div
      onClick={() => router.push(`/browse/${c.id}`)}
      className="creator-card"
      style={{
        position: 'relative', overflow: 'hidden', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 18,
        borderRadius: 22, background: 'var(--card)',
        border: '1px solid var(--border-hairline)',
        boxShadow: '0 10px 22px -18px rgba(40,45,25,.35)',
        padding: '20px 24px', color: 'var(--ink)',
      }}
    >
      {isPicked && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: 'var(--neon)' }} />}

      <span
        onClick={(e) => { e.stopPropagation(); onTogglePick(c.id) }}
        role="checkbox"
        aria-checked={isPicked}
        aria-label={`Select ${c.full_name}`}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onTogglePick(c.id) } }}
        style={{
          width: 24, height: 24, borderRadius: 7, flexShrink: 0, marginLeft: 6, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1.5px solid ${isPicked ? 'var(--neon-deep)' : 'var(--ink-faint)'}`,
          background: isPicked ? 'var(--neon)' : 'var(--card)',
          color: isPicked ? 'var(--ink)' : 'transparent',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </span>

      <div style={{
        width: 52, height: 52, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
        color: 'var(--ink-soft)',
        background: c.profile_photo_url ? 'none' : 'linear-gradient(150deg, #EEF6FD 0%, #F4F0FF 100%)',
        border: '1px solid var(--frost-edge)',
      }}>
        {c.profile_photo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={c.profile_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : getInitials(c.full_name)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.full_name}</span>
          <svg width="15" height="15" viewBox="0 0 24 24" style={{ flexShrink: 0 }} aria-label="Verified">
            <circle cx="12" cy="12" r="10" fill="var(--neon-deep)" />
            <path d="m7.5 12 2.8 2.8L16.5 8.6" fill="none" stroke="var(--card)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: 'var(--ink-faint)', marginTop: 4, minWidth: 0 }}>
          {primary && <PlatformIcon platform={primary.platform} size={13} />}
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.join(' \u00B7 ')}</span>
        </div>
      </div>

      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, flexShrink: 0, whiteSpace: 'nowrap' }}>
        {low ? `${formatRupees(low)}+` : '-'}
      </div>

      {/* Saving is on the row too. Switching to list to run down a roster is
          exactly when a brand keeps people, and sending them to the grid to do
          it would make the view a downgrade. */}
      <button
        onClick={(e) => onToggleSave(c.id, e)}
        aria-label={isSaved ? `Remove ${c.full_name} from saved` : `Save ${c.full_name}`}
        style={{
          flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: 11,
          background: isSaved ? 'var(--neon)' : 'var(--card)',
          border: `1px solid ${isSaved ? 'var(--neon-deep)' : 'var(--frost-edge)'}`,
          cursor: 'pointer',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill={isSaved ? 'var(--ink)' : 'none'} stroke={isSaved ? 'var(--ink)' : 'var(--ink-faint)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
      </button>
    </div>
  )
}

/* ── Creator Card ──────────────────────────────────────────────── */

/** Two chips and a +N that reveals the rest in place. */
function NicheChips({ niches }: { niches: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const VISIBLE = 2
  const shown = expanded ? niches : niches.slice(0, VISIBLE)
  const hidden = niches.length - shown.length

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
      {shown.map((n) => (
        <span key={n} style={chipStyle}>{n}</span>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          // The card itself navigates, so this has to keep its click.
          onClick={(e) => { e.stopPropagation(); setExpanded(true) }}
          style={{ ...chipStyle, background: 'transparent', cursor: 'pointer', color: 'var(--ink-soft)' }}
        >
          +{hidden} more
        </button>
      )}
    </div>
  )
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center',
  padding: '4px 11px', borderRadius: 'var(--radius-pill)',
  background: 'rgba(232,255,102,.4)', border: '1px solid rgba(210,240,74,.5)',
  fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 500,
  color: 'var(--ink)', whiteSpace: 'nowrap',
}

function CreatorCard({ creator: c, isSaved, onToggleSave, storefrontSlug, verifiedFollowers, hideDealCta, isPicked, onTogglePick }: {
  creator: BrowseCreator
  isSaved: boolean
  onToggleSave: (id: string, e: React.MouseEvent) => void
  storefrontSlug: string | null
  /* Saved view only. A shortlist of six offering six separate deals is the
     opposite of what a brand came to the saved list to do, so the card drops
     the one-creator CTA there and the tick carries the campaign. */
  hideDealCta?: boolean
  isPicked?: boolean
  onTogglePick?: (id: string) => void
  /** From a connected Instagram account, when there is one. */
  verifiedFollowers?: number
}) {
  const primary = primarySocial(c.social_accounts)
  // Verified first. The typed figure is usually absent for a connected creator,
  // which is how a real 535 rendered as 0.
  const followers = verifiedFollowers ?? bestFollowers(c.social_accounts)
  const low = lowestRate(c.rate_card)
  const niches = (c.niches ?? []).filter(Boolean)

  const router = useRouter()

  return (
    <div
      onClick={() => router.push(`/browse/${c.id}`)}
      className="creator-card"
      style={{
        position: 'relative', overflow: 'hidden', cursor: 'pointer', borderRadius: 20,
        border: `1px solid ${isPicked ? 'var(--neon-deep)' : 'var(--frost-edge)'}`,
        background: 'var(--card)',
        boxShadow: '0 20px 46px -34px rgba(40,45,25,.34)',
        display: 'flex', flexDirection: 'column', padding: 20, color: 'var(--ink)',
        textDecoration: 'none',
      }}
    >
      {/* Top: Select + Avatar + Name + Bookmark.
          The tick leads, exactly as it does on a list row, so switching views
          does not move the control a brand is reaching for. "Start deal" stays
          on the card: one creator is still a deal, and the tick is for
          gathering several into a campaign. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {onTogglePick && (
          <span
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePick(c.id) }}
            role="checkbox"
            aria-checked={!!isPicked}
            aria-label={`Select ${c.full_name}`}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onTogglePick(c.id) } }}
            style={{
              width: 22, height: 22, borderRadius: 7, flexShrink: 0, marginTop: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1.5px solid ${isPicked ? 'var(--neon-deep)' : 'var(--ink-faint)'}`,
              background: isPicked ? 'var(--neon)' : 'var(--card)',
              color: isPicked ? 'var(--ink)' : 'transparent',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
        )}
        <div style={{
          width: 46, height: 46, borderRadius: 14, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5,
          color: 'var(--ink-soft)',
          background: c.profile_photo_url ? 'none' : 'linear-gradient(150deg, #EEF6FD 0%, #F4F0FF 100%)',
          border: '1px solid var(--frost-edge)',
          overflow: 'hidden',
        }}>
          {c.profile_photo_url ? (
            <img src={c.profile_photo_url} alt={c.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            getInitials(c.full_name)
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em' }}>{c.full_name}</span>
            {/* Verified badge */}
            <svg width="14" height="14" viewBox="0 0 24 24" style={{ flexShrink: 0 }} aria-label="Verified">
              <circle cx="12" cy="12" r="10" fill="var(--neon-deep)" />
              <path d="m7.5 12 2.8 2.8L16.5 8.6" fill="none" stroke="var(--card)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          {primary && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 600, marginTop: 3 }}>
              <PlatformIcon platform={primary.platform} size={13} />
              <span>{primary.handle || c.handle || ''}</span>
            </div>
          )}
        </div>
        {/* Bookmark */}
        <button
          onClick={(e) => onToggleSave(c.id, e)}
          aria-label="Shortlist creator"
          style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 38, height: 38, borderRadius: 12,
            background: isSaved ? 'var(--neon)' : 'var(--card)',
            border: `1px solid ${isSaved ? 'var(--neon-deep)' : 'var(--frost-edge)'}`,
            cursor: 'pointer',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={isSaved ? 'var(--ink)' : 'none'} stroke={isSaved ? 'var(--ink)' : 'var(--ink-faint)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
        </button>
      </div>

      {/* Niche chips. A storefront can carry several categories and this showed
          only the first, so a creator listing Beauty, Fashion and Travel read as
          "Beauty" alone. Two are shown and the rest sit behind a +N, because six
          chips reflow the card and make the grid ragged. */}
      {niches.length > 0 && (
        <NicheChips niches={niches} />
      )}

      {/* Stats row */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', marginTop: 14,
        padding: '12px 14px',
        borderTop: '1px solid var(--border-hairline)',
        borderBottom: '1px solid var(--border-hairline)',
      }}>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5 }}>{formatFollowers(followers)}</div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--ink-faint)', fontWeight: 600, marginTop: 3 }}>Followers</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5 }}>
            {(c.worked_with?.length ?? 0) > 0 ? `${c.worked_with.length} brands` : '-'}
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--ink-faint)', fontWeight: 600, marginTop: 3 }}>Worked with</div>
        </div>
      </div>

      {/* Starting rate */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 14 }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)' }}>Starting rate</span>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>
          {low ? `${formatRupees(low)}+` : '-'}
        </span>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, position: 'relative', zIndex: 1 }}>
        {storefrontSlug ? (
          <a
            href={`/c/${storefrontSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: '1 1 0%', minWidth: 0, boxSizing: 'border-box',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: 11, borderRadius: 11,
              background: 'var(--card)', border: '1px solid rgba(40,45,25,.18)',
              fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12,
              color: 'var(--ink)', whiteSpace: 'nowrap', textDecoration: 'none',
            }}
          >
            Storefront
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
          </a>
        ) : (
          /* A real link. This was a <span> with nothing but
             stopPropagation on it: it looked like a button, did nothing when
             pressed, and swallowed the click the card itself would have
             handled — so a creator without a published storefront had no way
             through from here at all. /browse/[id] exists and is exactly the
             profile this promises. It stays in the tab, unlike Storefront,
             because it is part of the app rather than the public page. */
          <Link
            href={`/browse/${c.id}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: '1 1 0%', minWidth: 0, boxSizing: 'border-box',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: 11, borderRadius: 11,
              background: 'var(--card)', border: '1px solid rgba(40,45,25,.18)',
              fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12,
              color: 'var(--ink)', whiteSpace: 'nowrap', textDecoration: 'none',
            }}
          >
            View Profile
          </Link>
        )}
        {hideDealCta ? null : (
        <Link
          href={`/deals/new?creator=${c.id}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: '1 1 0%', minWidth: 0, boxSizing: 'border-box',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: 11, borderRadius: 11,
            backgroundColor: 'var(--ink)', border: '1px solid var(--ink)',
            fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12,
            color: '#FFFFFF', whiteSpace: 'nowrap', textDecoration: 'none',
          }}
        >
          Start deal
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
        )}
      </div>
    </div>
  )
}

/* ── Shared select style ─────────────────────────────────────────── */

const selectStyle: React.CSSProperties = {
  minWidth: 0, boxSizing: 'border-box',
  padding: '6px 28px 6px 12px',
  border: '1px solid #D4D4CB', borderRadius: 12,
  backgroundColor: '#fff',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239EA096' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  appearance: 'none' as const,
  WebkitAppearance: 'none' as const,
  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500,
  color: '#5C5E52', outline: 'none',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
