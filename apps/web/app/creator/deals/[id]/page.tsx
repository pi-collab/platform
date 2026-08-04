import { createClient } from '@/lib/supabase/server'
import { verifyCreator } from '@/lib/creator-auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import DeliverableItems from './DeliverableItems'
import SubmitDeliverable from './SubmitDeliverable'
import AcceptDecline from './AcceptDecline'
import InvoiceCard from './InvoiceCard'
import CreatorThread from './CreatorThread'
import PostedCard from './PostedCard'
import { calculateFee } from '@/lib/fee'
import RealtimeDealListener from '@/components/RealtimeDealListener'
import { getCampaignBriefForCreator } from './actions'

// ── Stage definitions (mirrors the deals list) ──
const STAGES = ['Offer received', 'Agreed', 'Submitted', 'Approved', 'Invoice', 'Paid'] as const
const STATUS_TO_STAGE: Record<string, number> = {
  negotiating: 0, agreed: 1, delivered: 2, revision: 2, approved: 3, paid: 4, complete: 5, declined: -1, cancelled: -1,
}

const STATUS_META: Record<string, { label: string; dot: string; glow: string }> = {
  negotiating: { label: 'Received',  dot: 'var(--warning)',  glow: 'color-mix(in oklab, var(--warning) 22%, transparent)' },
  agreed:      { label: 'Agreed',    dot: '#7E6BC4',         glow: 'rgba(126,107,196,.22)' },
  delivered:   { label: 'Submitted', dot: '#4C9E82',         glow: 'rgba(76,158,130,.22)' },
  revision:    { label: 'Revision',  dot: '#C89A3C',         glow: 'rgba(200,154,60,.22)' },
  approved:    { label: 'Approved',  dot: '#8FAF1F',         glow: 'rgba(143,175,31,.22)' },
  paid:        { label: 'Paid',      dot: '#1F8A5B',         glow: 'rgba(31,138,91,.22)' },
  complete:    { label: 'Complete',  dot: '#9AA08C',         glow: 'rgba(154,160,140,.22)' },
  declined:    { label: 'Declined',  dot: '#C4494F',         glow: 'rgba(196,73,79,.22)' },
  cancelled:   { label: 'Cancelled', dot: '#8B90A0',         glow: 'rgba(139,144,160,.22)' },
}

function formatINR(paise: number): string {
  const rupees = paise / 100
  const s = String(Math.round(rupees))
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  return '\u20B9' + (rest ? rest.replace(/\B(?=(\d\d)+(?!\d))/g, ',') + ',' + last3 : last3)
}

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) { const s = (rupees / 100000).toFixed(2).replace(/\.?0+$/, ''); return `\u20B9${s}L` }
  if (rupees >= 1000) return `\u20B9${(rupees / 1000).toFixed(0)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function formatDateLong(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function CreatorDealDetailPage({ params }: { params: { id: string } }) {
  await verifyCreator()
  const supabase = createClient()

  const [{ data: deal, error: dealError }, { data: deliverables }, { data: items }, { data: invoice }, { data: messages }] = await Promise.all([
    supabase
      .from('deals')
      .select('id, deal_ref, title, deliverables, price_paise, price_per_extra_revision_paise, fee_percent, fee_mode, status, timeline_date, revision_limit, revisions_used, usage_rights, payment_terms, agreed_at, created_at, requires_shipment, shipment_status, tracking_link, carrier_note, shipped_at, is_posted, posted_url, posted_at, usage_rights_end_date, rights_confirmed_at, brief_pitch, brief_guidelines, brands(name)')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('deliverables')
      .select('id, version, external_url, storage_path, filename, note, created_at')
      .eq('deal_id', params.id)
      .order('version', { ascending: false }),
    supabase
      .from('deal_deliverable_items')
      .select('id, label, platform, handle, item_status, external_url, storage_path, file_name, version, price_paise, reel_type, boosting_rights, boosting_duration_months, submitted_at, revision_note')
      .eq('deal_id', params.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('invoices')
      .select('id, status, base_paise, overage_paise, fee_paise, fee_percent, fee_mode, brand_pays_paise, creator_receives_paise, payment_terms, due_date, issued_at, accepted_at')
      .eq('deal_id', params.id)
      .maybeSingle(),
    supabase
      .from('messages')
      .select('id, deal_id, sender_party, body, created_at')
      .eq('deal_id', params.id)
      .order('created_at', { ascending: true }),
  ])

  if (dealError || !deal) notFound()

  const campaignBrief = await getCampaignBriefForCreator(params.id)

  const rawBrand = deal.brands as unknown
  const brand = (Array.isArray(rawBrand) ? rawBrand[0]?.name : (rawBrand as any)?.name) ?? 'Unknown brand'
  const canSubmit = deal.status === 'agreed' || deal.status === 'revision'
  const hasStructuredItems = items && items.length > 0
  const isNegotiating = deal.status === 'negotiating'
  const stageIndex = STATUS_TO_STAGE[deal.status] ?? 0
  const allDone = deal.status === 'complete'
  const sm = STATUS_META[deal.status] ?? STATUS_META.negotiating

  // Fee calculation
  const feeMode = (deal.fee_mode as 'on_top' | 'deducted') ?? 'on_top'
  const fee = deal.price_paise != null ? calculateFee(deal.price_paise, deal.fee_percent ?? 0, feeMode) : null
  const extra = Math.max(0, (deal.revisions_used ?? 0) - (deal.revision_limit ?? 0))
  const overage = extra * (deal.price_per_extra_revision_paise ?? 0)
  const creatorReceives = fee ? fee.creator_receives_paise + overage : null

  // Brief data
  const pitch = campaignBrief?.pitch ?? (deal as any).brief_pitch ?? null
  const guidelines = campaignBrief?.guidelines ?? (deal as any).brief_guidelines ?? null

  return (
    <main style={wrapper}>
      <RealtimeDealListener dealId={deal.id} />
      <style>{`
        .surface { border-radius: 20px; background: var(--card); box-shadow: 0 1px 2px rgba(22,23,15,.03), 0 8px 16px rgba(22,23,15,.04), 0 32px 64px rgba(22,23,15,.05); }
        .neonbtn { transition: filter .16s ease, transform .12s ease, box-shadow .16s ease; }
        .neonbtn:hover { filter: brightness(1.02); transform: translateY(-1px); box-shadow: 0 14px 28px -14px rgba(40,45,25,.55), inset 0 1px 0 rgba(255,255,255,.7); }
        .pill-hover { transition: background .16s ease, box-shadow .16s ease, transform .12s ease; }
        .pill-hover:hover { background: var(--card); box-shadow: 0 8px 18px -10px rgba(40,45,25,.4); transform: translateY(-1px); }
        .viewlink { transition: color .14s ease; cursor: pointer; }
        .viewlink:hover { color: var(--ink) !important; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .reveal { animation: fadeUp .6s cubic-bezier(.22,1,.36,1) backwards; }
      `}</style>

      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div className="frame reveal" style={{ width: '100%', maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 36 }}>

          {/* ── Editorial hero ── */}
          <div className="surface" style={{ padding: '28px 30px' }}>
            <Link href="/creator/deals" style={backLinkStyle}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              Back to deals
            </Link>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={metaLabel}>{deal.title || 'Untitled deal'}{deal.deal_ref ? ` \u00B7 ${deal.deal_ref}` : ''}</div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px,3.4vw,34px)', fontWeight: 700, letterSpacing: '-0.025em', margin: '8px 0 0' }}>
                  {isNegotiating ? 'Offer received from ' : 'Deal with '}
                  <span style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontWeight: 400 }}>{brand}</span>
                </h1>
              </div>
              <Link href="/creator/inbox" className="neonbtn" style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                height: 42, padding: '0 18px', borderRadius: 11,
                background: 'var(--neon)', border: 'none',
                boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
                fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, color: 'var(--ink)',
                textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                Message brand
              </Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border-hairline, #EAEAE3)', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: sm.dot, boxShadow: `0 0 0 4px ${sm.glow}` }} />
                {sm.label}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                Sent {formatDate(deal.created_at)}
                {deal.timeline_date && <>{' '}&middot; deliver by <b style={{ color: 'var(--ink)' }}>{formatDate(deal.timeline_date + 'T00:00:00')}</b></>}
              </span>
            </div>
          </div>

          {/* ── "Ready to decide?" CTA (negotiating only) ── */}
          {isNegotiating && (
            <div className="surface" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Ready to decide?</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>Accept, counter, or decline — the terms and actions are below.</div>
              </div>
              <a href="#decision" className="neonbtn" style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                height: 44, padding: '0 22px', borderRadius: 12,
                background: 'var(--neon)', border: 'none',
                fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 13, letterSpacing: '-0.01em', color: 'var(--ink)',
                boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
                textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                Ready to decide
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
              </a>
            </div>
          )}

          {/* ── Progress stepper ── */}
          <div className="surface" style={{ padding: '18px 16px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              {STAGES.map((label, i) => {
                const done = allDone || i < stageIndex
                const current = !allDone && i === stageIndex
                const leftBar = i > 0
                const rightBar = i < STAGES.length - 1
                const leftColor = (allDone || (i - 1) < stageIndex) ? 'var(--neon-deep)' : 'var(--border-hairline, #EAEAE3)'
                const rightColor = (allDone || i < stageIndex) ? 'var(--neon-deep)' : 'var(--border-hairline, #EAEAE3)'
                const dotStyle: React.CSSProperties = {
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  ...(done
                    ? { background: 'var(--neon-deep)', color: 'var(--ink)', border: '2px solid var(--card)', boxShadow: '0 0 0 2px var(--neon-deep), 0 5px 12px -4px rgba(180,210,60,.7)' }
                    : current
                      ? { background: 'var(--neon)', color: 'var(--ink)', border: '2px solid var(--card)', boxShadow: '0 0 0 2px var(--neon-deep), 0 0 0 6px rgba(232,255,102,.28)' }
                      : { background: 'var(--card)', color: 'var(--ink-faint)', border: '2px solid #C6D0DD', boxShadow: 'inset 0 1px 2px rgba(40,45,25,.06)' }),
                }
                return (
                  <div key={i} style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
                    <div style={{ position: 'relative', width: '100%', height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {leftBar && <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 'calc(50% - 15px)', height: 3, borderRadius: 3, background: leftColor }} />}
                      {rightBar && <span style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 'calc(50% - 15px)', height: 3, borderRadius: 3, background: rightColor }} />}
                      <span style={dotStyle}>
                        {done && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                        {current && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ink)' }} />}
                      </span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, fontWeight: current ? 700 : 600, whiteSpace: 'nowrap', color: done || current ? 'var(--ink)' : 'var(--ink-faint)' }}>
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
              <span />
              <span style={metaLabel}>
                {stageIndex < STAGES.length - 1 ? `Next \u00B7 ${STAGES[stageIndex + 1]?.toLowerCase() ?? ''}` : 'Complete'}
              </span>
            </div>
          </div>

          {/* ── Offer / Agreed terms ── */}
          <div className="surface" style={{ padding: 0, overflow: 'hidden', scrollMarginTop: 24 }} id="decision">
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <h3 style={sectionHeading}>{isNegotiating ? 'Offer terms' : 'Agreed terms'}</h3>
                {deal.agreed_at && <span style={metaRight}>Agreed {formatDateLong(deal.agreed_at)}</span>}
              </div>

              {/* Price hero */}
              {creatorReceives != null && (
                <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginTop: 22, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1.3, minWidth: 240, paddingRight: 32 }}>
                    <div style={metaLabel}>You receive</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 8 }}>
                      {formatINR(creatorReceives)}
                    </div>
                    {deal.payment_terms && (
                      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 8 }}>{deal.payment_terms}</div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 200, paddingLeft: 32, borderLeft: '1px solid var(--border-hairline, #EAEAE3)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
                    {deal.timeline_date && (
                      <div>
                        <div style={metaLabel}>Deliver by</div>
                        <div style={dateValue}>{formatDate(deal.timeline_date + 'T00:00:00')}</div>
                      </div>
                    )}
                    {deal.revision_limit != null && (
                      <div>
                        <div style={metaLabel}>Revisions</div>
                        <div style={dateValue}>{deal.revisions_used ?? 0} / {deal.revision_limit} rounds</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Deliverable items */}
            {hasStructuredItems && (
              <div style={{ padding: '22px 24px', borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                  <h3 style={sectionHeading}>Deliverables</h3>
                  <span style={metaRight}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ marginTop: 12 }}>
                  {items.map((item, idx) => (
                    <div key={item.id} style={{ display: 'flex', gap: 14, padding: '16px 0', borderBottom: idx < items.length - 1 ? '1px solid var(--border-hairline, #EAEAE3)' : 'none' }}>
                      <span style={itemIcon}>
                        {item.platform?.toLowerCase().includes('youtube') ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m10 8 6 4-6 4V8z" /><rect x="2" y="3" width="20" height="18" rx="4" /></svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                        )}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14 }}>
                          <h4 style={{ fontSize: 14.5, fontWeight: 700, margin: 0 }}>{item.label}</h4>
                          {item.price_paise != null && item.price_paise > 0 && (
                            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>{formatINR(item.price_paise)}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 9 }}>
                          <span style={chipStyle}>{item.platform} {item.handle?.startsWith('@') ? item.handle : `@${item.handle}`}</span>
                          {item.reel_type && <span style={chipStyle}>{item.reel_type === 'collab' ? 'Collab' : 'Non-collab'}</span>}
                          {item.boosting_rights && <span style={chipStyle}>Boosting {item.boosting_duration_months ? `${item.boosting_duration_months}mo` : '\u221E'}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Fee + total breakdown */}
                {fee && (
                  <>
                    {feeMode === 'on_top' && fee.fee_paise > 0 && (
                      <div style={termRow}>
                        <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Platform fee ({fee.fee_percent}%), paid by the brand</span>
                        <b style={{ fontSize: 14, fontWeight: 700 }}>{formatINR(fee.fee_paise)}</b>
                      </div>
                    )}
                    {feeMode === 'deducted' && fee.fee_paise > 0 && (
                      <div style={termRow}>
                        <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Platform fee ({fee.fee_percent}%)</span>
                        <b style={{ fontSize: 14, fontWeight: 700 }}>{formatINR(fee.fee_paise)}</b>
                      </div>
                    )}
                    {deal.price_paise != null && (
                      <div style={{ ...termRow, borderBottom: 'none' }}>
                        <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Deal total</span>
                        <b style={{ fontSize: 14, fontWeight: 700 }}>{formatINR(fee.brand_pays_paise)}</b>
                      </div>
                    )}
                  </>
                )}

                {/* "You receive" highlight */}
                {creatorReceives != null && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
                    padding: '18px 22px', marginTop: 22, borderRadius: 14,
                    border: '1.5px solid var(--neon-deep)', background: 'color-mix(in oklab, var(--neon) 14%, var(--card))',
                  }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                      You receive{deal.payment_terms ? `, ${deal.payment_terms.toLowerCase()}` : ''}
                    </span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, fontSize: 28, color: 'var(--ink)' }}>
                      {formatINR(creatorReceives)}
                    </span>
                  </div>
                )}

                {/* Accept / Counter / Decline actions */}
                {isNegotiating && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', paddingTop: 22, marginTop: 22, borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, maxWidth: 380 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                      <div>
                        <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-soft)' }}>
                          Accepting locks the terms above. You can also decline if this isn&apos;t for you.
                        </span>
                      </div>
                    </div>
                    <AcceptDecline dealId={deal.id} />
                  </div>
                )}
              </div>
            )}

            {/* Non-structured terms fallback */}
            {!hasStructuredItems && (
              <div style={{ padding: '22px 24px', borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {deal.deliverables && <TermRow label="Deliverables" value={deal.deliverables} />}
                  {deal.usage_rights && <TermRow label="Usage rights" value={deal.usage_rights} />}
                  {deal.usage_rights_end_date && <TermRow label="Usage rights expire" value={formatDate(deal.usage_rights_end_date + 'T00:00:00')} />}
                  {deal.rights_confirmed_at && <TermRow label="Rights confirmed" value={formatDateLong(deal.rights_confirmed_at)} />}
                  {deal.revision_limit != null && <TermRow label="Revisions" value={`${deal.revisions_used ?? 0} / ${deal.revision_limit} rounds`} />}
                  {(deal.price_per_extra_revision_paise ?? 0) > 0 && <TermRow label="Per extra revision" value={formatRupees(deal.price_per_extra_revision_paise)} />}
                  {deal.payment_terms && <TermRow label="Payment terms" value={deal.payment_terms} />}
                  {deal.requires_shipment && <TermRow label="Product kit" value="A product kit will be sent to you" />}
                </div>

                {/* Accept / Decline for non-structured items */}
                {isNegotiating && (
                  <div style={{ paddingTop: 22, marginTop: 22, borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
                    <AcceptDecline dealId={deal.id} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Brief section ── */}
          {(pitch || guidelines) && (
            <div className="surface" style={{ padding: '22px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <h3 style={sectionHeading}>The brief in detail</h3>
                <span style={metaRight}>{brand} &middot; {formatDate(deal.created_at)}</span>
              </div>
              {pitch && (
                <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 32, paddingTop: 34, borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
                  <div style={metaLabel}>The brief</div>
                  <p style={{ fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-soft)', margin: 0, maxWidth: 620 }}>{pitch}</p>
                </div>
              )}
              {guidelines && (
                <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 36, paddingTop: 34, borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
                  <div style={metaLabel}>Creative guidelines</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {guidelines.split('\n').filter(Boolean).map((line: string, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <span style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: 'var(--ink)', color: '#FFFFFF' }}>{i + 1}</span>
                        <span style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{line}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Structured deliverable items (submit/track section) ── */}
          {hasStructuredItems && !isNegotiating && (
            <div className="surface" style={{ padding: '22px 24px' }}>
              <h3 style={sectionHeading}>Deliverable progress</h3>
              <DeliverableItems dealId={deal.id} items={items} canSubmit={canSubmit} />
            </div>
          )}

          {/* ── Legacy deliverables ── */}
          {!hasStructuredItems && !isNegotiating && (
            <div className="surface" style={{ padding: '22px 24px' }}>
              <h3 style={sectionHeading}>Deliverables</h3>
              {deliverables && deliverables.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {deliverables.map((d) => (
                    <div key={d.id} style={{ padding: 12, border: '1px solid var(--border-hairline, #EAEAE3)', borderRadius: 14, background: 'var(--card)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>v{d.version}</span>
                          {d.note && <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}> — {d.note}</span>}
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{formatDate(d.created_at)}</span>
                      </div>
                      {d.external_url && (
                        <a href={d.external_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#2563eb', wordBreak: 'break-all', marginTop: 4, display: 'block' }}>
                          {d.external_url.length > 60 ? d.external_url.slice(0, 60) + '...' : d.external_url}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {(!deliverables || deliverables.length === 0) && !canSubmit && (
                <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>No deliverables submitted yet.</p>
              )}
              {canSubmit && <SubmitDeliverable dealId={deal.id} />}
            </div>
          )}

          {/* ── Invoice ── */}
          {(deal.status === 'approved' || deal.status === 'paid' || deal.status === 'complete') && (
            <div className="surface" style={{ padding: '22px 24px' }}>
              <InvoiceCard dealId={deal.id} dealRef={deal.deal_ref} invoice={invoice} isPosted={deal.is_posted} />
            </div>
          )}

          {/* ── Shipment info ── */}
          {deal.requires_shipment && deal.shipment_status && !['negotiating', 'declined', 'cancelled'].includes(deal.status) && (
            <div className="surface" style={{ padding: '22px 24px' }}>
              <h3 style={sectionHeading}>Product Shipment</h3>
              {deal.shipment_status === 'pending' && (
                <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M16 16V4H2v12h14zM16 8h4l2 4v4h-6" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="18.5" cy="18.5" r="2" /></svg>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>A product kit will be sent to you</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>The brand is preparing your shipment.</div>
                  </div>
                </div>
              )}
              {deal.shipment_status === 'shipped' && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', margin: '0 0 4px' }}>
                    Product shipped{deal.shipped_at && ` on ${formatDate(deal.shipped_at)}`}
                  </p>
                  {deal.tracking_link && (
                    <a href={deal.tracking_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#2563eb', wordBreak: 'break-all', display: 'block' }}>Track shipment</a>
                  )}
                  {deal.carrier_note && <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '4px 0 0' }}>{deal.carrier_note}</p>}
                </div>
              )}
              {deal.shipment_status === 'delivered' && (
                <p style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', margin: 0 }}>Product delivered</p>
              )}
            </div>
          )}

          {/* ── Posted ── */}
          {(['approved', 'paid', 'complete'].includes(deal.status)) && !deal.is_posted && (
            <div className="surface" style={{ padding: '22px 24px' }}>
              <PostedCard dealId={deal.id} />
            </div>
          )}
          {deal.is_posted && deal.posted_url && (
            <div className="surface" style={{ padding: '22px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#16a34a', boxShadow: '0 0 0 4px rgba(22,163,74,.18)' }} />
                <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>Content Posted</span>
              </div>
              <a href={deal.posted_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#2563eb', wordBreak: 'break-all', marginTop: 8, display: 'block' }}>
                {deal.posted_url.length > 60 ? deal.posted_url.slice(0, 60) + '...' : deal.posted_url}
              </a>
              {deal.posted_at && <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}>Posted {formatDateLong(deal.posted_at)}</div>}
            </div>
          )}

          {/* ── Chat thread ── */}
          <CreatorThread dealId={deal.id} dealStatus={deal.status} initialMessages={messages ?? []} />

        </div>
      </div>
    </main>
  )
}

function TermRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '11px 0', borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
      <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{label}</span>
      <b style={{ fontSize: 14, fontWeight: 700 }}>{value}</b>
    </div>
  )
}

/* ── Style fragments ── */

const wrapper: React.CSSProperties = {
  flex: 1, minWidth: 0,
  padding: 'clamp(18px,2.4vw,30px) clamp(22px,4vw,56px) clamp(56px,6vw,96px)',
}

const backLinkStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)',
  textDecoration: 'none', whiteSpace: 'nowrap',
}

const metaLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)',
}

const sectionHeading: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0,
}

const metaRight: React.CSSProperties = {
  fontSize: 11.5, color: 'var(--ink-soft)',
}

const dateValue: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginTop: 5,
}

const termRow: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14,
  padding: '13px 0', marginTop: 6, borderTop: '1px solid var(--border-hairline, #EAEAE3)',
}

const itemIcon: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 11, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)',
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '5px 11px', borderRadius: 999,
  background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)',
  fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)',
}
