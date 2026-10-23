import Link from 'next/link'
import { notFound } from 'next/navigation'
import { experienceStaffGate } from '@/lib/experience-staff-auth'
import { getConsoleExperience, getConsoleExtras, getLegThread, listConsoleLegs, consolePostPerformance } from '@/lib/experience-console-server'
import ExperiencePostPerformance from '@/components/ExperiencePostPerformance'
import RecheckPostButton from '../../RecheckPostButton'
import { countOf } from '@/lib/experience-request'
import { formatPaiseINR } from '@/lib/money'
import CreatorStepper from '@/app/creator/deals/[id]/CreatorStepper'
import { DealHeroCard, DealShellStyles, wrapper } from '@/app/creator/deals/[id]/deal-shell'
import { TermsCard, DeliverablesCard, DeliverableRow, MoneyRow, chipStyle } from '@/app/creator/deals/[id]/deal-cards'
import NoAccess from '../../NoAccess'
import ConsoleDealThread from '../../ConsoleDealThread'
import ConsoleExtras from '../../ConsoleExtras'

export const dynamic = 'force-dynamic'

const short = (iso: string | null | undefined) => {
  if (!iso) return null
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const LABEL: Record<string, string> = { negotiating: 'Offer sent', agreed: 'Accepted', paid: 'Paid', declined: 'Declined', cancelled: 'Withdrawn', complete: 'Complete' }

/**
 * One creator deal sent from an Experience, in the console, on the creator deal
 * page's design (6.1): the same hero, tracker, terms and Deliverables cards, and
 * the brand deal page's bottom-right message panel for Guapd <-> this creator.
 * Staff-only; every read is a gated console function (operational access). The
 * creator's pay shown here is what operational staff already see on the
 * Experience; never the brand price or margin.
 */
export default async function ConsoleDealPage({ params, searchParams }: { params: { dealId: string }; searchParams?: { chat?: string; tab?: string } }) {
  const gate = await experienceStaffGate()
  if (!gate.ok) return <NoAccess reason={gate.reason} />
  if (!/^[0-9a-f-]{36}$/i.test(params.dealId)) notFound()
  const t = await getLegThread(params.dealId)
  if (!t.ok) notFound()
  const th = t.data
  const [exp, legs, extrasRes] = await Promise.all([getConsoleExperience(th.experience_id), listConsoleLegs(th.experience_id), getConsoleExtras(th.experience_id)])
  const extras = extrasRes.ok ? extrasRes.data.filter((x) => x.deal_id === th.deal_id) : []
  const e = exp.ok ? exp.data : null
  const leg = legs.ok ? legs.data.find((l) => l.leg_deal_id === th.deal_id) ?? null : null
  // 0577: this creator's collab posts and their numbers, on the Analytics tab.
  const tab = searchParams?.tab === 'analytics' ? 'analytics' : 'deal'
  const perf = tab === 'analytics' ? await consolePostPerformance(th.experience_id) : null
  const myPosts = perf?.ok ? perf.data.posts.filter((p) => p.deal_id === th.deal_id) : []
  const myWaiting = perf?.ok ? perf.data.waiting_for_link[th.deal_id] ?? 0 : 0

  const open = th.status === 'negotiating'
  const paid = th.status === 'paid' || th.status === 'complete'
  const closed = th.status === 'declined' || th.status === 'cancelled'
  const deliverables = leg?.leg_deliverables ?? leg?.planned_deliverables ?? []
  const items = deliverables.reduce((n, d) => n + Number(d.count), 0)
  const net = leg?.sent_net_paise != null ? Number(leg.sent_net_paise) : null
  const allowance = Number(leg?.sent_allowance_paise ?? 0)
  const total = net != null ? net + allowance : null
  const stages = ['Offer sent', 'Accepted', 'Shoot', 'Paid']
  const idx = open ? 0 : paid ? 3 : 1
  const chips = [
    ...((leg?.leg_affiliate_count ?? 0) > 0 ? [`Affiliate link on ${leg!.leg_affiliate_count}`] : []),
    ...((leg?.leg_ad_rights_count ?? 0) > 0 ? [`Ad rights · ${leg!.leg_ad_rights_count}`] : []),
    ...((leg?.leg_boost_count ?? 0) > 0 ? [`Boosting · ${leg!.leg_boost_count}`] : []),
  ].map((c) => <span key={c} style={chipStyle}>{c}</span>)

  const dot = paid ? 'var(--neon)' : open ? 'var(--warning)' : closed ? '#C4494F' : '#7E6BC4'
  const glow = paid ? 'color-mix(in oklab, var(--neon) 22%, transparent)' : open ? 'color-mix(in oklab, var(--warning) 22%, transparent)' : closed ? 'rgba(196,73,79,.22)' : 'rgba(126,107,196,.22)'

  return (
    <>
      <main style={wrapper}>
        <DealShellStyles />
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="frame reveal" style={{ width: '100%', maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 36 }}>
            <DealHeroCard brand={th.creator_name} brandLogo={th.creator_photo}
              meta={<>{th.experience_title}{e ? ` · ${e.brand_name}` : ''}{th.deal_ref ? ` · ${th.deal_ref}` : ''}</>}
              headline={open ? 'Offer sent to ' : paid ? 'Paid · ' : closed ? 'Deal with ' : 'Deal with '}
              subline={th.creator_handle ? `@${th.creator_handle.replace(/^@/, '')}` : undefined}
              chatLabel="Message creator"
              statusDot={dot} statusGlow={glow} statusLabel={LABEL[th.status] ?? th.status}
              statusLine={<>{leg?.leg_sent_at ? `Sent ${short(leg.leg_sent_at)}` : ''}{e?.shoot_date ? <> &middot; shoot on <b style={{ color: 'var(--ink)' }}>{short(e.shoot_date)}</b>{e.shoot_city ? ` in ${e.shoot_city}` : ''}</> : ''}</>}
              backHref="/experiences-admin/deals" backLabel="Back to deals" />

            <nav className="xp-dtabs" aria-label="Deal sections">
              <Link href={`/experiences-admin/deals/${th.deal_id}`} className={tab === 'deal' ? 'on' : ''} aria-current={tab === 'deal' ? 'page' : undefined}>Deal</Link>
              <Link href={`/experiences-admin/deals/${th.deal_id}?tab=analytics`} className={tab === 'analytics' ? 'on' : ''} aria-current={tab === 'analytics' ? 'page' : undefined}>Analytics</Link>
            </nav>
            <style>{`.xp-dtabs { display: flex; gap: 6px; padding: 4px; border-radius: 14px; background: #F2F2EC; width: fit-content; max-width: 100%; }
              .xp-dtabs a { display: inline-flex; align-items: center; height: 36px; padding: 0 16px; border-radius: 10px; font-family: var(--font-ui); font-size: 13.5px; font-weight: 600; color: var(--ink-soft); text-decoration: none; }
              .xp-dtabs a.on { background: #fff; color: var(--ink); box-shadow: 0 1px 2px rgba(22,23,15,.08); }`}</style>

            {tab === 'analytics' && (
              <section className="surface" style={{ padding: '22px 24px' }} aria-labelledby="xp-deal-analytics">
                <h2 id="xp-deal-analytics" style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: 0 }}>How {th.creator_name}&apos;s posts did</h2>
                <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 0', lineHeight: 1.5 }}>Read from {th.creator_name}&apos;s own Instagram and refreshed daily. {th.creator_name} and the brand see the same numbers.{myWaiting > 0 ? ` ${myWaiting} collab ${myWaiting === 1 ? 'video is' : 'videos are'} still waiting for a link.` : ''}</p>
                {perf && !perf.ok
                  ? <p style={{ fontSize: 13, color: '#C4494F', margin: '12px 0 0' }}>{perf.error}</p>
                  : myPosts.length > 0
                    ? <ExperiencePostPerformance posts={myPosts} action={(postId) => <RecheckPostButton experienceId={th.experience_id} dealId={th.deal_id} postId={postId} />} />
                    : <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '12px 0 0' }}>No collab post links yet. Numbers appear once {th.creator_name} posts and adds the link.</p>}
              </section>
            )}

            {tab === 'deal' && <>
            {!closed && <CreatorStepper dealStatus={th.status} events={[]} track={{ stages, index: idx, allDone: paid, dates: {}, footer: paid ? 'Deal complete' : `Next · ${stages[idx + 1]?.toLowerCase() ?? 'paid'}` }} />}

            <TermsCard heading={open ? 'Offer terms' : 'Agreed terms'}
              title={deliverables.map((d) => countOf(Number(d.count), d.type)).join(' + ') || 'To be confirmed'}
              sub={`Shoot ${leg?.sent_days ?? leg?.leg_days ?? 1} day${Number(leg?.sent_days ?? leg?.leg_days ?? 1) === 1 ? '' : 's'}${e?.shoot_city ? ` · ${e.shoot_city}` : ''}`}
              side={[
                { label: 'Shoot', value: short(e?.shoot_date) ?? 'To be confirmed' },
                ...(leg?.sent_day_rate_paise != null ? [{ label: 'Day rate', value: `${formatPaiseINR(Number(leg.sent_day_rate_paise))} × ${leg.sent_days}` }] : []),
              ]}
              receiveLabel="Creator receives, paid by Guapd"
              receive={total != null ? formatPaiseINR(total) : null} />

            <DeliverablesCard count={`${items} item${items === 1 ? '' : 's'}`}
              rows={deliverables.map((d, i) => <DeliverableRow key={`${d.type}-${i}`} last={i === deliverables.length - 1} icon="video" label={countOf(Number(d.count), d.type)} chips={i === 0 ? chips : []} />)}>
              {leg?.sent_gross_paise != null && (<>
                <MoneyRow label="Creator's rate" value={formatPaiseINR(Number(leg.sent_gross_paise))} />
                <MoneyRow label={`Platform fee (${Number(leg.sent_platform_pct)}%)`} value={`−${formatPaiseINR(Number(leg.sent_gross_paise) - Number(leg.sent_net_paise))}`} />
                {allowance > 0 && <MoneyRow label="Allowance (no fee)" value={`+${formatPaiseINR(allowance)}`} />}
                <MoneyRow label="Total to the creator" value={formatPaiseINR(total ?? 0)} strong last />
              </>)}
            </DeliverablesCard>

            {/* 0555: extra deliverables for this creator. */}
            {leg && (th.status === 'agreed' || th.status === 'paid' || extras.length > 0) && (
              <ConsoleExtras experienceId={th.experience_id} dealId={th.deal_id} creatorName={th.creator_name} track={leg.track} extras={extras}
                canSend={(th.status === 'agreed' || th.status === 'paid') && !!e && ['confirmed', 'shoot_scheduled', 'shoot_done', 'delivering'].includes(e.status)} />
            )}

            <div className="surface" style={{ padding: '22px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Counters, brief, shoot outcome, deliverables and payout are managed on the Experience.</span>
              <Link href={`/experiences-admin/${th.experience_id}?tab=deals&deal=${th.deal_id}`} className="neonbtn" style={{ display: 'inline-flex', alignItems: 'center', height: 42, padding: '0 18px', borderRadius: 11, background: 'var(--neon)', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, color: 'var(--ink)', textDecoration: 'none' }}>Open the Experience</Link>
            </div>
            </>}
          </div>
        </div>
      </main>
      <ConsoleDealThread dealId={th.deal_id} status={th.status} creatorName={th.creator_name} autoOpen={searchParams?.chat === '1'}
        messages={th.messages.map((m) => ({ id: m.id, deal_id: th.deal_id, sender_party: m.from === 'guapd' ? 'brand' as const : 'creator' as const, body: m.body, created_at: m.created_at }))} />
    </>
  )
}
