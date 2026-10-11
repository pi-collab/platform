import Link from 'next/link'
import { notFound } from 'next/navigation'
import { experienceStaffGate } from '@/lib/experience-staff-auth'
import { getConsoleExperience, getLegThread, listConsoleLegs } from '@/lib/experience-console-server'
import { countOf } from '@/lib/experience-request'
import { formatPaiseINR } from '@/lib/money'
import CreatorStepper from '@/app/creator/deals/[id]/CreatorStepper'
import { DealHeroCard, DealShellStyles, wrapper } from '@/app/creator/deals/[id]/deal-shell'
import { TermsCard, DeliverablesCard, DeliverableRow, MoneyRow, chipStyle } from '@/app/creator/deals/[id]/deal-cards'
import NoAccess from '../../NoAccess'
import ConsoleDealThread from '../../ConsoleDealThread'

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
export default async function ConsoleDealPage({ params, searchParams }: { params: { dealId: string }; searchParams?: { chat?: string } }) {
  const gate = await experienceStaffGate()
  if (!gate.ok) return <NoAccess reason={gate.reason} />
  if (!/^[0-9a-f-]{36}$/i.test(params.dealId)) notFound()
  const t = await getLegThread(params.dealId)
  if (!t.ok) notFound()
  const th = t.data
  const [exp, legs] = await Promise.all([getConsoleExperience(th.experience_id), listConsoleLegs(th.experience_id)])
  const e = exp.ok ? exp.data : null
  const leg = legs.ok ? legs.data.find((l) => l.leg_deal_id === th.deal_id) ?? null : null

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

            <div className="surface" style={{ padding: '22px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Counters, brief, shoot outcome, deliverables and payout are managed on the Experience.</span>
              <Link href={`/experiences-admin/${th.experience_id}?tab=deals&deal=${th.deal_id}`} className="neonbtn" style={{ display: 'inline-flex', alignItems: 'center', height: 42, padding: '0 18px', borderRadius: 11, background: 'var(--neon)', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, color: 'var(--ink)', textDecoration: 'none' }}>Open the Experience</Link>
            </div>
          </div>
        </div>
      </main>
      <ConsoleDealThread dealId={th.deal_id} status={th.status} creatorName={th.creator_name} autoOpen={searchParams?.chat === '1'}
        messages={th.messages.map((m) => ({ id: m.id, deal_id: th.deal_id, sender_party: m.from === 'guapd' ? 'brand' as const : 'creator' as const, body: m.body, created_at: m.created_at }))} />
    </>
  )
}
