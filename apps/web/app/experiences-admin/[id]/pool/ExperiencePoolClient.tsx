'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import CreatorPoolCard, { inr, PoolSelect } from '@/components/CreatorPoolCard'
import { CHANNELS } from '@/lib/experience-request'
import { addToRoster, removeFromRoster } from '../../actions'

export interface ExperiencePoolCreator {
  id: string
  name: string
  handle: string
  photo: string | null
  niches: string[]
  location: string | null
  platforms: string[]
  followers: number | null
  followersLabel: string | null
  verified: boolean
  track: 'growth' | 'deals'
  /** Their shoot day rate (staff-only). null = not set yet. */
  dayRatePaise: number | null
  avgReachLabel: string | null
  engagementLabel: string | null
  interactionsLabel: string | null
  rosterId: string | null
  /** on = on the roster and removable; locked/rejected = on it, not removable here. */
  rosterState: 'on' | 'locked' | 'rejected' | null
}

const FOLLOWER_BANDS = [
  { value: 'all', label: 'Any followers' },
  { value: 'u50', label: 'Under 50K', test: (n: number) => n < 50_000 },
  { value: '50-150', label: '50K–150K', test: (n: number) => n >= 50_000 && n <= 150_000 },
  { value: '150+', label: '150K+', test: (n: number) => n > 150_000 },
] as const

/**
 * The Experience creator pool (staff console): the Growth campaign pool's
 * layout and card, leading on each creator's SHOOT DAY RATE. Adding puts the
 * creator on this Experience's roster (Guapd's pick, or the brand's with the
 * channel it came through); the brand's accept/reject and the lock stay on the
 * roster itself.
 */
export default function ExperiencePoolClient({
  experienceId, title, brandName, editable, creatorsPlanned, videosSold, creators, initialMode, initialChannel,
}: {
  experienceId: string
  title: string
  brandName: string
  editable: boolean
  creatorsPlanned: number | null
  videosSold: number | null
  creators: ExperiencePoolCreator[]
  initialMode: 'guapd' | 'brand'
  initialChannel: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'guapd' | 'brand'>(initialMode)
  const [channel, setChannel] = useState(initialChannel)

  const [niche, setNiche] = useState('all')
  const [band, setBand] = useState('all')
  const [location, setLocation] = useState('all')
  const [platform, setPlatform] = useState('all')
  const [track, setTrack] = useState('all')
  const [rate, setRate] = useState('all')

  const niches = useMemo(() => Array.from(new Set(creators.flatMap((c) => c.niches))).sort(), [creators])
  const locations = useMemo(() => Array.from(new Set(creators.map((c) => c.location).filter((l): l is string => !!l))).sort(), [creators])

  const shown = useMemo(() => creators.filter((c) => {
    if (niche !== 'all' && !c.niches.includes(niche)) return false
    if (location !== 'all' && c.location !== location) return false
    if (platform !== 'all' && !c.platforms.includes(platform)) return false
    if (track !== 'all' && c.track !== track) return false
    if (rate === 'set' && c.dayRatePaise == null) return false
    if (rate === 'unset' && c.dayRatePaise != null) return false
    if (band !== 'all') {
      const rule = FOLLOWER_BANDS.find((b) => b.value === band)
      if (!rule || !('test' in rule) || c.followers == null || !rule.test(c.followers)) return false
    }
    return true
  }), [creators, niche, band, location, platform, track, rate])

  const counted = creators.filter((c) => c.rosterState === 'on' || c.rosterState === 'locked')
  const dayRateTotal = counted.reduce((sum, c) => sum + (c.dayRatePaise ?? 0), 0)
  const missingRate = counted.filter((c) => c.dayRatePaise == null).length
  const need = creatorsPlanned ?? 0
  const pct = need > 0 ? Math.min(100, Math.round((counted.length / need) * 100)) : 0
  const progressLabel = need ? `${counted.length} of ${need} on the roster` : `${counted.length} on the roster`
  const floatHint = !need ? 'No plan to count against'
    : counted.length >= need ? (counted.length > need ? `${counted.length - need} over plan` : 'Plan filled')
    : `${need - counted.length} more to go`

  function toggle(c: ExperiencePoolCreator) {
    if (busyId) return
    setError(null)
    if (!c.rosterId && mode === 'brand' && !channel) { setError('First pick how the brand suggested them.'); return }
    setBusyId(c.id)
    startTransition(async () => {
      let err: string | null = null
      if (c.rosterId && c.rosterState === 'on') {
        const r = await removeFromRoster(experienceId, c.rosterId)
        if (!r.ok) err = r.error
      } else {
        const r = await addToRoster(experienceId, [c.id], mode, mode === 'brand' ? channel : null)
        err = r.error ?? null
      }
      setBusyId(null)
      if (err) setError(err)
      else router.refresh()
    })
  }

  return (
    <main style={{ padding: 'clamp(20px, 3vw, 40px) clamp(18px, 4vw, 44px) clamp(120px,10vw,140px)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* ===== HERO ===== */}
        <div className="surface pool-hero" style={{ padding: 0, overflow: 'hidden', display: 'flex' }}>
          <div style={{ flex: 1, padding: 'clamp(28px,3.2vw,42px) clamp(28px,4vw,42px)', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Link href={`/experiences-admin/${experienceId}`} className="backlink"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', whiteSpace: 'nowrap', textDecoration: 'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              Back to the Experience
            </Link>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em', fontSize: 'clamp(24px,2.8vw,30px)', margin: '18px 0 0' }}>
              Creator pool
            </h1>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-soft)', margin: '9px 0 0', maxWidth: 520, lineHeight: 1.55 }}>
              Add creators to this Experience&rsquo;s roster. Each card shows their <strong>shoot day rate</strong>, what Guapd pays them per shoot day.
              Only the Guapd team sees it; brands never do. The brand&rsquo;s yes or no, and the lock, stay on the roster.
            </p>

            {editable && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
                <span className="mono-label">Adding as</span>
                <div role="radiogroup" aria-label="Who is picking" style={{ display: 'inline-flex', padding: 3, borderRadius: 999, background: 'var(--sec-2, #F4F4EF)' }}>
                  {(['guapd', 'brand'] as const).map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                      style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '7px 14px', fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 700,
                        background: mode === m ? '#FFFFFF' : 'transparent', color: mode === m ? 'var(--ink)' : 'var(--ink-soft)',
                        boxShadow: mode === m ? '0 1px 2px rgba(18,21,28,.08)' : 'none' }}>
                      {m === 'guapd' ? "Guapd's pick" : "Brand's pick"}
                    </button>
                  ))}
                </div>
                {mode === 'brand' && (
                  <select className="selctrl" aria-label="How the brand suggested them" value={channel} onChange={(e) => setChannel(e.target.value)}
                    style={{ padding: '8px 26px 8px 9px', border: '1px solid var(--border-edge, rgba(24,28,36,.14))', borderRadius: 10, background: '#FFFFFF', fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-soft)' }}>
                    <option value="">Suggested via…</option>
                    {CHANNELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                )}
              </div>
            )}
          </div>

          <div className="pool-hero__side" style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--border-hairline, #EAEAE3)', padding: 36, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
            <div>
              <span className="mono-label">Adding to</span>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, marginTop: 5 }}>{title}</div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2 }}>{brandName}{videosSold != null ? ` · ${videosSold} videos sold` : ''}</div>
            </div>
            <div>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{progressLabel}</span>
              <div style={{ marginTop: 8, height: 7, borderRadius: 999, background: 'rgba(24,28,36,.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 999, width: `${pct}%`, background: 'var(--neon-deep, #D2F04A)', transition: 'width .3s ease' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span className="mono-label">Day rates, combined</span>
              <span style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontWeight: 700, fontSize: 15 }}>{inr(dayRateTotal)}<span style={{ fontSize: 11, color: 'var(--ink-faint)', fontWeight: 600 }}>/day</span></span>
            </div>
            {missingRate > 0 && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: '#8C6417' }}>{missingRate} on the roster with no day rate yet</div>}
          </div>
        </div>

        {/* ===== FILTERS ===== */}
        <div className="filterbar surface" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22, padding: '22px 26px', flexWrap: 'wrap' }}>
          <PoolSelect label="Niche" value={niche} onChange={setNiche} options={[{ value: 'all', label: 'All niches' }, ...niches.map((n) => ({ value: n, label: n }))]} />
          <PoolSelect label="Followers" value={band} onChange={setBand} options={FOLLOWER_BANDS.map((b) => ({ value: b.value, label: b.label }))} />
          <PoolSelect label="Location" value={location} onChange={setLocation} options={[{ value: 'all', label: 'All locations' }, ...locations.map((l) => ({ value: l, label: l }))]} />
          <PoolSelect label="Platform" value={platform} onChange={setPlatform} options={[{ value: 'all', label: 'All platforms' }, { value: 'instagram', label: 'Instagram' }, { value: 'youtube', label: 'YouTube' }]} />
          <PoolSelect label="Track" value={track} onChange={setTrack} options={[{ value: 'all', label: 'Growth and Deals' }, { value: 'growth', label: 'Growth (30%)' }, { value: 'deals', label: 'Deals (15%)' }]} />
          <PoolSelect label="Shoot day rate" value={rate} onChange={setRate} options={[{ value: 'all', label: 'Any day rate' }, { value: 'set', label: 'Day rate set' }, { value: 'unset', label: 'No day rate yet' }]} />
        </div>

        {!editable && (
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)', marginTop: 14 }}>
            Creators are added once the brand&rsquo;s price is agreed, and before the shoot is scheduled. This Experience is not at that stage.
          </p>
        )}
        {error && <p role="alert" style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: '#9B3030', marginTop: 14 }}>{error}</p>}

        {/* ===== GRID ===== */}
        {shown.length > 0 ? (
          <div className="cardgrid" style={{ marginTop: 22 }}>
            {shown.map((c) => {
              const fixed = c.rosterState === 'locked' || c.rosterState === 'rejected'
              return (
                <CreatorPoolCard
                  key={c.id}
                  c={c}
                  added={!!c.rosterId}
                  busy={busyId === c.id}
                  disabled={!editable || fixed}
                  rate={{ paise: c.dayRatePaise, label: c.dayRatePaise != null ? 'per shoot day' : 'no shoot day rate yet' }}
                  meta={[c.track === 'growth' ? 'Growth · 30%' : 'Deals · 15%', c.location].filter(Boolean).join(' · ')}
                  button={{
                    add: mode === 'brand' ? "Add as the brand's pick" : 'Add to the roster',
                    added: 'On the roster · remove',
                    disabled: c.rosterState === 'locked' ? 'Locked on the roster' : c.rosterState === 'rejected' ? 'The brand rejected them' : 'Roster closed',
                  }}
                  onToggle={() => toggle(c)}
                />
              )
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 24px', borderRadius: 24, border: '1px dashed var(--border-hairline, #EAEAE3)', marginTop: 22 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>
              {creators.length === 0 ? 'No bookable creators yet' : 'No creators match those filters'}
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '8px 0 0' }}>
              {creators.length === 0 ? 'Creators show up here once they are vetted.' : 'Try widening the niche, follower range or day rate.'}
            </p>
          </div>
        )}

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
          <Link href={`/experiences-admin/${experienceId}`} className="inkbtn"
                style={{ flexShrink: 0, height: 42, padding: '0 20px', borderRadius: 999, background: 'var(--ink)', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {counted.length > 0 ? 'Done adding' : 'Back to the Experience'}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
        </div>
      </div>
    </main>
  )
}
