import Link from 'next/link'
import BrandMark from '@/components/BrandMark'
import { formatPaiseINR } from '@/lib/money'
import { countOf } from '@/lib/experience-request'
import type { CreatorLegContext } from '@/lib/creator-leg-money'
import { creatorLegMoney } from '@/lib/creator-leg-money'
import LegRespond from './LegRespond'
import './creator-leg.css'

/**
 * A Guapd Experience creator leg, as the creator sees it. One responsive
 * component for desktop and mobile, replacing the marketplace deal page, whose
 * money, counter, invoice, upload and posting steps do not apply to a leg.
 *
 * Everything comes from creator_leg_context (0534), which returns the caller's
 * OWN leg only: the brand's name and logo, shoot date and city, the brief
 * Guapd wrote for creators, their scope and their frozen terms. Never the
 * brand's price, other creators, costs or margin.
 */
export default function CreatorLegView({ dealId, ctx }: { dealId: string; ctx: CreatorLegContext }) {
  const m = creatorLegMoney(ctx)
  const open = ctx.status === 'negotiating'
  const accepted = ctx.status === 'agreed'
  const declined = ctx.status === 'declined' || ctx.status === 'cancelled'
  const date = ctx.shoot_date ? new Date(`${ctx.shoot_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null

  return (
    <div className="leg-page">
      <div className="leg-frame">
        <section className="surface leg-hero">
          <Link href="/creator/deals" className="leg-back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            Back to deals
          </Link>
          <div className="leg-hero-row">
            <BrandMark name={ctx.brand_name ?? 'Brand'} logoUrl={ctx.brand_logo_url} style={{
              width: 52, height: 52, borderRadius: 15, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--sec-ink)', background: 'var(--sec-2)', border: '1px solid var(--frost-edge)',
            }} />
            <div style={{ minWidth: 0 }}>
              <div className="leg-meta">{ctx.title ?? 'Shoot'}{ctx.deal_ref ? ` · ${ctx.deal_ref}` : ''}</div>
              <h1 className="leg-h1">
                {open ? 'Shoot offer from ' : accepted ? 'Shoot booked with ' : declined ? 'Offer from ' : 'Shoot with '}
                <span className="leg-serif">{ctx.brand_name ?? 'a brand'}</span>
              </h1>
              <div className="leg-managed">{ctx.brand_name ?? 'Brand'} · Managed by Guapd</div>
            </div>
          </div>
        </section>

        <div className="leg-grid">
          <section className="surface leg-card" aria-labelledby="leg-money">
            <h2 id="leg-money" className="leg-h2">What you make</h2>
            {m ? (
              <dl className="leg-rows">
                <div><dt>Day rate</dt><dd>{formatPaiseINR(m.dayRatePaise)}/day</dd></div>
                <div><dt>Days</dt><dd>{m.days}</dd></div>
                <div><dt>Total</dt><dd>{formatPaiseINR(m.grossPaise)}</dd></div>
                <div><dt>Guapd platform fee ({m.platformPct}%, {m.trackName})</dt><dd>−{formatPaiseINR(m.feePaise)}</dd></div>
                <div className="leg-total"><dt>You take home</dt><dd>{formatPaiseINR(m.netPaise)}</dd></div>
              </dl>
            ) : <p className="leg-body">Your terms are being prepared.</p>}
            <p className="leg-note">Guapd pays you after the shoot. Nothing is paid through this page yet; Guapd records your payout and tells you when it is sent.</p>
          </section>

          <section className="surface leg-card" aria-labelledby="leg-scope">
            <h2 id="leg-scope" className="leg-h2">What you make for the brand</h2>
            <ul className="leg-list">
              {(ctx.deliverables ?? []).map((d) => <li key={d.type}>{countOf(Number(d.count), d.type)}</li>)}
            </ul>
            {(ctx.affiliate_count ?? 0) > 0 && <p className="leg-body">{ctx.affiliate_count} of your {ctx.videos} video{ctx.videos === 1 ? '' : 's'} carr{ctx.affiliate_count === 1 ? 'ies' : 'y'} the brand&apos;s affiliate link.</p>}
            {ctx.ad_rights_months != null && <p className="leg-body">The brand may run {ctx.ad_rights_videos} of them as ads for {ctx.ad_rights_months} month{ctx.ad_rights_months === 1 ? '' : 's'}.</p>}
            {ctx.boost_months != null && <p className="leg-body">The brand may boost {ctx.boost_videos} of them for {ctx.boost_months} month{ctx.boost_months === 1 ? '' : 's'}.</p>}
            <dl className="leg-rows leg-rows-plain">
              <div><dt>Shoot date</dt><dd>{date ?? 'To be confirmed'}</dd></div>
              <div><dt>City</dt><dd>{ctx.shoot_city ?? 'To be confirmed'}</dd></div>
            </dl>
            <p className="leg-note">Guapd runs the shoot and delivers the content to the brand. There is nothing for you to upload here.</p>
          </section>
        </div>

        {ctx.brief && (
          <section className="surface leg-card" aria-labelledby="leg-brief">
            <h2 id="leg-brief" className="leg-h2">The brief</h2>
            <p className="leg-body" style={{ whiteSpace: 'pre-wrap' }}>{ctx.brief}</p>
          </section>
        )}

        <section className="surface leg-card" id="decision" aria-labelledby="leg-decision">
          <h2 id="leg-decision" className="leg-h2">{open ? 'Your answer' : 'Status'}</h2>
          {open && <LegRespond dealId={dealId} netLabel={m ? formatPaiseINR(m.netPaise) : null} />}
          {accepted && <p className="leg-body">You accepted this shoot. Guapd will confirm the details with you before the day.</p>}
          {declined && <p className="leg-body">You declined this offer.</p>}
          {!open && !accepted && !declined && <p className="leg-body">This shoot is under way with Guapd.</p>}
          <p className="leg-note">Questions about this shoot? Write to contact@guapd.com.</p>
        </section>
      </div>
    </div>
  )
}
