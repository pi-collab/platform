import { formatPaiseINR } from '@/lib/money'
import { countOf } from '@/lib/experience-request'
import type { CreatorLegContext } from '@/lib/creator-leg-money'
import { creatorLegMoney } from '@/lib/creator-leg-money'
import CreatorOfferMobile from '@/components/CreatorOfferMobile'
import AcceptDecline from './AcceptDecline'
import CreatorStepper, { type StepperTrack } from './CreatorStepper'
import LegDeliverables from './LegDeliverables'
import BriefBlock from './BriefBlock'
import CreatorThread from './CreatorThread'
import { DealHeroCard, DealShellStyles, wrapper, metaLabel, sectionHeading, termRow } from './deal-shell'
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

export default function CreatorLegView({ dealId, ctx, attachmentUrls = {}, messages = [], events = [], autoOpenChat = false, unread = 0 }: {
  dealId: string
  ctx: CreatorLegContext
  attachmentUrls?: Record<string, string>
  messages?: Msg[]
  events?: Ev[]
  autoOpenChat?: boolean
  unread?: number
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
  const items = ctx.items ?? []
  const brand = ctx.brand_name ?? 'A brand'
  const managed = `${brand} · Managed by Guapd`
  const brief = ctx.brief_detail
  const hasBrief = !!brief && !!(brief.pitch || brief.guidelines || brief.avoid || (brief.attachments ?? []).length > 0)
  const shootDate = ctx.shoot_date ? new Date(`${ctx.shoot_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null
  const scopeLines = [
    (ctx.affiliate_count ?? 0) > 0 ? `${ctx.affiliate_count} of your ${ctx.videos} video${ctx.videos === 1 ? '' : 's'} carr${ctx.affiliate_count === 1 ? 'ies' : 'y'} the brand's affiliate link` : null,
    (ctx.ad_rights_videos ?? 0) > 0 ? `The brand may run ${ctx.ad_rights_videos} as ads${ctx.ad_rights_months != null ? ` for ${ctx.ad_rights_months} month${ctx.ad_rights_months === 1 ? '' : 's'}` : ''}` : null,
    (ctx.boost_videos ?? 0) > 0 ? `The brand may boost ${ctx.boost_videos}${ctx.boost_months != null ? ` for ${ctx.boost_months} month${ctx.boost_months === 1 ? '' : 's'}` : ''}` : null,
  ].filter(Boolean) as string[]

  // ── The leg's own stages, on the same tracker ──
  const stages = creatorSubmits ? ['Offer received', 'Accepted', 'Shoot', 'Deliverables', 'Paid'] : ['Offer received', 'Accepted', 'Shoot', 'Paid']
  const idx = open ? 0 : !shot ? 1 : creatorSubmits && !ctx.work_complete ? 3 : stages.length - 1
  const statusOf = (to: string) => events.filter((e) => e.event_type === 'deal.status_changed' && (e.detail?.to === to || e.detail?.new_status === to)).pop()?.created_at
  const dates: Record<number, string> = {}
  const sentAt = events.find((e) => e.event_type === 'experience.leg_sent')?.created_at
  if (sentAt) dates[0] = sentAt
  const agreedAt = statusOf('agreed'); if (agreedAt) dates[1] = agreedAt
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
    : shot ? <>{ctx.work_complete ? 'Your part is complete · Guapd pays you next' : 'Shot · Guapd is reviewing your deliverables'}</>
    : declined ? <>This offer is closed</>
    : <>Agreed{shootDate ? <> &middot; shoot on <b style={{ color: 'var(--ink)' }}>{shootDate}</b>{ctx.shoot_city ? ` in ${ctx.shoot_city}` : ''}</> : ''}</>
  const dot = paid ? 'var(--neon)' : open ? 'var(--warning)' : declined ? '#C4494F' : '#7E6BC4'
  const glow = paid ? 'color-mix(in oklab, var(--neon) 22%, transparent)' : open ? 'color-mix(in oklab, var(--warning) 22%, transparent)' : declined ? 'rgba(196,73,79,.22)' : 'rgba(126,107,196,.22)'

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
      </div>
    </section>
  ) : null

  return (
    <>
      <CreatorOfferMobile
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
        items={items.map((i) => ({ id: i.id, label: i.label, pricePaise: 0, detail: i.affiliate_link ? 'Carries the brand’s affiliate link' : null }))}
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
          line: paid ? `Paid${ctx.payout?.paid_on ? ` ${short(ctx.payout.paid_on)}` : ''}` : open ? (sentAt ? `Received ${short(sentAt)}` : 'Received') : shootDate ? `Shoot ${short(ctx.shoot_date)}${ctx.shoot_city ? ` · ${ctx.shoot_city}` : ''}` : 'Agreed',
          label: stages[paid ? stages.length - 1 : idx],
          next: paid ? 'Complete' : `Next: ${(stages[idx + 1] ?? 'paid').toLowerCase()}`,
          lit,
        }}
        agreedAt={short(agreedAt)}
        submitNode={creatorSubmits && accepted && items.length > 0 ? <LegDeliverables dealId={dealId} items={items} canSubmit={!!ctx.can_submit} /> : undefined}
        invoiceNode={statement ?? undefined}
        paidAt={short(ctx.payout?.paid_on)}
      />

      <main className="offer-desktop" style={wrapper}>
        <DealShellStyles />
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="frame reveal" style={{ width: '100%', maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 36 }}>

            <DealHeroCard brand={brand} brandLogo={ctx.brand_logo_url} meta={<>{ctx.title ?? 'Shoot'}{ctx.deal_ref ? ` · ${ctx.deal_ref}` : ''}</>}
              headline={headline} subline={managed} chatLabel="Message Guapd"
              statusDot={dot} statusGlow={glow} statusLabel={statusLabel} statusLine={statusLine} />

            {!declined && !noShoot && <CreatorStepper dealStatus={ctx.status} events={[]} track={track} />}

            {/* ── Offer / Agreed terms: the leg's own figures ── */}
            <div className="surface" style={{ padding: 0, overflow: 'hidden', scrollMarginTop: 24 }} id="decision">
              <div style={{ padding: '26px 28px' }}>
                <h3 style={sectionHeading}>{open ? 'Offer terms' : 'Agreed terms'}</h3>
                <div style={{ marginTop: 12 }}>
                  {m ? (<>
                    <div style={termRow}><span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Day rate × days</span><b style={{ fontSize: 14 }}>{formatPaiseINR(m.dayRatePaise)}/day × {m.days}</b></div>
                    <div style={termRow}><span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Your rate</span><b style={{ fontSize: 14 }}>{formatPaiseINR(m.grossPaise)}</b></div>
                    <div style={termRow}><span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Guapd platform fee ({m.platformPct}%, {m.trackName})</span><b style={{ fontSize: 14 }}>−{formatPaiseINR(m.feePaise)}</b></div>
                    <div style={termRow}><span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>You take home</span><b style={{ fontSize: 14 }}>{formatPaiseINR(m.netPaise)}</b></div>
                    {allowance > 0 && <div style={termRow}><span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Travel and other allowance (no fee)</span><b style={{ fontSize: 14 }}>+{formatPaiseINR(allowance)}</b></div>}
                    <div style={termRow}><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Total to you</span><b style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>{formatPaiseINR(total ?? 0)}</b></div>
                  </>) : <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Your terms are being prepared.</p>}
                  <div style={termRow}><span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>What you make</span><b style={{ fontSize: 14, textAlign: 'right' }}>{(ctx.deliverables ?? []).map((d) => countOf(Number(d.count), d.type)).join(' · ') || '—'}</b></div>
                  {scopeLines.map((l) => <div key={l} style={termRow}><span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{l}</span><span /></div>)}
                  <div style={termRow}><span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Shoot</span><b style={{ fontSize: 14 }}>{shootDate ?? 'To be confirmed'}{ctx.shoot_city ? ` · ${ctx.shoot_city}` : ''}</b></div>
                  <div style={termRow}><span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Payment</span><b style={{ fontSize: 14 }}>{creatorSubmits ? 'Guapd pays you once your deliverables are approved' : 'Guapd pays you after the shoot'}</b></div>
                  {counterRows.length > 0 && <div style={{ marginTop: 18 }}><div style={metaLabel}>Counters</div>{counterRows}</div>}
                </div>
              </div>
              {open && <div style={{ padding: '20px 28px 26px', borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>{answer(false)}</div>}
            </div>

            {hasBrief && brief && (
              <div className="surface" style={{ padding: '26px 24px' }}>
                <div style={metaLabel}>{managed}{brief.locked ? ' · final' : ' · Guapd may update it until the shoot is confirmed'}</div>
                <h3 style={{ ...sectionHeading, marginTop: 8 }}>The brief in detail</h3>
                <BriefBlock pitch={brief.pitch} guidelines={brief.guidelines} avoid={brief.avoid} attachments={brief.attachments ?? []}
                  attachmentUrls={attachmentUrls} defaultOpen={open || accepted} attachedLabel="Attached by Guapd" />
              </div>
            )}

            {accepted && items.length > 0 && (shot || creatorSubmits) && !noShoot && (
              <div className="surface" style={{ padding: '26px 24px' }} id="deliverables">
                <h3 style={sectionHeading}>Your deliverables</h3>
                <div style={{ marginTop: 14 }}>
                  {creatorSubmits
                    ? <>{!shot && <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>You can submit once Guapd marks your shoot done.</p>}<LegDeliverables dealId={dealId} items={items} canSubmit={!!ctx.can_submit} /></>
                    : items.map((i) => <div key={i.id} style={termRow}><span style={{ fontSize: 13.5 }}>{i.label}</span><span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{i.item_status === 'approved' ? 'Ready' : 'Guapd is preparing it'}</span></div>)}
                </div>
              </div>
            )}

            {accepted && shot && ctx.payout && (
              <div className="surface" style={{ padding: '26px 24px' }}>
                <h3 style={sectionHeading}>Your payout</h3>
                <div style={{ marginTop: 10 }}>
                  <div style={termRow}><span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Your rate</span><b>{formatPaiseINR(ctx.payout.gross_paise)}</b></div>
                  <div style={termRow}><span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Guapd platform fee ({Number(ctx.payout.platform_pct)}%)</span><b>−{formatPaiseINR(ctx.payout.platform_fee_paise)}</b></div>
                  <div style={termRow}><span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Your net</span><b>{formatPaiseINR(ctx.payout.net_paise)}</b></div>
                  {Number(ctx.payout.allowance_paise ?? 0) > 0 && <div style={termRow}><span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Allowance (no fee)</span><b>+{formatPaiseINR(Number(ctx.payout.allowance_paise))}</b></div>}
                  <div style={termRow}><span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>TDS withheld</span><b>{ctx.payout.tds_paise ? `−${formatPaiseINR(ctx.payout.tds_paise)}` : formatPaiseINR(0)}</b></div>
                  <div style={termRow}><span style={{ fontSize: 13, fontWeight: 700 }}>{paid ? 'Paid to you' : 'To be paid to you'}</span><b style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>{formatPaiseINR(ctx.payout.paid_paise)}</b></div>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 12 }}>{paid ? `Paid${ctx.payout.paid_on ? ` on ${short(ctx.payout.paid_on)}` : ''}. Bank reference: ${ctx.payout.reference}.` : ctx.payout.status === 'requested' ? 'Guapd is preparing your payout.' : 'Approved. Guapd is sending your payout.'}</p>
              </div>
            )}

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
