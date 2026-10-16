'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import ListPager from '@/components/ListPager'
import { POOL_PAGE_SIZE } from '@/lib/list-page'
import CreatorPoolCard, { PoolSelect } from '@/components/CreatorPoolCard'
import type { BrandPoolCreator, BrandPoolFilters } from '@/lib/brand-creator-search'
import { addRosterCreators } from '../../actions'

const FOLLOWER_BANDS = [
  { value: 'all', label: 'Any followers' },
  { value: 'u50', label: 'Under 50K', test: (n: number) => n < 50_000 },
  { value: '50-150', label: '50K–150K', test: (n: number) => n >= 50_000 && n <= 150_000 },
  { value: '150+', label: '150K+', test: (n: number) => n > 150_000 },
] as const

/**
 * The brand's creator pool for its Experience (0557): the Growth pool's layout
 * and card with NO price on it. Adding shares the creator with Guapd as the
 * brand's pick, still to review (0559); the brand accepts, holds or rejects it
 * on the roster itself. Guapd checks they are free, confirms and sends the offer.
 */
export default function BrandPoolClient({ experienceId, title, editable, creatorsPlanned, creators, filters, page, total, niches, locations, acceptedCount, toReviewCount }: {
  experienceId: string
  title: string
  editable: boolean
  creatorsPlanned: number | null
  /** 0570: this page of the searched, filtered pool (the server does the work). */
  creators: BrandPoolCreator[]
  filters: BrandPoolFilters
  page: number
  total: number
  niches: string[]
  locations: string[]
  acceptedCount: number
  toReviewCount: number
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [justAdded, setJustAdded] = useState<string | null>(null)

  const pathname = usePathname()
  const params = useSearchParams()
  const go = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params?.toString() ?? '')
    for (const [k, v] of Object.entries(next)) { if (v && v !== 'all') sp.set(k, v); else sp.delete(k) }
    sp.delete('page')
    startTransition(() => router.push(`${pathname}?${sp.toString()}`, { scroll: false }))
  }
  const hrefFor = (n: number) => {
    const sp = new URLSearchParams(params?.toString() ?? '')
    if (n > 1) sp.set('page', String(n)); else sp.delete('page')
    return `${pathname}?${sp.toString()}`
  }
  const [q, setQ] = useState(filters.q ?? '')
  useEffect(() => {
    if ((filters.q ?? '') === q.trim()) return
    const t = setTimeout(() => go({ q: q.trim() || null }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])
  const shown = creators
  const filtered = !!(filters.q || filters.niche || filters.location || filters.platform || filters.band)

  // 0559: an added creator is a pick to review, not an acceptance; only accepted (and confirmed) ones fill the plan.
  const accepted = acceptedCount
  const toReview = toReviewCount
  const need = creatorsPlanned ?? 0
  const pct = need > 0 ? Math.min(100, Math.round((accepted / need) * 100)) : 0
  const progressLabel = (need ? `${accepted} of ${need} accepted` : `${accepted} accepted`) + (toReview ? ` · ${toReview} to review` : '')
  const floatHint = !need ? 'No plan to count against'
    : accepted >= need ? (accepted > need ? `${accepted - need} over plan` : 'Plan filled')
    : `${need - accepted} more to go`

  function add(c: BrandPoolCreator) {
    if (busyId || c.rosterState) return
    setError(null); setJustAdded(null)
    setBusyId(c.id)
    startTransition(async () => {
      const r = await addRosterCreators(experienceId, [c.id])
      setBusyId(null)
      if (!r.ok) { setError(r.error); return }
      setJustAdded(`${c.name} added and shared with Guapd. Add more, then accept the ones you want on your roster.`)
      router.refresh()
    })
  }

  return (
    <main style={{ padding: 'clamp(20px, 3vw, 40px) clamp(18px, 4vw, 44px) clamp(120px,10vw,140px)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* ===== HERO ===== */}
        <div className="surface pool-hero" style={{ padding: 0, overflow: 'hidden', display: 'flex' }}>
          <div style={{ flex: 1, padding: 'clamp(28px,3.2vw,42px) clamp(28px,4vw,42px)', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Link href={`/experiences/${experienceId}`} className="backlink"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', whiteSpace: 'nowrap', textDecoration: 'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              Back to the Experience
            </Link>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em', fontSize: 'clamp(24px,2.8vw,30px)', margin: '18px 0 0' }}>
              Add creators
            </h1>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-soft)', margin: '9px 0 0', maxWidth: 520, lineHeight: 1.55 }}>
              Add the creators you like; Guapd sees them straight away. Then accept the ones you want on your Experience page. Guapd checks they are free on your shoot date and confirms them.
              Someone you want isn&rsquo;t here? <Link href={`/experiences/${experienceId}#bx-creators`} style={{ color: 'var(--ink)', fontWeight: 700 }}>Suggest them to Guapd</Link>.
            </p>

          </div>

          <div className="pool-hero__side" style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--border-hairline, #EAEAE3)', padding: 36, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
            <div>
              <span className="mono-label">Adding to</span>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, marginTop: 5 }}>{title}</div>
            </div>
            <div>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{progressLabel}</span>
              <div style={{ marginTop: 8, height: 7, borderRadius: 999, background: 'rgba(24,28,36,.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 999, width: `${pct}%`, background: 'var(--neon-deep, #D2F04A)', transition: 'width .3s ease' }} />
              </div>
            </div>
          </div>
        </div>

        {/* ===== FILTERS ===== */}
        <div className="filterbar surface" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22, padding: '22px 26px', flexWrap: 'wrap' }}>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or @handle" aria-label="Search creators by name or handle" maxLength={100}
            style={{ minWidth: 0, boxSizing: 'border-box', padding: '8px 9px', flex: '2 1 220px', border: '1px solid var(--border-edge, rgba(24,28,36,.14))', borderRadius: 10, background: '#FFFFFF', fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', outline: 'none' }} />
          <PoolSelect label="Niche" value={filters.niche ?? 'all'} onChange={(v) => go({ niche: v })} options={[{ value: 'all', label: 'All niches' }, ...niches.map((n) => ({ value: n, label: n }))]} />
          <PoolSelect label="Followers" value={filters.band ?? 'all'} onChange={(v) => go({ band: v })} options={FOLLOWER_BANDS.map((b) => ({ value: b.value, label: b.label }))} />
          <PoolSelect label="Location" value={filters.location ?? 'all'} onChange={(v) => go({ location: v })} options={[{ value: 'all', label: 'All locations' }, ...locations.map((l) => ({ value: l, label: l }))]} />
          <PoolSelect label="Platform" value={filters.platform ?? 'all'} onChange={(v) => go({ platform: v })} options={[{ value: 'all', label: 'All platforms' }, { value: 'instagram', label: 'Instagram' }, { value: 'youtube', label: 'YouTube' }]} />
        </div>

        {!editable && (
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)', marginTop: 14 }}>
            Creators can be added once the price is agreed, until the shoot is scheduled. This Experience is not at that stage.
          </p>
        )}
        {error && <p role="alert" style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: '#9B3030', marginTop: 14 }}>{error}</p>}
        {justAdded && <p role="status" style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: '#3F6212', marginTop: 14 }}>{justAdded}</p>}

        {/* ===== GRID ===== */}
        {shown.length > 0 ? (
          <div className="cardgrid" style={{ marginTop: 22 }}>
            {shown.map((c) => (
              <CreatorPoolCard
                key={c.id}
                c={c}
                added={!!c.rosterState}
                busy={busyId === c.id}
                disabled={!editable || c.rosterState === 'locked' || c.rosterState === 'rejected'}
                meta={c.location}
                button={{
                  add: 'Add to my roster',
                  added: c.rosterState === 'accepted' ? 'Accepted' : c.rosterState === 'on_hold' ? 'On hold' : 'Added · to review',
                  disabled: c.rosterState === 'locked' ? 'Confirmed on your roster' : c.rosterState === 'rejected' ? 'You rejected them'
                    : c.rosterState === 'accepted' ? 'Accepted' : c.rosterState === 'on_hold' ? 'On hold' : c.rosterState ? 'Added · to review' : 'Roster closed',
                }}
                onToggle={() => add(c)}
              />
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 24px', borderRadius: 24, border: '1px dashed var(--border-hairline, #EAEAE3)', marginTop: 22 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>
              {!filtered && total === 0 ? 'No bookable creators yet' : 'No creators match that search'}
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '8px 0 0' }}>
              {!filtered && total === 0 ? 'No creators are listed yet.' : 'Try another name, or widen the niche, follower range or location.'}
            </p>
          </div>
        )}

        <ListPager page={page} total={total} noun="creator" pageSize={POOL_PAGE_SIZE} hrefFor={hrefFor} style={{ marginBottom: 96 }} />
      </div>

      {/* ===== STICKY BAR ===== */}
      <div style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 40, width: 'min(560px, calc(100% - 32px))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 10px 10px 20px', borderRadius: 999, background: '#FFFFFF', border: '1px solid var(--border-hairline, #EAEAE3)', boxShadow: '0 2px 4px rgba(18,21,28,.04), 0 18px 40px -12px rgba(18,21,28,.28)' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{progressLabel}</span>
              <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{floatHint}</span>
            </div>
            <div style={{ height: 5, borderRadius: 999, background: 'rgba(24,28,36,.08)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 999, width: `${pct}%`, background: 'var(--neon-deep, #D2F04A)', transition: 'width .35s cubic-bezier(.22,1,.36,1)' }} />
            </div>
          </div>
          <Link href={`/experiences/${experienceId}`} className="inkbtn"
                style={{ flexShrink: 0, height: 42, padding: '0 20px', borderRadius: 999, background: 'var(--ink)', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {accepted + toReview > 0 ? 'Review on your roster' : 'Back to the Experience'}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
        </div>
      </div>
    </main>
  )
}
