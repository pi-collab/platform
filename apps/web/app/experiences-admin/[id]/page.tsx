import Link from 'next/link'
import { notFound } from 'next/navigation'
import StatusChip from '@/components/StatusChip'
import StepperTimeline from '@/components/StepperTimeline'
import { experienceStaffGate } from '@/lib/experience-staff-auth'
import { getConsoleExperience, getConsoleReconcile, getCreatorBrief, getLegsReconcile, listConsoleLegs, listConsoleQuotes, listConsoleRoster } from '@/lib/experience-console-server'
import { EXPERIENCE_STATUSES, experienceStatus } from '@/lib/experience-status'
import { channelLabel, countOf, formatRupees } from '@/lib/experience-request'
import NoAccess from '../NoAccess'
import QuotePanel from './QuotePanel'
import RosterPanel from './RosterPanel'
import CreatorLegsPanel from './CreatorLegsPanel'
import { card, container, fieldLabel, h1, heroCard, kpiLabel, lede } from '../ui'

export const dynamic = 'force-dynamic'

/**
 * One Experience in the STAFF console: the request, where it is, and the quote
 * negotiation with the brand.
 *
 * Gated by experienceStaffGate, and every read is a database function that
 * checks operational access again (experience_console_get / _quotes, 0530).
 * Shows what the brand asked for and the price agreed with the brand, and,
 * from Confirmed, each creator's deal (Leg 2): their day rate, days and what
 * Guapd will pay them (operational access, experience_console_legs, 0534).
 * Never the margin or P&L: that is financial access only (experience_pnl).
 */
/* The stages shown in the stepper (draft and cancelled are not stages). */
const STAGES = EXPERIENCE_STATUSES.filter((s) => s !== 'draft' && s !== 'cancelled')

export default async function ExperienceDetailPage({ params }: { params: { id: string } }) {
  const gate = await experienceStaffGate()
  if (!gate.ok) return <NoAccess reason={gate.reason} />
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound()

  const [exp, quotes] = await Promise.all([getConsoleExperience(params.id), listConsoleQuotes(params.id)])
  if (!exp.ok) return <Failed message={exp.error} />
  if (!exp.data) notFound()
  const e = exp.data
  // The roster exists once the price is agreed (Building roster onward).
  const hasRoster = !['draft', 'requested', 'cancelled'].includes(e.status)
  const rosterEditable = e.status === 'rostering' || e.status === 'confirmed'
  const [roster, reconcile] = hasRoster
    ? await Promise.all([listConsoleRoster(e.id), getConsoleReconcile(e.id)])
    : [null, null]
  // Creator deals exist once the roster is locked (Confirmed onward).
  const hasLegs = !['draft', 'requested', 'rostering', 'cancelled'].includes(e.status)
  const [legs, legsReconcile, creatorBrief] = hasLegs
    ? await Promise.all([listConsoleLegs(e.id), getLegsReconcile(e.id), getCreatorBrief(e.id)])
    : [null, null, null]
  const st = experienceStatus(e.status)
  const stepIndex = Math.max(0, STAGES.indexOf(e.status as (typeof STAGES)[number]))
  const qs = quotes.ok ? quotes.data : []
  const openQuote = qs.find((q) => q.status === 'open')
  const acceptedQuote = qs.find((q) => q.status === 'accepted')
  const nextLabel =
    e.status === 'requested'
      ? !openQuote ? 'Next: send the brand a quote'
        : openQuote.proposed_by === 'guapd' ? 'Waiting on the brand to reply to the quote'
        : "Next: answer the brand's counter"
    : e.status === 'rostering' ? 'Next: build the creator roster, get the brand to approve it, and lock it'
    : e.status === 'confirmed' ? 'Next: send each creator their deal'
    : e.status === 'complete' ? 'Complete'
    : `Next: ${experienceStatus(STAGES[stepIndex + 1] ?? e.status).label.toLowerCase()}`
  const stepDates: Record<number, string> = {}
  if (e.requested_at) stepDates[0] = e.requested_at
  if (acceptedQuote?.decided_at) stepDates[1] = acceptedQuote.decided_at
  const creators = e.request_creator_count ?? 1
  const per = (n: number | null) => n == null ? 'all' : String(n)
  const rights = [
    e.request_affiliate && `Affiliate on ${per(e.request_affiliate_per_creator)} of each creator's videos`,
    e.request_ad_rights && `Ad rights on ${per(e.request_ad_rights_per_creator)}${e.request_ad_rights_months ? `, ${e.request_ad_rights_months} months` : ''}`,
    e.request_boost && `Boost on ${per(e.request_boost_per_creator)}${e.request_boost_months ? `, ${e.request_boost_months} months` : ''}`,
  ].filter(Boolean) as string[]
  const agreed = e.status !== 'requested' && e.status !== 'draft' && e.brand_per_video_paise != null

  return (
    <div style={container}>
      <Link href="/experiences-admin" style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--wg-600)', textDecoration: 'none' }}>← All Experiences</Link>

      {/* ══════ HERO ══════ */}
      <section style={{ ...heroCard, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={kpiLabel}>{e.brand_name}</div>
            <h1 style={{ ...h1, marginTop: 10, fontSize: 'clamp(28px, 3.6vw, 38px)' }}>{e.title}</h1>
            <p style={lede}>
              Request {e.request_channel ? `via ${channelLabel(e.request_channel)}` : 'recorded'}
              {e.requested_at ? `, ${fmtDate(e.requested_at.slice(0, 10))}` : ''}
            </p>
          </div>
          <StatusChip label={st.label} tone={st.tone} />
        </div>

        {e.status === 'cancelled' && <p className="t-body" style={{ margin: '12px 0 0' }}>This Experience was cancelled.</p>}
      </section>

      {/* ══════ STAGE: the deal page's stepper, with this Experience's stages ══════ */}
      {e.status !== 'cancelled' && (
        <div style={{ marginTop: 20 }}>
          <StepperTimeline steps={STAGES.map((x) => experienceStatus(x).label)} currentStepIndex={stepIndex} nextLabel={nextLabel} dates={stepDates} />
        </div>
      )}

      {/* ══════ ROSTER: the main action once the price is agreed ══════ */}
      {hasRoster && (
        <div style={{ marginTop: 20 }}>
          {roster?.ok && reconcile?.ok
            ? <RosterPanel experienceId={e.id} editable={rosterEditable} roster={roster.data} reconcile={reconcile.data} />
            : <Failed inline message={(roster && !roster.ok && roster.error) || (reconcile && !reconcile.ok && reconcile.error) || 'Could not load the roster'} />}
        </div>
      )}

      {/* ══════ CREATOR DEALS: the main action once the roster is locked ══════ */}
      {hasLegs && (
        <div style={{ marginTop: 20 }}>
          {legs?.ok && legsReconcile?.ok && creatorBrief?.ok
            ? <CreatorLegsPanel experienceId={e.id} editable={e.status === 'confirmed'} legs={legs.data} reconcile={legsReconcile.data}
                brief={creatorBrief.data} affiliateSold={e.request_affiliate && (e.request_affiliate_per_creator ?? 0) > 0} />
            : <Failed inline message={(legs && !legs.ok && legs.error) || (legsReconcile && !legsReconcile.ok && legsReconcile.error) || (creatorBrief && !creatorBrief.ok && creatorBrief.error) || 'Could not load the creator deals'} />}
        </div>
      )}

      {/* ══════ QUOTES: the main action while the price is open ══════ */}
      <div style={{ marginTop: 20 }}>
        {quotes.ok ? (
          <QuotePanel
            experienceId={e.id}
            open={e.status === 'requested'}
            quotes={quotes.data}
            requested={e.request_deliverables ?? []}
            defaults={{ count: e.plan_videos_total, city: e.request_location ?? '', date: e.request_date_from ?? '' }}
            planVideos={e.plan_videos_total}
            planLabel={`${creators} creator${creators === 1 ? '' : 's'} × ${e.plan_videos_per_creator} video${e.plan_videos_per_creator === 1 ? '' : 's'}`}
          />
        ) : <Failed message={quotes.error} inline />}
      </div>


      <div className="xp-cols" style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20, marginTop: 20, alignItems: 'start' }}>
        {/* ══════ THE REQUEST ══════ */}
        <section className="surface" style={card}>
          <h2 className="sect-head">What the brand asked for</h2>
          <div className="sect-rule" />
          <dl style={{ display: 'grid', gap: 16, margin: '18px 0 0' }}>
            <Row label="Creators">{e.request_creator_count ?? '—'}</Row>
            <Row label="Each creator makes">
              {(e.request_deliverables ?? []).length
                ? (e.request_deliverables ?? []).map((d, i) => <div key={i}>{countOf(Number(d.count), d.type)}</div>)
                : '—'}
            </Row>
            <Row label="In total">
              {(e.plan_totals ?? []).length
                ? <>{e.plan_totals.map((t) => countOf(t.total, t.type)).join(' · ')}<div style={{ color: 'var(--wg-500)', fontSize: 13 }}>{e.plan_videos_total} priced per video</div></>
                : '—'}
            </Row>
            <Row label="Rights">{rights.length ? rights.map((r) => <div key={r}>{r}</div>) : 'None asked'}</Row>
            <Row label="Where">{e.request_location ?? '—'}</Row>
            <Row label="When">
              {e.request_date_from
                ? (e.request_date_to && e.request_date_to !== e.request_date_from ? `${fmtDate(e.request_date_from)} – ${fmtDate(e.request_date_to)}` : fmtDate(e.request_date_from))
                : '—'}
            </Row>
            <Row label="Brief"><span style={{ whiteSpace: 'pre-wrap' }}>{e.request_brief ?? '—'}</span></Row>
          </dl>
        </section>

        {/* ══════ AGREED WITH THE BRAND ══════ */}
        <section className="surface" style={card}>
          <h2 className="sect-head">Agreed with the brand</h2>
          <div className="sect-rule" />
          {agreed ? (
            <div style={{ marginTop: 18 }}>
              <div style={kpiLabel}>Service price</div>
              <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 34, letterSpacing: '-0.03em', color: 'var(--ink)', marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>
                {formatRupees(e.brand_service_total_paise)}
              </div>
              <p className="t-body" style={{ margin: '6px 0 0' }}>
                {e.brand_deliverable_count} × {formatRupees(e.brand_per_video_paise)}{e.brand_misc_paise ? ` + ${formatRupees(e.brand_misc_paise)} extras` : ''}
              </p>
              <dl style={{ display: 'grid', gap: 12, margin: '18px 0 0' }}>
                <Row label="Shoot date">{e.shoot_date ? fmtDate(e.shoot_date) : '—'}</Row>
                <Row label="City">{e.shoot_city ?? '—'}</Row>
                {e.agreed_plan && (
                  <Row label="Plan locked">
                    {e.agreed_plan.creator_count ?? '—'} creators · {(e.agreed_plan.totals ?? []).map((t) => countOf(t.total, t.type)).join(' · ')}
                    {e.agreed_plan.videos_sold !== e.agreed_plan.plan_videos && (
                      <div style={{ color: '#8C6417', fontSize: 13, marginTop: 4 }}>
                        Sold {e.agreed_plan.videos_sold} videos against a plan of {e.agreed_plan.plan_videos}. Creator legs must add up to {e.agreed_plan.videos_sold}.
                      </div>
                    )}
                  </Row>
                )}
              </dl>
            </div>
          ) : (
            <p className="t-body" style={{ margin: '18px 0 0' }}>Nothing agreed yet. The price, date and city lock here when the brand accepts a quote.</p>
          )}
        </section>
      </div>

      <style>{`@media (max-width: 860px) { .xp-cols { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt style={{ ...fieldLabel, marginBottom: 4 }}>{label}</dt>
      <dd style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink)', lineHeight: 1.5 }}>{children}</dd>
    </div>
  )
}

function Failed({ message, inline }: { message: string; inline?: boolean }) {
  const box = <div className="surface" style={{ padding: 24 }}><p className="t-body" style={{ margin: 0 }}>Could not load this Experience: {message}</p></div>
  return inline ? box : <div style={container}>{box}</div>
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
