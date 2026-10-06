import Link from 'next/link'
import StatusChip, { toneDot } from '@/components/StatusChip'
import { experienceStaffGate } from '@/lib/experience-staff-auth'
import NoAccess from './NoAccess'
import { neonBtn } from './ui'
import { listConsoleExperiences, type ConsoleExperienceRow } from '@/lib/experience-console-server'
import { EXPERIENCE_STATUSES, experienceStatus, type ExperienceStatus } from '@/lib/experience-status'

export const dynamic = 'force-dynamic'

/**
 * Guapd Experiences (STAFF console): every Experience across every brand, as a
 * list and a status board. Statuses only; detail screens arrive in later stages.
 *
 * Gated twice: experienceStaffGate (ops admin + operational access) decides
 * whether to render, and the list itself comes from experience_console_list()
 * (0529), which checks the caller's access again in the database. The function
 * returns no price, margin, cost or internal note, so this page cannot leak one.
 *
 * The brand-facing view of a brand's own Experiences will live at /experiences;
 * it is a different face with different scoping and does not use this page.
 */
const LANES = [
  ['all', 'All'],
  ['intake', 'Intake'],
  ['in_flight', 'In flight'],
  ['done', 'Done'],
] as const
type Lane = (typeof LANES)[number][0]

type Row = ConsoleExperienceRow
const BASE = '/experiences-admin'

export default async function ExperiencesPage({ searchParams }: { searchParams: { lane?: string; status?: string } }) {
  const gate = await experienceStaffGate()
  if (!gate.ok) return <NoAccess reason={gate.reason} />

  const list = await listConsoleExperiences()
  const rows = list.ok ? list.rows : []
  const error = list.ok ? null : { message: list.error }
  const lane = (LANES.some(([k]) => k === searchParams.lane) ? searchParams.lane : 'all') as Lane
  const statusFilter = EXPERIENCE_STATUSES.includes(searchParams.status as ExperienceStatus) ? searchParams.status : null

  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1)
  const laneCount = (l: Lane) => l === 'all' ? rows.length : rows.filter((r) => experienceStatus(r.status).lane === l).length
  const shown = rows.filter((r) => statusFilter ? r.status === statusFilter : lane === 'all' || experienceStatus(r.status).lane === lane)

  return (
    <div style={container}>
      {/* ══════ HERO ══════ */}
      <section style={heroCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1 style={h1}>
              Guapd <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, fontSize: '1.05em', letterSpacing: 0 }}>experiences</span>
            </h1>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--wg-600)', margin: '8px 0 0' }}>
              Every done-for-you shoot Guapd runs, across all brands, newest first.
            </p>
          </div>
          <Link href={`${BASE}/new`} className="neonbtn" style={neonBtn}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            New experience
          </Link>
        </div>

        {/* ══════ STATUS BOARD ══════
            One plate, three lanes (the brand deals page's counters plate,
            divided the same way). Each lane: its total, then one line per
            status with its count. Lane header filters by lane, a line by
            status. This is the only place counts appear. */}
        <div className="xp-board" style={boardPlate}>
          {LANES.filter(([k]) => k !== 'all').map(([l, label], i) => {
            const laneActive = !statusFilter && lane === l
            return (
              <div key={l} style={{ ...laneCol, borderLeft: i ? '1px solid var(--hair)' : 'none' }}>
                <Link href={laneActive ? BASE : `${BASE}?lane=${l}`} aria-pressed={laneActive} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <div style={{ ...kpiLabel, color: laneActive ? 'var(--ink)' : 'var(--wg-500)' }}>{label}</div>
                  <div style={kpiValue}>{laneCount(l as Lane)}</div>
                </Link>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {EXPERIENCE_STATUSES.filter((s) => experienceStatus(s).lane === l).map((s) => {
                    const st = experienceStatus(s)
                    const active = statusFilter === s
                    const n = counts.get(s) ?? 0
                    return (
                      <Link key={s} href={active ? BASE : `${BASE}?status=${s}`} aria-pressed={active} className="xp-status"
                        style={{ ...statusLine, background: active ? 'var(--neon)' : undefined }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: toneDot(st.tone) }} />
                        <span style={{ flex: 1, color: n ? 'var(--ink)' : 'var(--wg-500)' }}>{st.label}</span>
                        <span style={{ fontWeight: 600, color: n ? 'var(--ink)' : 'var(--wg-400)', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ══════ LIST ══════ */}
      <section style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <h2 className="sect-head">
              {statusFilter ? experienceStatus(statusFilter).label : lane === 'all' ? 'All Experiences' : LANES.find(([k]) => k === lane)![1]}
              <span style={{ color: 'var(--wg-500)', fontWeight: 500, marginLeft: 8 }}>{shown.length}</span>
            </h2>
            <div className="sect-rule" />
          </div>
          {(statusFilter || lane !== 'all') && (
            <Link href={BASE} style={clearLink}>Show all</Link>
          )}
        </div>

        {error ? (
          <div className="surface" style={{ padding: 24 }}><p className="t-body" style={{ margin: 0 }}>Could not load Experiences: {error.message}</p></div>
        ) : shown.length === 0 ? (
          <div className="surface" style={{ padding: 'clamp(28px, 4vw, 48px)', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20, color: 'var(--ink)' }}>
              {rows.length === 0 ? 'No Experiences yet' : 'Nothing here'}
            </div>
            <p className="t-body" style={{ margin: '6px 0 0' }}>
              {rows.length === 0 ? 'Record a brand request with New experience, and it shows here.' : 'No Experience is in this status right now.'}
            </p>
          </div>
        ) : (
          <div className="surface" style={{ overflow: 'hidden' }}>
            {shown.map((r, i) => <ExperienceRow key={r.id} r={r} first={i === 0} />)}
          </div>
        )}
      </section>

      <style>{`
        .xp-status:hover { background: #F7F7F4; }
        @media (max-width: 640px) {
          .xp-board { grid-template-columns: 1fr !important; }
          .xp-board > div { border-left: none !important; border-top: 1px solid var(--hair); }
          .xp-board > div:first-child { border-top: none; }
          .xp-row { flex-wrap: wrap; }
          .xp-row__chip { order: 3; }
        }
      `}</style>
    </div>
  )
}

function ExperienceRow({ r, first }: { r: Row; first: boolean }) {
  const st = experienceStatus(r.status)
  const brand = r.brand_name
  const videos = r.requested_videos
  const where = r.shoot_city ?? r.request_location
  const when = r.shoot_date ? fmtDate(r.shoot_date)
    : r.request_date_from ? (r.request_date_to && r.request_date_to !== r.request_date_from ? `${fmtDate(r.request_date_from)} – ${fmtDate(r.request_date_to)}` : fmtDate(r.request_date_from))
    : null
  const meta = [brand, where, when, videos ? `${videos} video${videos === 1 ? '' : 's'} asked` : null].filter(Boolean).join(' · ')

  return (
    <Link href={`${BASE}/${r.id}`} className="drow xp-row" style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '18px clamp(18px, 2.4vw, 26px)', borderTop: first ? 'none' : '1px solid var(--hair)', textDecoration: 'none', color: 'inherit' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 15.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--wg-500)', marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {meta || 'No request details yet'}
        </div>
      </div>
      <span className="xp-row__chip"><StatusChip label={st.label} tone={st.tone} width={150} /></span>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--wg-500)', minWidth: 90, textAlign: 'right' }}>{fmtDate(r.created_at.slice(0, 10))}</div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--wg-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m9 18 6-6-6-6" /></svg>
    </Link>
  )
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Styles: transcribed from the brand deals page (app/deals/page.tsx) ──
const container: React.CSSProperties = {
  position: 'relative', zIndex: 1,
  padding: 'clamp(20px, 3vw, 40px) clamp(18px, 4vw, 44px) clamp(56px, 6vw, 90px)',
  maxWidth: 1200, margin: '0 auto', boxSizing: 'content-box',
}
const heroCard: React.CSSProperties = {
  borderRadius: 24, background: 'var(--card)',
  padding: 'clamp(26px, 3vw, 40px) clamp(24px, 3vw, 40px) clamp(28px, 3.4vw, 40px)',
}
const h1: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1,
  fontSize: 'clamp(34px, 4.4vw, 44px)', margin: 0, color: 'var(--ink)',
}
const kpiLabel: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--wg-500)',
}
const kpiValue: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'clamp(34px, 3.6vw, 40px)', lineHeight: 1, letterSpacing: '-0.03em',
  color: 'var(--ink)', fontVariantNumeric: 'tabular-nums lining-nums', marginTop: 14,
}
const boardPlate: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '2fr 3fr 2fr', gap: 0, marginTop: 24,
  borderRadius: 16, background: 'var(--card)', boxShadow: 'var(--sh-2)', overflow: 'hidden',
}
const laneCol: React.CSSProperties = { padding: 'clamp(20px, 2.2vw, 28px)', minWidth: 0 }
const statusLine: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', margin: '0 -10px', borderRadius: 10,
  fontFamily: 'var(--font-ui)', fontSize: 13.5, textDecoration: 'none',
}
const clearLink: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 34, padding: '0 14px', borderRadius: 999,
  border: '1px solid #EAEAE3', background: 'var(--card)', color: 'var(--ink)',
  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, textDecoration: 'none',
}
