'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import CreatorPoolCard, { PoolSelect } from '@/components/CreatorPoolCard'
import type { BrandPoolCreator } from '@/lib/brand-creator-search'
import { addRosterCreators } from '../../actions'

const FOLLOWER_BANDS = [
  { value: 'all', label: 'Any followers' },
  { value: 'u50', label: 'Under 50K', test: (n: number) => n < 50_000 },
  { value: '50-150', label: '50K–150K', test: (n: number) => n >= 50_000 && n <= 150_000 },
  { value: '150+', label: '150K+', test: (n: number) => n > 150_000 },
] as const

/**
 * The brand's creator pool for its Experience (0557): the Growth pool's layout
 * and card with NO price on it. Adding puts the creator on the roster as the
 * brand's accepted pick; Guapd checks they are free, confirms them and sends
 * the offer. Changing a pick (hold or reject) happens on the roster itself.
 */
export default function BrandPoolClient({ experienceId, title, editable, creatorsPlanned, creators }: {
  experienceId: string
  title: string
  editable: boolean
  creatorsPlanned: number | null
  creators: BrandPoolCreator[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [justAdded, setJustAdded] = useState<string | null>(null)

  const [niche, setNiche] = useState('all')
  const [band, setBand] = useState('all')
  const [location, setLocation] = useState('all')
  const [platform, setPlatform] = useState('all')

  const niches = useMemo(() => Array.from(new Set(creators.flatMap((c) => c.niches))).sort(), [creators])
  const locations = useMemo(() => Array.from(new Set(creators.map((c) => c.location).filter((l): l is string => !!l))).sort(), [creators])

  const shown = useMemo(() => creators.filter((c) => {
    if (niche !== 'all' && !c.niches.includes(niche)) return false
    if (location !== 'all' && c.location !== location) return false
    if (platform !== 'all' && !c.platforms.includes(platform)) return false
    if (band !== 'all') {
      const rule = FOLLOWER_BANDS.find((b) => b.value === band)
      if (!rule || !('test' in rule) || c.followers == null || !rule.test(c.followers)) return false
    }
    return true
  }), [creators, niche, band, location, platform])

  const counted = creators.filter((c) => c.rosterState === 'on' || c.rosterState === 'locked')
  const need = creatorsPlanned ?? 0
  const pct = need > 0 ? Math.min(100, Math.round((counted.length / need) * 100)) : 0
  const progressLabel = need ? `${counted.length} of ${need} on the roster` : `${counted.length} on the roster`
  const floatHint = !need ? 'No plan to count against'
    : counted.length >= need ? (counted.length > need ? `${counted.length - need} over plan` : 'Plan filled')
    : `${need - counted.length} more to go`

  function add(c: BrandPoolCreator) {
    if (busyId || c.rosterState) return
    setError(null); setJustAdded(null)
    setBusyId(c.id)
    startTransition(async () => {
      const r = await addRosterCreators(experienceId, [c.id])
      setBusyId(null)
      if (!r.ok) { setError(r.error); return }
      setJustAdded(`${c.name} is on your roster. Guapd will check they are free on your shoot date and confirm them.`)
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
              Pick the creators you want for this shoot. Each one you add goes on your roster; Guapd checks they are free on your shoot date and confirms them.
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
          <PoolSelect label="Niche" value={niche} onChange={setNiche} options={[{ value: 'all', label: 'All niches' }, ...niches.map((n) => ({ value: n, label: n }))]} />
          <PoolSelect label="Followers" value={band} onChange={setBand} options={FOLLOWER_BANDS.map((b) => ({ value: b.value, label: b.label }))} />
          <PoolSelect label="Location" value={location} onChange={setLocation} options={[{ value: 'all', label: 'All locations' }, ...locations.map((l) => ({ value: l, label: l }))]} />
          <PoolSelect label="Platform" value={platform} onChange={setPlatform} options={[{ value: 'all', label: 'All platforms' }, { value: 'instagram', label: 'Instagram' }, { value: 'youtube', label: 'YouTube' }]} />
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
                  added: 'On your roster',
                  disabled: c.rosterState === 'locked' ? 'Confirmed on your roster' : c.rosterState === 'rejected' ? 'You rejected them' : c.rosterState ? 'On your roster' : 'Roster closed',
                }}
                onToggle={() => add(c)}
              />
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 24px', borderRadius: 24, border: '1px dashed var(--border-hairline, #EAEAE3)', marginTop: 22 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>
              {creators.length === 0 ? 'No bookable creators yet' : 'No creators match those filters'}
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '8px 0 0' }}>
              {creators.length === 0 ? 'No creators are listed yet.' : 'Try widening the niche, follower range or location.'}
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
          <Link href={`/experiences/${experienceId}`} className="inkbtn"
                style={{ flexShrink: 0, height: 42, padding: '0 20px', borderRadius: 999, background: 'var(--ink)', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {counted.length > 0 ? 'Done' : 'Back to the Experience'}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
        </div>
      </div>
    </main>
  )
}
