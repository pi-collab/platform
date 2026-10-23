import Link from 'next/link'
import { formatPaiseINR } from '@/lib/money'
import { countOf } from '@/lib/experience-request'
import type { CreatorCollabPost, CreatorLegContext } from '@/lib/creator-leg-money'
import { creatorLegMoney } from '@/lib/creator-leg-money'
import CreatorOfferMobile from '@/components/CreatorOfferMobile'
import AcceptDecline from './AcceptDecline'
import CreatorStepper, { type StepperTrack } from './CreatorStepper'
import LegDeliverables from './LegDeliverables'
import BriefBlock from './BriefBlock'
import CreatorThread from './CreatorThread'
import LegInvoiceForm from './LegInvoiceForm'
import ExtraOffers from './ExtraOffers'
import CollabPosts from './CollabPosts'
import AffiliateCommission from './AffiliateCommission'
import { DealHeroCard, DealShellStyles, wrapper, metaLabel, sectionHeading, termRow } from './deal-shell'
import { ReadyToDecideBar, TermsCard, DeliverablesCard, DeliverableRow, MoneyRow, MoneyCard, CardActions, chipStyle } from './deal-cards'
import './creator-leg.css'

/**
 * A Guapd Experience creator leg, on the SAME creator deal page a marketplace
 * deal uses (6.1 item 9): the phone screens (CreatorOfferMobile), the hero
 * card, the tracker (CreatorStepper), the terms surface with Accept / Counter
 * / Decline (AcceptDecline), the brief (BriefBlock) and the thread
 * (CreatorThread). Only the data is the leg's.
 *
 * EVERY value here comes from creator_leg_context (0546/0547), which returns
 * the caller's OWN leg only (Postgres checks d.creator_id = my_creator_id()):
 *   brand name/logo + "Managed by Guapd"   ← deals.experience_brand_name, the brand's logo
 *   day rate, days, gross, fee %, net      ← experience_creator_terms (this leg)
 *   allowance, total to you                ← experience_creator_terms.allowance_paise (this leg)
 *   deliverables, affiliate/ad/boost       ← experience_roster (this leg's row)
 *   brief + attachments                    ← this leg's own brief, else the shared one
 *   counters                               ← experience_leg_counters (this deal)
 *   payout statement                       ← vendor_payouts (this deal)
 *   messages                               ← messages RLS: this leg's creator only
 * There is no field on that context for the brand's price, Guapd's margin or
 * cost, or any other creator, so none can reach this page. The marketplace fee
 * path (calculateFee / resolveDealFee) is never called for a leg.
 */
type Msg = { id: string; deal_id: string; sender_party: 'brand' | 'creator'; body: string | null; created_at: string }
type Ev = { id: string; event_type: string; detail: any; created_at: string }

const short = (iso: string | null | undefined) => {
  if (!iso) return null
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function CreatorLegView({ dealId, ctx, attachmentUrls = {}, messages = [], events = [], autoOpenChat = false, unread = 0, creatorName = '', collabPosts = [] }: {
  dealId: string
  ctx: CreatorLegContext
  /** 0561: the videos Guapd sent to post as collabs or to share. */
  collabPosts?: CreatorCollabPost[]
  attachmentUrls?: Record<string, string>
  messages?: Msg[]
  events?: Ev[]
  autoOpenChat?: boolean
  unread?: number
  /** Prefills the invoice form (0552). */
  creatorName?: string
}) {
  const m = creatorLegMoney(ctx)
  const allowance = Number(ctx.allowance_paise ?? 0)
  const total = m ? m.netPaise + allowance : null
  const open = ctx.status === 'negotiating'
  const accepted = ctx.status === 'agreed' || ctx.status === 'paid'
  const declined = ctx.status === 'declined' || ctx.status === 'cancelled'
  const creatorSubmits = ctx.deliverables_owner === 'creator'
  const shot = ctx.shoot_outcome === 'done'
  const noShoot = ctx.shoot_outcome === 'did_not_shoot'
  // 0551: Guapd paying the creator fee moves the deal itself to paid.
  const paid = ctx.status === 'paid' || ctx.payout?.status === 'paid'
  // Number order (video 2 before video 10), not text order.
  const items = [...(ctx.items ?? [])].sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }))
  const brand = ctx.brand_name ?? 'A brand'
  const managed = `${brand} · Managed by Guapd`
  const brief = ctx.brief_detail
  const hasBrief = !!brief && !!(brief.pitch || brief.guidelines || brief.avoid || (brief.attachments ?? []).length > 0)
  const shootDate = ctx.shoot_date ? new Date(`${ctx.shoot_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null
  const scopeLines = [
    (ctx.affiliate_count ?? 0) > 0 ? `${ctx.affiliate_count} of your ${ctx.videos} video${ctx.videos === 1 ? '' : 's'} carr${ctx.affiliate_count === 1 ? 'ies' : 'y'} the brand's affiliate link${ctx.affiliate_pct != null ? `: you earn ${Number(ctx.affiliate_pct)}% of the sales through it, less your ${ctx.platform_pct != null ? `${Number(ctx.platform_pct)}% ` : ''}Guapd fee` : ''}` : null,
    (ctx.ad_rights_videos ?? 0) > 0 ? `The brand may run ${ctx.ad_rights_videos} as ads${ctx.ad_rights_months != null ? ` for ${ctx.ad_rights_months} month${ctx.ad_rights_months === 1 ? '' : 's'}` : ''}` : null,
    (ctx.boost_videos ?? 0) > 0 ? `The brand may boost ${ctx.boost_videos}${ctx.boost_months != null ? ` for ${ctx.boost_months} month${ctx.boost_months === 1 ? '' : 's'}` : ''}` : null,
  ].filter(Boolean) as string[]

  // ── The leg's own stages, on the same tracker ──
  // 0552: the creator confirms the shoot and raises their invoice before Guapd pays.
  const invoice = ctx.invoice ?? null
  const stages = creatorSubmits ? ['Offer received', 'Accepted', 'Shoot', 'Deliverables', 'Invoice', 'Paid'] : ['Offer received', 'Accepted', 'Shoot', 'Invoice', 'Paid']
  const at = (name: string) => stages.indexOf(name)
  const idx = paid ? stages.length - 1 : open ? 0 : !shot ? 1 : creatorSubmits && !ctx.work_complete ? at('Shoot')
    : !invoice ? (creatorSubmits ? at('Deliverables') : at('Shoot')) : at('Invoice')
  const statusOf = (to: string) => events.filter((e) => e.event_type === 'deal.status_changed' && (e.detail?.to === to || e.detail?.new_status === to)).pop()?.created_at
  const dates: Record<number, string> = {}
  const sentAt = events.find((e) => e.event_type === 'experience.leg_sent')?.created_at
  if (sentAt) dates[0] = sentAt
  const agreedAt = statusOf('agreed'); if (agreedAt) dates[1] = agreedAt
  if (invoice) dates[at('Invoice')] = invoice.issued_at
  if (paid && ctx.payout?.paid_on) dates[stages.length - 1] = `${ctx.payout.paid_on}T00:00:00`
  const track: StepperTrack = {
    stages, index: idx, allDone: paid, dates,
    footer: paid ? 'Deal complete' : `Next · ${(stages[idx + 1] ?? (creatorSubmits ? 'paid' : 'paid')).toLowerCase()}`,
  }
  const headline = open ? (ctx.counters ?? []).some((c) => c.status === 'open' && c.proposed_by === 'guapd') ? 'Counter received from ' : 'Offer received from '
    : declined ? 'Offer from ' : paid ? 'Wrapped with ' : shot ? 'Shot with ' : 'Shoot booked with '
  const statusLabel = declined ? (ctx.status === 'cancelled' ? 'Withdrawn' : 'Declined') : paid ? 'Complete' : open ? 'Received' : noShoot ? 'Did not go ahead' : shot ? 'Shot' : 'Agreed'
  const statusLine = paid && ctx.payout ? <>{formatPaiseINR(ctx.payout.paid_paise)} received{ctx.payout.paid_on ? ` ${short(ctx.payout.paid_on)}` : ''} &middot; nothing left to do</>
    : open ? <>Sent{sentAt ? ` ${short(sentAt)}` : ''}{shootDate ? <> &middot; shoot on <b style={{ color: 'var(--ink)' }}>{shootDate}</b></> : ''}</>
    : shot ? <>{!ctx.work_complete ? 'Shot · Guapd is reviewing your deliverables' : ctx.invoice ? `Invoice ${ctx.invoice.number} sent · Guapd pays you next` : 'Your part is complete · confirm the shoot and raise your invoice'}</>
    : declined ? <>This offer is closed</>
    : <>Agreed{shootDate ? <> &middot; shoot on <b style={{ color: 'var(--ink)' }}>{shootDate}</b>{ctx.shoot_city ? ` in ${ctx.shoot_city}` : ''}</> : ''}</>
  const dot = paid ? 'var(--neon)' : open ? 'var(--warning)' : declined ? '#C4494F' : '#7E6BC4'
  const glow = paid ? 'color-mix(in oklab, var(--neon) 22%, transparent)' : open ? 'color-mix(in oklab, var(--warning) 22%, transparent)' : declined ? 'rgba(196,73,79,.22)' : 'rgba(126,107,196,.22)'

  const payRule = creatorSubmits ? 'Guapd pays you once your deliverables are approved' : 'Guapd pays you after the shoot'
  const whatYouMake = (ctx.deliverables ?? []).map((d) => countOf(Number(d.count), d.type)).join(' + ') || 'To be confirmed'
  const chip = (t: string) => <span key={t} style={chipStyle}>{t}</span>
  const scopeChips = [
    ...((ctx.affiliate_count ?? 0) > 0 ? [chip(`Affiliate link on ${ctx.affiliate_count}`)] : []),
    ...((ctx.ad_rights_videos ?? 0) > 0 ? [chip(`Ad rights \u00B7 ${ctx.ad_rights_videos}${ctx.ad_rights_months != null ? ` for ${ctx.ad_rights_months}mo` : ''}`)] : []),
    ...((ctx.boost_videos ?? 0) > 0 ? [chip(`Boosting \u00B7 ${ctx.boost_videos}${ctx.boost_months != null ? ` for ${ctx.boost_months}mo` : ''}`)] : []),
  ]

  // ── The shared answer control, in leg mode ──
  const answer = (stacked: boolean) => (
    <AcceptDecline dealId={dealId} stacked={stacked} leg={{
      counters: ctx.counters ?? [], countersLeft: ctx.counters_left ?? 0,
      dayRatePaise: ctx.day_rate_paise != null ? Number(ctx.day_rate_paise) : null,
      days: ctx.days != null ? Number(ctx.days) : null,
      platformPct: ctx.platform_pct != null ? Number(ctx.platform_pct) : null,
      totalLabel: total != null ? formatPaiseINR(total) : null,
      allowancePaise: allowance,
    }} />
  )
  const counterRows = (ctx.counters ?? []).map((c) => (
    <div key={c.id} style={{ ...termRow, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        <b style={{ color: 'var(--ink)' }}>{c.proposed_by === 'creator' ? `Your counter ${c.round}` : `Guapd's counter ${c.round}`}</b>
        {' · '}{c.status === 'open' ? (c.proposed_by === 'creator' ? 'waiting for Guapd' : 'waiting for you') : c.status}
        {c.note ? <span style={{ display: 'block', marginTop: 2 }}>“{c.note}”</span> : null}
        {c.decision_note ? <span style={{ display: 'block', marginTop: 2 }}>Guapd: “{c.decision_note}”</span> : null}
      </span>
      <b style={{ fontSize: 13.5, whiteSpace: 'nowrap' }}>{formatPaiseINR(c.day_rate_paise)}/day × {c.days} → {formatPaiseINR(c.net_paise)}</b>
    </div>
  ))

  // ── Phone: the same screens as a marketplace deal ──
  const mStage: 'offer' | 'agreed' | 'complete' = open ? 'offer' : paid ? 'complete' : 'agreed'
  const lit = Math.round((paid ? stages.length - 1 : idx) * 5 / (stages.length - 1))
  const mobileInvoice = ctx.can_invoice && total != null ? (
    <section className="offer-m__card">
      <div className="offer-m__label">Raise your invoice</div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '6px 0 12px' }}>Guapd marked your shoot done. Confirm it and raise your invoice to get paid.</p>
      <LegInvoiceForm dealId={dealId} payablePaise={total} payableLabel={formatPaiseINR(total)} shootLabel={shootDate ? `on ${shootDate}` : 'for this deal'} defaultName={creatorName} compact />
    </section>
  ) : invoice && !ctx.payout ? (
    <section className="offer-m__card">
      <div className="offer-m__label">Invoice sent</div>
      <div className="offer-m__termrows">
        <div className="offer-m__termrow"><span>Invoice</span><span><a href={`/creator/deals/${dealId}/invoice`} target="_blank" rel="noopener noreferrer">{invoice.number}</a></span></div>
        <div className="offer-m__termrow"><span>Sent</span><span>{short(invoice.issued_at)}</span></div>
        <div className="offer-m__termrow"><span>Total</span><span>{formatPaiseINR(invoice.payable_paise)}</span></div>
      </div>
    </section>
  ) : null
  const statement = ctx.payout ? (
    <section className="offer-m__card">
      <div className="offer-m__label">Your payout</div>
      <div className="offer-m__termrows">
        <div className="offer-m__termrow"><span>Your rate</span><span>{formatPaiseINR(ctx.payout.gross_paise)}</span></div>
        <div className="offer-m__termrow"><span>Guapd platform fee ({Number(ctx.payout.platform_pct)}%)</span><span>−{formatPaiseINR(ctx.payout.platform_fee_paise)}</span></div>
        {Number(ctx.payout.allowance_paise ?? 0) > 0 && <div className="offer-m__termrow"><span>Allowance (no fee)</span><span>+{formatPaiseINR(Number(ctx.payout.allowance_paise))}</span></div>}
        {ctx.payout.tds_paise ? <div className="offer-m__termrow"><span>TDS withheld</span><span>−{formatPaiseINR(ctx.payout.tds_paise)}</span></div> : null}
        <div className="offer-m__termrow"><span>{paid ? 'Paid to you' : 'To be paid to you'}</span><span>{formatPaiseINR(ctx.payout.paid_paise)}</span></div>
        {paid && ctx.payout.reference && <div className="offer-m__termrow"><span>Bank reference</span><span>{ctx.payout.reference}</span></div>}
        {invoice && <div className="offer-m__termrow"><span>Your invoice</span><span><a href={`/creator/deals/${dealId}/invoice`} target="_blank" rel="noopener noreferrer">{invoice.number} (PDF)</a></span></div>}
      </div>
    </section>
  ) : null
  // An extra offer waiting for an answer leads on the phone, as the desktop flags it at the top.
  const extraOpen = !open && (ctx.extras ?? []).some((x) => x.status === 'open')
  const mobileClosed = (
    <section className="offer-m__card">
      <div className="offer-m__label">Status</div>
      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', margin: '6px 0 0' }}>{noShoot ? 'This shoot did not go ahead for you.' : ctx.status === 'cancelled' ? 'Guapd withdrew this offer.' : 'You declined this offer.'}</p>
    </section>
  )

  // 0576: a collab post on the creator's own handle has the same verified
  // numbers as a deal post, on the same page. Only once one has a link.
  const anyPosted = collabPosts.some((p) => !!p.post_url)
  const analyticsHref = `/creator/deals/${dealId}/analytics`

  return (
    <>
      <CreatorOfferMobile
        isPosted={anyPosted}
        analyticsHref={anyPosted ? analyticsHref : undefined}
        brandName={brand}
        dealTitle={ctx.title ?? 'Shoot'}
        receivesPaise={total}
        totalPaise={m ? m.grossPaise : null}
        feePaise={m ? m.feePaise : null}
        feePercent={m ? m.platformPct : null}
        feeBasis={null}
        totalLabel={m ? `Your rate (${formatPaiseINR(m.dayRatePaise)}/day × ${m.days})` : 'Your rate'}
        extraTermRows={[
          ...(m ? [{ label: 'You take home', value: formatPaiseINR(m.netPaise) }] : []),
          ...(allowance > 0 ? [{ label: 'Travel and other allowance (no fee)', value: `+${formatPaiseINR(allowance)}` }] : []),
          { label: 'Brand', value: managed },
        ]}
        summaryRows={allowance > 0 ? [{ label: 'Allowance (no fee)', value: `+${formatPaiseINR(allowance)}` }] : []}
        paymentTerms={creatorSubmits ? 'Guapd pays you once your deliverables are approved' : 'Guapd pays you after the shoot'}
        paymentIn={creatorSubmits ? 'After approval' : 'After the shoot'}
        deliverBy={short(ctx.shoot_date)}
        waitingLabel={sentAt ? `Received ${short(sentAt)}` : 'Received'}
        items={items.map((i) => ({ id: i.id, label: i.label, pricePaise: 0, detail: [accepted && shot && !creatorSubmits ? (i.item_status === 'approved' ? 'Ready' : 'Being edited') : null, i.affiliate_link ? 'Affiliate link' : null].filter(Boolean).join(' · ') || null }))}
        hideItemPrices
        briefPitch={brief?.pitch ?? null}
        guidelines={(brief?.guidelines ?? '').split('\n').map((l) => l.trim()).filter(Boolean)}
        avoid={(brief?.avoid ?? '').split('\n').map((l) => l.trim()).filter(Boolean)}
        attachments={(brief?.attachments ?? []).map((a) => ({ name: a.name, url: attachmentUrls[a.storage_path] ?? null }))}
        usageRights={scopeLines.length ? scopeLines.join('. ') : null}
        counter={(() => {
          const cs = ctx.counters ?? []
          if (!open || cs.length === 0) return null
          const last = cs[cs.length - 1]
          const theirs = [...cs].reverse().find((c) => c.proposed_by === 'guapd')
          const mine = [...cs].reverse().find((c) => c.proposed_by === 'creator')
          return { lastBy: last.proposed_by === 'guapd' ? 'brand' : 'creator', theirPaise: theirs ? Number(theirs.net_paise) + allowance : total, youAskedPaise: mine ? Number(mine.net_paise) + allowance : null, at: short(last.created_at) }
        })()}
        revisionLimit={null}
        extraRevisionPaise={null}
        requiresShipment={false}
        unreadNotifications={unread}
        messageHref={`/creator/inbox?deal=${dealId}&from=deal`}
        messageLabel="Message Guapd"
        decision={answer(true)}
        stage={mStage}
        stageCopy={{
          line: declined || noShoot ? statusLabel : paid ? `Paid${ctx.payout?.paid_on ? ` ${short(ctx.payout.paid_on)}` : ''}` : open ? (sentAt ? `Received ${short(sentAt)}` : 'Received') : shootDate ? `Shoot ${short(ctx.shoot_date)}${ctx.shoot_city ? ` · ${ctx.shoot_city}` : ''}` : 'Agreed',
          label: declined || noShoot ? statusLabel : stages[paid ? stages.length - 1 : idx],
          next: paid ? 'Complete' : `Next: ${(stages[idx + 1] ?? 'paid').toLowerCase()}`,
          lit,
        }}
        agreedAt={short(agreedAt)}
        submitNode={creatorSubmits && accepted && items.length > 0 ? <LegDeliverables dealId={dealId} items={items} canSubmit={!!ctx.can_submit} /> : undefined}
        invoiceNode={(declined || noShoot) ? mobileClosed : (statement || mobileInvoice || (ctx.extras ?? []).length > 0 || (accepted && (collabPosts.length > 0 || Number(ctx.collab_waiting ?? 0) > 0)) || (accepted && shot && !!ctx.commission)) ? <>{extraOpen && <div style={{ marginBottom: 12 }}><ExtraOffers dealId={dealId} extras={ctx.extras ?? []} defaultName={creatorName} /></div>}{accepted && <div style={{ marginBottom: 12 }}><CollabPosts dealId={dealId} posts={collabPosts} brand={brand} waiting={Number(ctx.collab_waiting ?? 0)} /></div>}{accepted && shot && ctx.commission && <div style={{ marginBottom: 12 }}><AffiliateCommission dealId={dealId} c={ctx.commission} brand={brand} defaultName={creatorName} /></div>}{statement ?? mobileInvoice}{!extraOpen && (ctx.extras ?? []).length > 0 && <div style={{ display: 'grid', gap: 12, marginTop: 12 }}><ExtraOffers dealId={dealId} extras={ctx.extras ?? []} defaultName={creatorName} /></div>}</> : undefined}
        paidAt={short(ctx.payout?.paid_on)}
      />

      <main className="offer-desktop" style={wrapper}>
        <DealShellStyles />
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="frame reveal" style={{ width: '100%', maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 36 }}>

            <DealHeroCard brand={brand} brandLogo={ctx.brand_logo_url} meta={<>{ctx.title ?? 'Shoot'}{ctx.deal_ref ? ` · ${ctx.deal_ref}` : ''}{anyPosted && <>{' · '}<Link href={analyticsHref} style={{ color: 'var(--ink)', fontWeight: 700, textDecoration: 'none' }}>How your post did</Link></>}</>}
              headline={headline} subline={managed} chatLabel="Message Guapd"
              statusDot={dot} statusGlow={glow} statusLabel={statusLabel} statusLine={statusLine} />

            {/* 0555: an extra offer waiting for an answer is flagged at the top. */}
            {!open && (ctx.extras ?? []).some((x) => x.status === 'open') && (
              <ReadyToDecideBar title="New extra offer from Guapd" sub="The brand wants more from your shoot. Review it and answer." href={`#extra-${(ctx.extras ?? []).find((x) => x.status === 'open')?.number}`} />
            )}
            {open && <ReadyToDecideBar title={(ctx.counters ?? []).some((c) => c.status === 'open' && c.proposed_by === 'guapd') ? 'New counter from Guapd' : 'Ready to decide?'} sub="Scroll down to review terms and respond." />}

            {!declined && !noShoot && <CreatorStepper dealStatus={ctx.status} events={[]} track={track} />}

            {/* ── Offer / Agreed terms: the leg's own figures, on the shared terms card ── */}
            {!declined && !noShoot && (open || (accepted && !shot && !paid)) && (
              <TermsCard
                heading={open ? 'Offer terms' : 'Agreed terms'}
                agreedLabel={agreedAt ? `Agreed ${short(agreedAt)}, ${new Date(agreedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}` : null}
                title={whatYouMake}
                sub={`Shoot ${m ? `${m.days} day${m.days === 1 ? '' : 's'}` : 'day'}${ctx.shoot_city ? ` \u00B7 ${ctx.shoot_city}` : ''}`}
                side={[
                  { label: 'Shoot', value: short(ctx.shoot_date) ?? 'To be confirmed' },
                  ...(m ? [{ label: 'Your day rate', value: `${formatPaiseINR(m.dayRatePaise)} \u00D7 ${m.days}` }] : []),
                ]}
                receiveLabel={`You receive, ${creatorSubmits ? 'paid once your deliverables are approved' : 'paid after the shoot'}`}
                receive={total != null ? formatPaiseINR(total) : null}
              />
            )}

            {/* ── Deliverables: what you make, then the money and the answer ── */}
            {!declined && !noShoot && (
              <DeliverablesCard
                count={`${(ctx.deliverables ?? []).reduce((n, d) => n + Number(d.count), 0)} item${(ctx.deliverables ?? []).reduce((n, d) => n + Number(d.count), 0) === 1 ? '' : 's'}`}
                rows={(ctx.deliverables ?? []).map((d, i, all) => (
                  <DeliverableRow key={`${d.type}-${i}`} last={i === all.length - 1} icon="video"
                    label={countOf(Number(d.count), d.type)}
                    chips={i === 0 ? scopeChips : []} />
                ))}
              >
                {open && m && (<>
                  <MoneyRow label="Day rate × days" value={`${formatPaiseINR(m.dayRatePaise)}/day \u00D7 ${m.days}`} />
                  <MoneyRow label="Your rate" value={formatPaiseINR(m.grossPaise)} />
                  <MoneyRow label={`Platform fee (${m.platformPct}%)`} value={`\u2212${formatPaiseINR(m.feePaise)}`} />
                  {allowance > 0 && <MoneyRow label="Travel and other allowance (no fee)" value={`+${formatPaiseINR(allowance)}`} />}
                  <MoneyRow label="Total to you" value={formatPaiseINR(total ?? 0)} strong last />
                </>)}
                {counterRows.length > 0 && open && <div style={{ marginTop: 18 }}><div style={metaLabel}>Counters</div>{counterRows}</div>}
                {accepted && (shot || creatorSubmits) && items.length > 0 && (
                  // The read-only rows (MoneyRow) draw their own top line; a second one here doubled it.
                  <div style={creatorSubmits ? { marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-hairline, #EAEAE3)' } : { marginTop: 8 }} id="deliverables">
                    {creatorSubmits
                      ? <>{!shot && <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '0 0 10px' }}>You can submit once Guapd marks your shoot done.</p>}<LegDeliverables dealId={dealId} items={items} canSubmit={!!ctx.can_submit} /></>
                      : items.map((it) => <MoneyRow key={it.id} label={it.label} value={<span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-soft)' }}>{it.item_status === 'approved' ? 'Ready' : 'Guapd is preparing it'}</span>} />)}
                  </div>
                )}
                {open && <CardActions>{answer(false)}</CardActions>}
              </DeliverablesCard>
            )}

            {/* 0561: the videos to post as collabs or shared to post (0566: the invoice does not wait for them). */}
            {accepted && <CollabPosts dealId={dealId} posts={collabPosts} brand={brand} waiting={Number(ctx.collab_waiting ?? 0)} />}
            {/* 0563: the affiliate commission, once the collab ads have run. */}
            {accepted && shot && ctx.commission && <AffiliateCommission dealId={dealId} c={ctx.commission} brand={brand} defaultName={creatorName} />}

            {/* 0555: extra deliverables on this deal, each with its own invoice and payment. */}
            <ExtraOffers dealId={dealId} extras={ctx.extras ?? []} defaultName={creatorName} />

            {hasBrief && brief && (
              <div className="surface" style={{ padding: '26px 24px' }}>
                <div style={metaLabel}>{brand}{sentAt ? ` \u00B7 ${short(sentAt)}` : ''}{brief.locked ? ' \u00B7 final' : ''}</div>
                <h3 style={{ ...sectionHeading, marginTop: 8 }}>The brief in detail</h3>
                <BriefBlock pitch={brief.pitch} guidelines={brief.guidelines} avoid={brief.avoid} attachments={brief.attachments ?? []}
                  attachmentUrls={attachmentUrls} defaultOpen={open || accepted} attachedLabel="Attached by Guapd" />
              </div>
            )}

            {/* ── Payment: the invoice card's layout; Guapd pays, so nothing to raise ── */}
            {accepted && !noShoot && total != null && (() => {
              const p = ctx.payout
              const pill = paid ? 'Paid' : p?.status === 'approved' ? 'On the way' : p ? 'Being prepared' : invoice ? 'Invoice sent' : ctx.can_invoice ? 'Ready to invoice' : shot ? 'Next' : 'After the shoot'
              const dotC = paid ? 'var(--success, #16a34a)' : p || invoice ? 'var(--warning)' : ctx.can_invoice ? 'var(--neon-deep)' : 'var(--ink-faint)'
              const invoiceLink = invoice ? <a href={`/creator/deals/${dealId}/invoice`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>Invoice {invoice.number} (PDF)</a> : null
              const side = p
                ? [
                    { label: 'Your rate', value: formatPaiseINR(p.gross_paise) },
                    { label: `Platform fee (${Number(p.platform_pct)}%)`, value: `\u2212${formatPaiseINR(p.platform_fee_paise)}` },
                    ...(Number(p.allowance_paise ?? 0) > 0 ? [{ label: 'Allowance (no fee)', value: `+${formatPaiseINR(Number(p.allowance_paise))}` }] : []),
                    ...(p.tds_paise ? [{ label: 'TDS withheld', value: `\u2212${formatPaiseINR(p.tds_paise)}` }] : []),
                  ]
                : m ? [{ label: 'Your rate', value: formatPaiseINR(m.grossPaise) }, { label: `Platform fee (${m.platformPct}%)`, value: `\u2212${formatPaiseINR(m.feePaise)}` },
                    ...(allowance > 0 ? [{ label: 'Allowance (no fee)', value: `+${formatPaiseINR(allowance)}` }] : [])] : []
              return (
                <MoneyCard heading="Payment" pill={pill} pillDot={dotC}
                  helper={paid ? null : p ? (p.status === 'approved' ? 'Approved. Guapd is sending your payout.' : 'Guapd is preparing your payout.')
                    : invoice ? `You sent invoice ${invoice.number} on ${short(invoice.issued_at)}. Guapd pays you next.`
                    : ctx.can_invoice ? 'Guapd marked your shoot done. Confirm it and raise your invoice to get paid.'
                    : shot && creatorSubmits ? 'Once Guapd approves your deliverables, confirm the shoot and raise your invoice here.'
                    : 'After the shoot, confirm it here and raise your invoice to Guapd.'}
                  receiveLabel={paid ? 'You received' : 'You receive'}
                  receive={formatPaiseINR(p ? p.paid_paise : total)}
                  receiveSub={paid ? null : payRule}
                  side={side} paidBar={paid}
                  footer={ctx.can_invoice && total != null
                    ? <LegInvoiceForm dealId={dealId} payablePaise={total} payableLabel={formatPaiseINR(total)} shootLabel={shootDate ? `on ${shootDate}` : 'for this deal'} defaultName={creatorName} />
                    : paid ? <><span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Paid{p?.paid_on ? ` on ${short(p.paid_on)}` : ''}{p?.reference ? ` \u00B7 bank reference ${p.reference}` : ''}. This deal is wrapped.</span>{invoiceLink}</>
                    : invoiceLink ? <><span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Your invoice to Guapd</span>{invoiceLink}</> : undefined} />
              )
            })()}

            {(declined || noShoot) && (
              <div className="surface" style={{ padding: '22px 24px' }}>
                <h3 style={sectionHeading}>Status</h3>
                <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 8 }}>{noShoot ? 'This shoot did not go ahead for you.' : ctx.status === 'cancelled' ? 'Guapd withdrew this offer.' : 'You declined this offer.'}</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* The deal thread is with Guapd, never the brand. */}
      {(ctx.can_message || messages.length > 0) && (
        <CreatorThread dealId={dealId} dealStatus={ctx.status} initialMessages={messages} autoOpen={autoOpenChat} counterparty="Guapd" hideLauncher />
      )}
    </>
  )
}
