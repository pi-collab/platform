'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { addCreatorsToCampaign, removeCampaignDraft } from '../draft-actions'

export interface PoolCreator {
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
  ratePaise: number | null
  avgReachLabel: string | null
  engagementLabel: string | null
  interactionsLabel: string | null
  added: boolean
  draftId: string | null
  sellsUniformType: boolean
}

const inr = (paise: number) => '₹' + Math.round(paise / 100).toLocaleString('en-IN')

/* The design's own filter sets. Follower bands and locations are fixed lists
   rather than derived from the roster: a band that appears only once someone
   fits it makes the filter bar change shape as creators are onboarded. */
const FOLLOWER_BANDS = [
  { value: 'all', label: 'Any followers' },
  { value: 'u50', label: 'Under 50K', test: (n: number) => n < 50_000 },
  { value: '50-150', label: '50K–150K', test: (n: number) => n >= 50_000 && n <= 150_000 },
  { value: '150+', label: '150K+', test: (n: number) => n > 150_000 },
] as const

export default function GrowthPoolClient({
  campaignId, campaignName, uniformType, creators, minimum, minimumMet,
}: {
  campaignId: string
  campaignName: string
  uniformType: string | null
  creators: PoolCreator[]
  minimum: { metric: 'creators' | 'value'; minCreators: number | null; minValuePaise: number | null }
  minimumMet: boolean
  brandId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [niche, setNiche] = useState('all')
  const [band, setBand] = useState<string>('all')
  const [location, setLocation] = useState('all')
  const [platform, setPlatform] = useState('all')

  /* Built from the roster, so a niche nobody has never appears as a filter
     that can only ever return nothing. */
  const niches = useMemo(
    () => Array.from(new Set(creators.flatMap((c) => c.niches))).sort(),
    [creators],
  )
  const locations = useMemo(
    () => Array.from(new Set(creators.map((c) => c.location).filter((l): l is string => !!l))).sort(),
    [creators],
  )

  const shown = useMemo(() => creators.filter((c) => {
    if (niche !== 'all' && !c.niches.includes(niche)) return false
    if (location !== 'all' && c.location !== location) return false
    if (platform !== 'all' && !c.platforms.includes(platform)) return false
    if (band !== 'all') {
      const rule = FOLLOWER_BANDS.find((b) => b.value === band)
      /* A creator with no follower count is excluded from every band rather
         than quietly counted in one. We do not know where they belong. */
      if (!rule || !('test' in rule) || c.followers == null || !rule.test(c.followers)) return false
    }
    return true
  }), [creators, niche, band, location, platform])

  const added = creators.filter((c) => c.added)
  const addedTotal = added.reduce((sum, c) => sum + (c.ratePaise ?? 0), 0)

  const need = minimum.metric === 'value' ? (minimum.minValuePaise ?? 0) : (minimum.minCreators ?? 0)
  const have = minimum.metric === 'value' ? addedTotal : added.length
  const pct = need > 0 ? Math.min(100, Math.round((have / need) * 100)) : 100
  const progressLabel = minimum.metric === 'value'
    ? `${inr(addedTotal)} of ${inr(need)}`
    : `${added.length} of ${need} added`
  const floatHint = minimumMet
    ? 'Minimum met'
    : minimum.metric === 'value'
      ? `${inr(Math.max(0, need - addedTotal))} to go`
      : `${Math.max(0, need - added.length)} more to go`

  function toggle(c: PoolCreator) {
    setError(null)
    setBusyId(c.id)
    startTransition(async () => {
      const res = c.added && c.draftId
        ? await removeCampaignDraft(c.draftId, campaignId)
        : await addCreatorsToCampaign(campaignId, [c.id])
      setBusyId(null)
      if (res && 'error' in res && res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <main style={{ padding: 'clamp(18px,2.4vw,30px) clamp(22px,4vw,56px) clamp(120px,10vw,140px)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* ===== HERO ===== */}
        <div className="surface pool-hero" style={{ padding: 0, overflow: 'hidden', display: 'flex' }}>
          <div style={{ flex: 1, padding: 'clamp(28px,3.2vw,42px) clamp(28px,4vw,42px)', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Link href={`/campaigns/${campaignId}`} className="backlink"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', whiteSpace: 'nowrap', textDecoration: 'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              Back to campaign
            </Link>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em', fontSize: 'clamp(24px,2.8vw,30px)', margin: '18px 0 0' }}>
              Growth creator pool
            </h1>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-soft)', margin: '9px 0 0', maxWidth: 480, lineHeight: 1.55 }}>
              Add creators straight into this campaign. There&rsquo;s no separate offer step.
              {uniformType && <> Everyone delivers <strong>{uniformType}</strong>, at their own rate.</>}
            </p>
          </div>

          <div className="pool-hero__side" style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--border-hairline, #EAEAE3)', padding: 36, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
            <div>
              <span className="mono-label">Adding to</span>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, marginTop: 5 }}>{campaignName}</div>
            </div>
            <div>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{progressLabel}</span>
              <div style={{ marginTop: 8, height: 7, borderRadius: 999, background: 'rgba(24,28,36,.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 999, width: `${pct}%`, background: minimumMet ? '#1F9D6B' : 'var(--neon-deep, #D2F04A)', transition: 'width .3s ease' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span className="mono-label">Combined rate</span>
              <span style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontWeight: 700, fontSize: 15 }}>{inr(addedTotal)}</span>
            </div>
          </div>
        </div>

        {/* ===== FILTERS ===== */}
        <div className="filterbar surface" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22, padding: '22px 26px', flexWrap: 'wrap' }}>
          <Select value={niche} onChange={setNiche} options={[{ value: 'all', label: 'All niches' }, ...niches.map((n) => ({ value: n, label: n }))]} />
          <Select value={band} onChange={setBand} options={FOLLOWER_BANDS.map((b) => ({ value: b.value, label: b.label }))} />
          <Select value={location} onChange={setLocation} options={[{ value: 'all', label: 'All locations' }, ...locations.map((l) => ({ value: l, label: l }))]} />
          <Select value={platform} onChange={setPlatform} options={[{ value: 'all', label: 'All platforms' }, { value: 'instagram', label: 'Instagram' }, { value: 'youtube', label: 'YouTube' }]} />
        </div>

        {error && (
          <p role="alert" style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: '#9B3030', marginTop: 14 }}>{error}</p>
        )}

        {/* ===== GRID ===== */}
        {shown.length > 0 ? (
          <div className="cardgrid" style={{ marginTop: 22 }}>
            {shown.map((c) => (
              <Card key={c.id} c={c} busy={busyId === c.id || pending} uniformType={uniformType} onToggle={() => toggle(c)} />
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 24px', borderRadius: 24, border: '1px dashed var(--border-hairline, #EAEAE3)', marginTop: 22 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>
              {creators.length === 0 ? 'No Growth creators yet' : 'No creators match those filters'}
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '8px 0 0' }}>
              {creators.length === 0
                ? 'Once creators are vetted onto the Growth track they show up here.'
                : 'Try widening your niche or follower range.'}
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
              <span style={{ fontSize: 11.5, color: minimumMet ? '#1F8A5B' : 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{floatHint}</span>
            </div>
            <div style={{ height: 5, borderRadius: 999, background: 'rgba(24,28,36,.08)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 999, width: `${pct}%`, background: minimumMet ? '#1F9D6B' : 'var(--neon-deep, #D2F04A)', transition: 'width .35s cubic-bezier(.22,1,.36,1), background .2s ease' }} />
            </div>
          </div>
          <Link href={`/campaigns/${campaignId}`} className="inkbtn"
                style={{ flexShrink: 0, height: 42, padding: '0 20px', borderRadius: 999, background: 'var(--ink)', color: '#fff', display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
            Back to campaign
          </Link>
        </div>
      </div>
    </main>
  )
}

function Card({ c, busy, uniformType, onToggle }: {
  c: PoolCreator; busy: boolean; uniformType: string | null; onToggle: () => void
}) {
  const initials = c.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  /* A creator who does not sell this campaign's deliverable cannot be added,
     and is told rather than silently filtered away — a brand who deliberately
     looked for them would otherwise think they had left the roster. */
  const blocked = !c.sellsUniformType

  return (
    <div className="ccard surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ position: 'relative', width: 104, height: 104, flexShrink: 0, borderRadius: 14, background: 'var(--sec-2, #F7F4FB)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {c.photo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={c.photo} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: 'var(--ink-soft)' }}>{initials || '?'}</span>}
          {c.added && (
            <span style={{ position: 'absolute', bottom: 6, left: 6, display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-ui)', fontSize: 9.5, fontWeight: 700, color: '#fff', background: 'rgba(24,28,36,.72)', borderRadius: 999, padding: '3px 8px' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              Added
            </span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
            {/* Only a live Instagram connection earns this, the same rule the
                storefront follows. */}
            {c.verified && (
              <svg width="12" height="12" viewBox="0 0 24 24" style={{ flexShrink: 0 }} aria-label="Verified from Instagram">
                <circle cx="12" cy="12" r="10" fill="var(--neon-deep, #D2F04A)" />
                <path d="m7.5 12 2.8 2.8L16.5 8.6" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.handle}{c.followersLabel ? ` · ${c.followersLabel}` : ''}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 4, lineHeight: 1.4 }}>
            {c.niches.join(' · ') || '—'}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 'auto', paddingTop: 8 }}>
            <span style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
              {c.ratePaise != null ? inr(c.ratePaise) : '—'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
              {uniformType && c.ratePaise != null ? `${uniformType.toLowerCase()} rate` : 'rate'}
            </span>
          </div>
        </div>
      </div>

      {/* Three figures, and a dash where there is no measurement. A blank would
          read as zero, and a guess would read as verified. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', padding: '12px 0', borderTop: '1px solid var(--border-hairline, #EAEAE3)', borderBottom: '1px solid var(--border-hairline, #EAEAE3)' }}>
        <Stat value={c.avgReachLabel} label="Avg reach" />
        <Stat value={c.engagementLabel} label="Engagement" divided />
        <Stat value={c.interactionsLabel} label="Interactions" divided />
      </div>

      <button
        type="button"
        onClick={onToggle}
        disabled={busy || blocked}
        className={c.added ? 'inkbtn' : 'addedbtn'}
        title={blocked && uniformType ? `Doesn't offer ${uniformType}` : undefined}
        style={{
          width: '100%', height: 38, borderRadius: 10, cursor: busy || blocked ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: c.added ? 'var(--ink)' : '#FFFFFF',
          color: c.added ? '#FFFFFF' : 'var(--ink)',
          border: c.added ? 'none' : '1.5px solid var(--border-hairline, #EAEAE3)',
          opacity: blocked ? 0.45 : 1,
        }}
      >
        {busy ? 'Working…' : blocked && uniformType ? `No ${uniformType}` : c.added ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            Added &middot; remove
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            Add to campaign
          </>
        )}
      </button>
    </div>
  )
}

function Stat({ value, label, divided }: { value: string | null; label: string; divided?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, ...(divided ? { paddingLeft: 12, borderLeft: '1px solid var(--border-hairline, #EAEAE3)' } : {}) }}>
      <span style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontWeight: 700, fontSize: 15, color: value ? 'var(--ink)' : 'var(--ink-faint)' }}>
        {value ?? '—'}
      </span>
      <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{label}</span>
    </div>
  )
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <select
      className="selctrl"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        minWidth: 0, boxSizing: 'border-box', padding: '8px 26px 8px 9px', flex: '1.5 1 180px',
        border: '1px solid var(--border-edge, rgba(24,28,36,.14))', borderRadius: 10, background: '#FFFFFF',
        fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-soft)',
      }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
