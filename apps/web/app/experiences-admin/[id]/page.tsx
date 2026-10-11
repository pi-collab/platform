import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import StatusChip from '@/components/StatusChip'
import StepperTimeline from '@/components/StepperTimeline'
import { experienceStaffGate } from '@/lib/experience-staff-auth'
import { getConsoleCompletion, getConsoleCounters, getConsoleDeliverables, getConsoleExperience, getConsoleInvoices, getConsolePayouts, getConsoleReconcile, getConsoleBrief, getLegsReconcile, listLegThreads, getLegThread, getBrandThread, listConsoleCosts, listConsoleCreatorPool, listConsoleLegs, listConsoleProspects, listConsoleQuotes, listConsoleRoster } from '@/lib/experience-console-server'
import { canSeePnl, getExperiencePnl } from '@/lib/experience-pnl-server'
import { EXPERIENCE_STATUSES, experienceStatus } from '@/lib/experience-status'
import { channelLabel, countOf, formatRupees } from '@/lib/experience-request'
import NoAccess from '../NoAccess'
import QuotePanel from './QuotePanel'
import RosterPanel from './RosterPanel'
import CreatorLegsPanel from './CreatorLegsPanel'
import CostSheetPanel from './CostSheetPanel'
import PnlPanel from './PnlPanel'
import ShootPanel from './ShootPanel'
import DeliverablesPanel from './DeliverablesPanel'
import InvoicesPanel from './InvoicesPanel'
import PayoutsPanel from './PayoutsPanel'
import CompletionPanel from './CompletionPanel'
import BriefPanel from './BriefPanel'
import LegThreadList from '../LegThreadList'
import { BrandThreadPanel, CreatorBroadcast } from '../DealsExtras'
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

export default async function ExperienceDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { tab?: string; deal?: string } }) {
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
  const [roster, reconcile, prospects] = hasRoster
    ? await Promise.all([listConsoleRoster(e.id), getConsoleReconcile(e.id), listConsoleProspects(e.id)])
    : [null, null, null]
  // Not-on-Guapd entries list under the roster; linking one needs the vetted
  // creators not on it yet, so the pool is read only when there is one to link.
  const prospectRows = prospects?.ok ? prospects.data : []
  const pool = rosterEditable && prospectRows.some((p) => ['not_contacted', 'contacted', 'agreed', 'onboarding'].includes(p.status)) ? await listConsoleCreatorPool() : null
  const onRoster = new Set(roster?.ok ? roster.data.map((r) => r.creator_id) : [])
  const linkable = pool?.ok
    ? pool.data.filter((c) => !onRoster.has(c.id)).map((c) => ({ id: c.id, name: c.full_name, handle: c.handle ? (c.handle.startsWith('@') ? c.handle : `@${c.handle}`) : '' }))
    : []
  // Creator deals exist once the roster is locked (Confirmed onward).
  const hasLegs = !['draft', 'requested', 'rostering', 'cancelled'].includes(e.status)
  const [legs, legsReconcile, creatorBrief, counters, threads] = hasLegs
    ? await Promise.all([listConsoleLegs(e.id), getLegsReconcile(e.id), getConsoleBrief(e.id), getConsoleCounters(e.id), listLegThreads(e.id)])
    : [null, null, null, null, null]
  // 0546: Overview | Deals. Deals lists every SENT creator deal with its
  // status, any open counter and the Guapd ↔ creator thread.
  const threadRows = threads?.ok ? threads.data : []
  const tab = hasLegs && searchParams?.tab === 'deals' ? 'deals' : 'overview'
  // Old links to one deal on this tab now open the deal's own page.
  if (tab === 'deals' && searchParams?.deal && /^[0-9a-f-]{36}$/i.test(searchParams.deal) && threadRows.some((t) => t.deal_id === searchParams.deal)) redirect(`/experiences-admin/deals/${searchParams.deal}`)
  const unreadAll = threadRows.reduce((n, t) => n + Number(t.unread ?? 0), 0)
  // 0550: the brand ↔ Guapd thread (read on the Deals tab only: reading marks it read).
  const brandThread = tab === 'deals' ? await getBrandThread(e.id) : null
  const openLegs = threadRows.filter((t) => t.can_message)
  // The shoot (from Confirmed) and deliverables (from Shoot scheduled), 0538. Operational.
  const deliverables = hasLegs ? await getConsoleDeliverables(e.id) : null
  const hasDeliverables = ['shoot_scheduled', 'shoot_done', 'delivering', 'complete'].includes(e.status)
  // Cost sheet (operational) and P&L (financial only, decided in Postgres) once the price is agreed.
  const [costs, financial] = hasRoster ? await Promise.all([listConsoleCosts(e.id), canSeePnl()]) : [null, false]
  const pnl = hasRoster && financial ? await getExperiencePnl(e.id) : null
  // 0540: invoices (financial only), creator payouts (after the shoot), completion (Delivering onward).
  const [invoices, payouts, completion] = await Promise.all([
    hasRoster && financial ? getConsoleInvoices(e.id) : Promise.resolve(null),
    hasDeliverables ? getConsolePayouts(e.id) : Promise.resolve(null),
    e.status === 'delivering' || e.status === 'complete' ? getConsoleCompletion(e.id) : Promise.resolve(null),
  ])
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
    : e.status === 'confirmed' ? 'Next: send each creator their deal, then confirm the shoot'
    : e.status === 'shoot_scheduled' ? "Next: after the shoot, record each creator's outcome"
    : e.status === 'shoot_done' ? 'Next: review the deliverables and share them with the brand'
    : e.status === 'delivering' ? 'Next: brand approvals, invoices paid, creators paid, then both sign-offs'
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
  // Agreed = a quote was accepted (the plan locks then). Not the brand price:
  // that is financial-only (0537) and null for operational staff.
  const agreed = e.status !== 'requested' && e.status !== 'draft' && (e.agreed_plan != null || e.brand_per_video_paise != null)

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

      {/* ══════ TABS (0546) ══════ */}
      {hasLegs && (
        <nav className="xp-tabs" aria-label="Experience sections">
          <Link href={`/experiences-admin/${e.id}`} className={tab === 'overview' ? 'on' : ''} aria-current={tab === 'overview' ? 'page' : undefined}>Overview</Link>
          <Link href={`/experiences-admin/${e.id}?tab=deals`} className={tab === 'deals' ? 'on' : ''} aria-current={tab === 'deals' ? 'page' : undefined}>
            Deals <span className="xp-tab-n">{threadRows.length}</span>{unreadAll > 0 && <span className="xp-tab-badge" aria-label={`${unreadAll} unread`}>{unreadAll}</span>}
          </Link>
        </nav>
      )}

      {tab === 'deals' && (
        <section className="surface" style={{ ...card, marginTop: 16 }} aria-labelledby="xp-deals">
          <h2 id="xp-deals" className="sect-head">Creator deals sent <span style={{ color: 'var(--wg-500)', fontWeight: 500, marginLeft: 6 }}>{threadRows.length}</span></h2>
          <div className="sect-rule" />
          <p className="t-body" style={{ margin: '12px 0 0', fontSize: 13 }}>Every deal sent to a creator on this Experience, and your messages with them. The brand never sees these threads.</p>
          {openLegs.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <CreatorBroadcast experienceId={e.id} all={openLegs.length} accepted={openLegs.filter((t) => t.status === 'agreed' || t.status === 'paid').length} />
            </div>
          )}
          {/* Each row opens the deal on its own page, with the creator thread in the bottom-right panel. */}
          <div style={{ marginTop: 16 }}>
            <LegThreadList rows={threadRows} hrefFor="/experiences-admin/deals/" activeId={null} showExperience={false} />
          </div>
        </section>
      )}

      {tab === 'deals' && brandThread && (
        <section className="surface" style={{ ...card, marginTop: 16 }} aria-labelledby="xp-brandmsg">
          <h2 id="xp-brandmsg" className="sect-head">Messages with {e.brand_name}</h2>
          <div className="sect-rule" />
          <p className="t-body" style={{ margin: '12px 0 14px', fontSize: 13 }}>Your thread with the brand about this Experience. No creator sees it.</p>
          {brandThread.ok
            ? <BrandThreadPanel experienceId={e.id} closeHref={`/experiences-admin/${e.id}`} thread={{
                deal_id: e.id, deal_ref: null, status: 'open', experience_id: e.id, experience_title: e.title,
                creator_name: e.brand_name, creator_handle: null, creator_photo: null, can_message: true,
                messages: brandThread.data.messages.map((m) => ({ id: m.id, from: m.from === 'guapd' ? 'guapd' as const : 'creator' as const, body: m.body, created_at: m.created_at, sender_name: m.sender_name })),
              }} />
            : <Failed inline message={brandThread.error} />}
        </section>
      )}

      {tab === 'overview' && <>
      {/* ══════ ROSTER: the main action once the price is agreed ══════ */}
      {hasRoster && (
        <div style={{ marginTop: 20 }}>
          {roster?.ok && reconcile?.ok
            ? <RosterPanel experienceId={e.id} editable={rosterEditable} roster={roster.data} reconcile={reconcile.data} prospects={prospectRows} linkable={linkable} />
            : <Failed inline message={(roster && !roster.ok && roster.error) || (reconcile && !reconcile.ok && reconcile.error) || 'Could not load the roster'} />}
        </div>
      )}

      {/* ══════ CREATOR DEALS: the main action once the roster is locked ══════ */}
      {hasLegs && (
        <div style={{ marginTop: 20 }}>
          {legs?.ok && legsReconcile?.ok
            ? <CreatorLegsPanel experienceId={e.id} editable={e.status === 'confirmed'} legs={legs.data} reconcile={legsReconcile.data}
                affiliateSold={e.request_affiliate === true} adRightsSold={e.request_ad_rights === true} boostSold={e.request_boost === true}
                boughtPer={{ affiliate: e.agreed_plan?.affiliate_per_creator ?? null, adRights: e.agreed_plan?.ad_rights_per_creator ?? null, boost: e.agreed_plan?.boost_per_creator ?? null }}
                counters={counters?.ok ? counters.data.counters : []} canRaise={counters?.ok ? counters.data.can_raise : false} />
            : <Failed inline message={(legs && !legs.ok && legs.error) || (legsReconcile && !legsReconcile.ok && legsReconcile.error) || 'Could not load the creator deals'} />}
        </div>
      )}

      {/* ══════ THE BRIEF creators get (0546): shared, or a creator's own ══════ */}
      {hasLegs && (
        <div style={{ marginTop: 20 }}>
          {creatorBrief?.ok && legs?.ok
            ? <BriefPanel experienceId={e.id} brief={creatorBrief.data}
                creators={legs.data.map((l) => ({ roster_id: l.roster_id, full_name: l.full_name, has_own_brief: !!l.has_own_brief, sent: !!l.leg_deal_id }))} />
            : <Failed inline message={(creatorBrief && !creatorBrief.ok && creatorBrief.error) || 'Could not load the brief'} />}
        </div>
      )}

      {/* ══════ THE SHOOT + DELIVERABLES (0538) ══════ */}
      {hasLegs && deliverables && (deliverables.ok
        ? (deliverables.data.legs.length > 0 && (
            <>
              <div style={{ marginTop: 20 }}><ShootPanel experienceId={e.id} data={deliverables.data} shootCity={e.shoot_city} /></div>
              {hasDeliverables && <div style={{ marginTop: 20 }}><DeliverablesPanel experienceId={e.id} data={deliverables.data} /></div>}
            </>
          ))
        : <div style={{ marginTop: 20 }}><Failed inline message={deliverables.error} /></div>)}

      {/* ══════ MONEY + COMPLETION (0540) ══════ */}
      {payouts && <div style={{ marginTop: 20 }}>{payouts.ok ? <PayoutsPanel experienceId={e.id} data={payouts.data} /> : <Failed inline message={payouts.error} />}</div>}
      {invoices && <div style={{ marginTop: 20 }}>{invoices.ok ? <InvoicesPanel data={invoices.data} /> : <Failed inline message={invoices.error} />}</div>}
      {completion && <div style={{ marginTop: 20 }}>{completion.ok ? <CompletionPanel experienceId={e.id} data={completion.data} /> : <Failed inline message={completion.error} />}</div>}

      {/* ══════ COSTS + P&L ══════ */}
      {hasRoster && costs && (
        <div className="xp-cols" style={{ display: 'grid', gridTemplateColumns: financial ? '3fr 2fr' : '1fr', gap: 20, marginTop: 20, alignItems: 'start' }}>
          {costs.ok
            ? <CostSheetPanel experienceId={e.id} costs={costs.data}
                creators={(legs?.ok ? legs.data : []).filter((l) => l.leg_deal_id).map((l) => ({ dealId: l.leg_deal_id as string, name: l.full_name }))} />
            : <Failed inline message={costs.error} />}
          {financial && pnl && (pnl.ok ? <PnlPanel experienceId={e.id} status={e.status} pnl={pnl.pnl} /> : <Failed inline message={pnl.error} />)}
        </div>
      )}

      {/* ══════ QUOTES: the main action while the price is open ══════ */}
      <div style={{ marginTop: 20 }}>
        {quotes.ok ? (
          <QuotePanel
            experienceId={e.id}
            open={e.status === 'requested'}
            canSeePrice={e.can_see_brand_price}
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
              {e.can_see_brand_price ? (
                <>
                  <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 34, letterSpacing: '-0.03em', color: 'var(--ink)', marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>
                    {formatRupees(e.brand_service_total_paise)}
                  </div>
                  <p className="t-body" style={{ margin: '6px 0 0' }}>
                    {e.brand_deliverable_count} × {formatRupees(e.brand_per_video_paise)}{e.brand_misc_paise ? ` + ${formatRupees(e.brand_misc_paise)} extras` : ''}
                  </p>
                </>
              ) : (
                <p className="t-body" style={{ margin: '10px 0 0' }}>Agreed{e.brand_deliverable_count ? ` for ${e.brand_deliverable_count} videos` : ''}. The price is visible to finance only.</p>
              )}
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
      </>}

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 860px) { .xp-cols { grid-template-columns: 1fr !important; } }
        .xp-tabs { display: flex; gap: 6px; margin-top: 20px; padding: 4px; border-radius: 14px; background: #F2F2EC; width: fit-content; max-width: 100%; }
        .xp-tabs a { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 16px; border-radius: 10px; font-family: var(--font-ui); font-size: 13.5px; font-weight: 600; color: var(--ink-soft); text-decoration: none; }
        .xp-tabs a.on { background: #fff; color: var(--ink); box-shadow: 0 1px 2px rgba(22,23,15,.08); }
        .xp-tab-n { color: var(--ink-faint); font-weight: 500; }
        .xp-tab-badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--neon); color: var(--ink); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
      ` }} />
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
