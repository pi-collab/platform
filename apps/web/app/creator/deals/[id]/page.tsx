import { createClient } from '@/lib/supabase/server'
import { verifyCreator } from '@/lib/creator-auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import CreatorThread from './CreatorThread'
import OpenDealChat from '@/components/OpenDealChat'
import DeliverableItems from './DeliverableItems'
import SubmitDeliverable from './SubmitDeliverable'
import AcceptDecline from './AcceptDecline'
import CreatorOfferMobile from '@/components/CreatorOfferMobile'
import { unreadNotificationCount } from '@/lib/unread'
import InvoiceCard from './InvoiceCard'
import PostedCard from './PostedCard'
import { calculateFee } from '@/lib/fee'
import { revisionTerms, revisionLabel } from '@/lib/revisions'
import DealBreakdown, { hasAddons, type BreakdownItem } from '@/components/DealBreakdown'
import NegotiationHistory from '@/components/NegotiationHistory'
import RealtimeDealListener from '@/components/RealtimeDealListener'
import { getCampaignBriefForCreator } from './actions'
import BriefDetailsToggle from '@/app/deals/[id]/BriefDetailsToggle'
import ShippingAddressForm from './ShippingAddressForm'
import CreatorStepper from './CreatorStepper'
import CreatorReviewCard from './CreatorReviewCard'

// ── Stage definitions (mirrors the deals list) ──
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

function formatDateWithTime(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getDate()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${day} ${months[d.getMonth()]}, ${h12}:${m} ${ampm}`
}

export default async function CreatorDealDetailPage({ params, searchParams }: {
  params: { id: string }
  searchParams: { chat?: string }
}) {
  // Pass the deal path so a logged-out creator arriving from a WhatsApp
  // notification returns to THIS deal after signing in, not the deals list.
  const { profileId } = await verifyCreator(`/creator/deals/${params.id}`)
  const supabase = createClient()

  const [{ data: deal, error: dealError }, { data: deliverables }, { data: items }, { data: invoice }, { data: events }, { data: messages }] = await Promise.all([
    supabase
      .from('deals')
      .select('id, deal_ref, title, deliverables, price_paise, price_per_extra_revision_paise, fee_percent, fee_mode, status, timeline_date, revision_limit, revisions_used, usage_rights, payment_terms, agreed_at, created_at, requires_shipment, shipment_status, tracking_link, carrier_note, shipped_at, shipping_address, is_posted, posted_url, posted_at, usage_rights_end_date, rights_confirmed_at, completed_at, brief_pitch, brief_guidelines, brief_avoid, brief_attachments, brands(name)')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('deliverables')
      .select('id, version, external_url, storage_path, filename, note, created_at')
      .eq('deal_id', params.id)
      .order('version', { ascending: false }),
    supabase
      .from('deal_deliverable_items')
      .select('id, label, platform, handle, item_status, external_url, storage_path, file_name, version, price_paise, reel_type, boosting_rights, boosting_duration_months, collab_charge_paise, collab_rate_type, collab_rate_value, boosting_days, boosting_charge_paise, boosting_30day_paise, submitted_at, approved_at, updated_at, revision_note, posted_url, posted_at')
      .eq('deal_id', params.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('invoices')
      .select('id, status, base_paise, overage_paise, fee_paise, fee_percent, fee_mode, brand_pays_paise, creator_receives_paise, payment_terms, due_date, issued_at, accepted_at, paid_at')
      .eq('deal_id', params.id)
      .maybeSingle(),
    supabase
      .from('events')
      .select('id, event_type, detail, created_at')
      .eq('deal_id', params.id)
      .order('created_at', { ascending: true }),
    // The thread. This page had no messages query at all, which is why the
    // creator's Message button could only send them to the inbox.
    supabase
      .from('messages')
      .select('id, deal_id, sender_party, body, created_at')
      .eq('deal_id', params.id)
      .order('created_at', { ascending: true }),
  ])

  if (dealError || !deal) notFound()

  // Fetch creator's own review (if any) — table may not exist yet pre-migration
  let existingReview: { rating: number; note: string | null } | null = null
  if (['paid', 'complete'].includes(deal.status)) {
    const { data: review } = await supabase
      .from('deal_reviews')
      .select('rating, note')
      .eq('deal_id', params.id)
      .eq('reviewer_role', 'creator')
      .maybeSingle()
    existingReview = review
  }

  const campaignBrief = await getCampaignBriefForCreator(params.id)

  const rawBrand = deal.brands as unknown
  const brand = (Array.isArray(rawBrand) ? rawBrand[0]?.name : (rawBrand as any)?.name) ?? 'Unknown brand'
  const canSubmit = deal.status === 'agreed' || deal.status === 'revision'
  const hasStructuredItems = items && items.length > 0
  const isNegotiating = deal.status === 'negotiating'
  const sm = STATUS_META[deal.status] ?? STATUS_META.negotiating
  const invoiceIssuedOrLater = invoice && (invoice.status === 'issued' || invoice.status === 'accepted' || invoice.status === 'paid')
  const isCompleted = invoice?.status === 'paid' || (!invoice && (deal.status === 'paid' || deal.status === 'complete'))

  // Fee calculation
  const feeMode = (deal.fee_mode as 'on_top' | 'deducted') ?? 'on_top'

  // Deliverable rows in the shape the shared breakdown reads.
  const itemsForBreakdown = (items ?? []) as unknown as BreakdownItem[]

  const fee = deal.price_paise != null ? calculateFee(deal.price_paise, deal.fee_percent ?? 0, feeMode) : null
  const revTerms = revisionTerms(deal.revision_limit, deal.price_per_extra_revision_paise)
  const extra = revTerms.unlimited ? 0 : Math.max(0, (deal.revisions_used ?? 0) - revTerms.limit)
  const overage = extra * (deal.price_per_extra_revision_paise ?? 0)
  const creatorReceives = fee ? fee.creator_receives_paise + overage : null

  // Negotiation events
  const negotiationEvents = (events ?? [])
    .filter((e) => e.event_type === 'deal.counter_offer' || e.event_type === 'deal.brand_counter')
    .map((e) => ({ event_type: e.event_type, detail: e.detail as { counter_items?: { id: string; label: string; price_paise: number }[]; counter_total_paise?: number; note?: string | null }, created_at: e.created_at }))
  const showNegotiationHistory = negotiationEvents.length >= 2

  // Detect brand's latest counter (for creator to respond to)
  const brandCounterEvent = (events ?? [])
    .filter((e) => e.event_type === 'deal.brand_counter')
    .at(-1)
  const brandCounterDetail = brandCounterEvent?.detail as { counter_items: { id: string; label: string; price_paise: number }[]; counter_total_paise: number; note?: string | null } | undefined
  const hasBrandCounter = isNegotiating && !!brandCounterDetail

  // Brief data
  const pitch = campaignBrief?.pitch ?? (deal as any).brief_pitch ?? null
  const guidelines = campaignBrief?.guidelines ?? (deal as any).brief_guidelines ?? null
  const avoid = (deal as any).brief_avoid as string | null
  const briefAttachments = ((deal as any).brief_attachments ?? []) as { name: string; storage_path: string; size_bytes: number; content_type: string }[]

  // Signed URLs for brief attachments
  const attachmentUrls: Record<string, string> = {}
  if (briefAttachments.length > 0) {
    const results = await Promise.all(
      briefAttachments.map((att) =>
        supabase.storage.from('deal-files').createSignedUrl(att.storage_path, 3600)
      )
    )
    results.forEach((res, i) => {
      if (res.data?.signedUrl) {
        attachmentUrls[briefAttachments[i].storage_path] = res.data.signedUrl
      }
    })
  }

  /* The offer state has its own phone screen. Every other state keeps the
     existing page on mobile, because only this one was designed. */
  const offerUnread = isNegotiating ? await unreadNotificationCount(supabase, profileId) : 0
  const splitLines = (v: unknown): string[] =>
    typeof v === 'string'
      ? v.split('\n').map((l) => l.replace(/^\s*[-•\d.)]+\s*/, '').trim()).filter(Boolean)
      : []
  return (
    <>
    {isNegotiating && (
      <CreatorOfferMobile
        brandName={brand}
        dealTitle={deal.title ?? 'Untitled deal'}
        receivesPaise={creatorReceives}
        totalPaise={deal.price_paise ?? null}
        feePaise={fee?.fee_paise ?? null}
        feePercent={deal.fee_percent ?? null}
        paymentTerms={deal.payment_terms ?? null}
        /* "Payment in 30 days" from the agreed terms. Terms are free text, so
           a day count is only stated when one is actually written there —
           otherwise the terms line above already says it in full. */
        paymentIn={(() => {
          const t = deal.payment_terms
          const m = typeof t === 'string' ? /(\d+)\s*(day|d)\b/i.exec(t) : null
          // 30 days is the platform default when the terms do not state one.
          return m ? `${m[1]} days` : '30 days'
        })()}
        deliverBy={deal.timeline_date
          ? new Date(deal.timeline_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
          : null}
        waitingLabel={(() => {
          const days = Math.floor((Date.now() - new Date(deal.created_at).getTime()) / 86_400_000)
          return days <= 0 ? 'Received today' : days === 1 ? 'Received yesterday' : `Waiting ${days} days`
        })()}
        items={(items ?? []).map((i) => ({
          id: i.id,
          label: i.label,
          pricePaise: i.price_paise ?? 0,
          detail: null,
        }))}
        briefPitch={pitch}
        guidelines={splitLines(guidelines)}
        avoid={splitLines(avoid)}
        attachments={briefAttachments.map((a) => ({
          name: a.name,
          // Signed, and already fetched above for the desktop list.
          url: attachmentUrls[a.storage_path] ?? null,
        }))}
        usageRights={deal.usage_rights ?? null}
        revisionLimit={deal.revision_limit ?? null}
        extraRevisionPaise={deal.price_per_extra_revision_paise ?? null}
        requiresShipment={Boolean(deal.requires_shipment)}
        unreadNotifications={offerUnread}
        decision={
          <AcceptDecline
            stacked
            dealId={deal.id}
            items={(items ?? []).map((i) => ({ id: i.id, label: i.label, price_paise: i.price_paise ?? 0 }))}
          />
        }
      />
    )}
    <main className={isNegotiating ? 'offer-desktop' : undefined} style={wrapper}>
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
        <div className="frame reveal" style={{ width: '100%', maxWidth: 1080, display: 'flex', flexDirection: 'column', gap: 36 }}>

          {/* ── Editorial hero ── */}
          <div className="surface" style={{ padding: '28px 30px' }}>
            <Link href="/creator/deals" style={backLinkStyle}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              Back to deals
            </Link>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={metaLabel}>
                  {deal.title || 'Untitled deal'}{deal.deal_ref ? ` \u00B7 ${deal.deal_ref}` : ''}
                  {/* Only once something is posted, since there is nothing to
                      show before that. The creator sees the same numbers the
                      brand does, which is what they will be negotiating their
                      next rate against. */}
                  {deal.is_posted && (
                    <>
                      {' \u00B7 '}
                      <Link href={`/creator/deals/${deal.id}/analytics`} style={{ color: 'var(--ink)', fontWeight: 700, textDecoration: 'none' }}>
                        How your post did
                      </Link>
                    </>
                  )}
                </div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px,3.4vw,34px)', fontWeight: 700, letterSpacing: '-0.025em', margin: '8px 0 0' }}>
                  {isNegotiating && hasBrandCounter ? 'Counter received from '
                    : isNegotiating ? 'Offer received from '
                    : deal.status === 'delivered' ? 'Delivered to '
                    : deal.status === 'revision' ? 'Changes asked by '
                    : (invoice && invoice.status === 'paid') || deal.status === 'paid' || deal.status === 'complete' ? 'Wrapped with '
                    : invoice && invoice.status === 'accepted' ? 'Invoice accepted by '
                    : invoice && invoice.status === 'issued' ? 'Invoice sent to '
                    : deal.status === 'approved' ? 'Approved by '
                    : 'Deal with '}
                  <span style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontWeight: 400 }}>{brand}</span>
                </h1>
              </div>
              <OpenDealChat className="neonbtn" style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                height: 42, padding: '0 18px', borderRadius: 11,
                background: 'var(--neon)', border: 'none',
                boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
                fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, color: 'var(--ink)',
                textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                Message brand
              </OpenDealChat>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border-hairline, #EAEAE3)', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: (invoice?.status === 'paid' || (!invoice && (deal.status === 'paid' || deal.status === 'complete'))) ? 'var(--neon)' : invoiceIssuedOrLater ? 'var(--warning)' : sm.dot, boxShadow: `0 0 0 4px ${(invoice?.status === 'paid' || (!invoice && (deal.status === 'paid' || deal.status === 'complete'))) ? 'color-mix(in oklab, var(--neon) 22%, transparent)' : invoiceIssuedOrLater ? 'rgba(200,154,60,.22)' : sm.glow}` }} />
                {(invoice?.status === 'paid' || (!invoice && (deal.status === 'paid' || deal.status === 'complete'))) ? 'Complete' : invoiceIssuedOrLater ? 'Invoice' : sm.label}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                {(() => {
                  if (invoiceIssuedOrLater && invoice) {
                    const sentTs = invoice.issued_at ? formatDateWithTime(invoice.issued_at) : ''
                    const receiveAmt = formatRupees(invoice.creator_receives_paise)
                    if (invoice.status === 'paid') {
                      const paidEvent = (events ?? []).filter((e: any) => e.event_type === 'deal.status_changed' && (e.detail?.to === 'paid' || e.detail?.new_status === 'paid')).pop()
                      const paidTs = paidEvent ? formatDate(paidEvent.created_at) : (invoice.accepted_at ? formatDate(invoice.accepted_at) : '')
                      return <>{receiveAmt} received{paidTs ? ` ${paidTs}` : ''} &middot; nothing left to do</>
                    }
                    const dueDate = invoice.due_date ? formatDate(invoice.due_date + (invoice.due_date.includes('T') ? '' : 'T00:00:00')) : null
                    if (invoice.status === 'accepted') {
                      return <>Accepted &middot; {receiveAmt} lands by <b style={{ color: 'var(--ink)' }}>{dueDate || 'TBD'}</b></>
                    }
                    return <>Sent{sentTs ? ` ${sentTs}` : ''} &middot; {receiveAmt} lands by <b style={{ color: 'var(--ink)' }}>{dueDate || 'TBD'}</b></>
                  }
                  if (deal.status === 'delivered') {
                    const deliveredEvent = (events ?? []).filter((e: any) => e.event_type === 'deal.status_changed' && (e.detail?.to === 'delivered' || e.detail?.new_status === 'delivered')).pop()
                    const ts = deliveredEvent ? formatDateWithTime(deliveredEvent.created_at) : formatDate(deal.created_at)
                    return <>Submitted {ts} &middot; brands usually review within <b style={{ color: 'var(--ink)' }}>2 days</b></>
                  }
                  if (deal.status === 'revision') {
                    const revisionEvent = (events ?? []).filter((e: any) => e.event_type === 'deal.status_changed' && (e.detail?.to === 'revision' || e.detail?.new_status === 'revision')).pop()
                    const ts = revisionEvent ? formatDateWithTime(revisionEvent.created_at) : ''
                    return <>Feedback received{ts ? ` ${ts}` : ''}{deal.timeline_date ? <> &middot; resubmit by <b style={{ color: 'var(--ink)' }}>{formatDate(deal.timeline_date + 'T00:00:00')}</b></> : ''}</>
                  }
                  if (deal.status === 'paid' || deal.status === 'complete') {
                    const paidEvent = (events ?? []).filter((e: any) => e.event_type === 'deal.status_changed' && (e.detail?.to === 'paid' || e.detail?.new_status === 'paid')).pop()
                    const paidTs = paidEvent ? formatDate(paidEvent.created_at) : ''
                    const receiveAmt = creatorReceives ? formatRupees(creatorReceives) : ''
                    return <>{receiveAmt ? `${receiveAmt} received` : 'Paid'}{paidTs ? ` ${paidTs}` : ''} &middot; nothing left to do</>
                  }
                  if (deal.status === 'approved') {
                    const approvedEvent = (events ?? []).filter((e: any) => e.event_type === 'deal.status_changed' && (e.detail?.to === 'approved' || e.detail?.new_status === 'approved')).pop()
                    const ts = approvedEvent ? formatDateWithTime(approvedEvent.created_at) : ''
                    return <>Approved{ts ? ` ${ts}` : ''} &middot; post inside the live window, then invoice</>
                  }
                  return <>Sent {formatDate(deal.created_at)}{deal.timeline_date && <> &middot; deliver by <b style={{ color: 'var(--ink)' }}>{formatDate(deal.timeline_date + 'T00:00:00')}</b></>}</>
                })()}
              </span>
            </div>
          </div>

          {/* ── "Ready to decide?" CTA (negotiating only) ── */}
          {isNegotiating && (
            <div className="surface" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>{hasBrandCounter ? 'New counter from the brand' : 'Ready to decide?'}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>{hasBrandCounter ? 'Review the updated terms below and respond.' : 'Scroll down to review terms and respond.'}</div>
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
          <CreatorStepper
            dealStatus={deal.status}
            events={(events ?? []) as { id: string; event_type: string; detail: any; created_at: string }[]}
            invoiceStatus={invoice?.status}
          />

          {/* ── Negotiation history (2+ rounds, during negotiating) ── */}
          {isNegotiating && showNegotiationHistory && (
            <NegotiationHistory
              events={negotiationEvents}
              variant="creator"
              brandName={brand}
            />
          )}

          {/* ── Offer / Agreed terms (only during negotiating + agreed) ── */}
          {(isNegotiating || deal.status === 'agreed') && <div className="surface" style={{ padding: 0, overflow: 'hidden', scrollMarginTop: 24 }} id="decision">
            <div style={{ padding: '26px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <h3 style={sectionHeading}>{isNegotiating ? 'Offer terms' : 'Agreed terms'}</h3>
                {deal.agreed_at && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-soft)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--neon-deep)' }} />
                    Agreed {new Date(deal.agreed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, {new Date(deal.agreed_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </span>
                )}
              </div>

              {/* Summary hero: deliverables left, dates right */}
              <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginTop: 22 }}>
                <div style={{ flex: 1.3, paddingRight: 32 }}>
                  <div style={metaLabel}>Deliverables</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15, marginTop: 8 }}>
                    {hasStructuredItems
                      ? items.map((i) => i.label).join(' + ')
                      : deal.deliverables || 'TBD'}
                  </div>
                  {items && items.length > 0 && items[0].platform && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 8 }}>
                      {items[0].platform}{deal.timeline_date ? ` \u00B7 deliver by ${formatDate(deal.timeline_date + 'T00:00:00')}` : ''}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, paddingLeft: 32, borderLeft: '1px solid var(--border-hairline, #EAEAE3)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
                  {deal.timeline_date && (
                    <div>
                      <div style={metaLabel}>Deliver by</div>
                      <div style={dateValue}>{formatDate(deal.timeline_date + 'T00:00:00')}</div>
                    </div>
                  )}
                  {deal.revision_limit != null && (
                    <div>
                      <div style={metaLabel}>Revisions</div>
                      <div style={dateValue}>{revTerms.unlimited
                        ? `${deal.revisions_used ?? 0} \u00B7 unlimited`
                        : `${deal.revisions_used ?? 0} / ${revTerms.limit}`}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Dark "You receive" footer bar */}
            {creatorReceives != null && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
                padding: '18px 28px',
                borderRadius: '0 0 20px 20px',
                background: 'var(--ink)', color: '#FFFFFF',
              }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                  You receive{deal.payment_terms ? `, ${deal.payment_terms.toLowerCase()}` : ''}
                </span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1, fontSize: 34 }}>
                  {formatINR(creatorReceives)}
                </span>
              </div>
            )}
          </div>}

          {/* ── Deliverable items breakdown (during negotiating only) ── */}
          {hasStructuredItems && isNegotiating && (
            <div className="surface" style={{ padding: '22px 24px' }}>
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
                        <span style={chipStyle}>
                          {item.platform?.toLowerCase().includes('youtube') ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m10 8 6 4-6 4V8z" /><rect x="2" y="3" width="20" height="18" rx="4" /></svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="12" cy="12" r="4.5" /><circle cx="17.5" cy="6.5" r="1" /></svg>
                          )}
                          {item.handle?.startsWith('@') ? item.handle : `@${item.handle}`}
                        </span>
                        {item.reel_type && <span style={chipStyle}>{item.reel_type === 'collab' ? 'Collab' : 'Non-collab'}</span>}
                        {item.boosting_rights && <span style={chipStyle}>Boosting {item.boosting_duration_months ? `${item.boosting_duration_months}mo` : '\u221E'}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* What each deliverable cost, and what was added to it.
                  The SAME component the brand sees — a creator and a brand reading two
                  separately-written breakdowns is two chances to disagree about one
                  number. Hidden when there is nothing to break down. */}
              {hasAddons(itemsForBreakdown) && (
                <div style={{ marginBottom: 16 }}>
                  <DealBreakdown items={itemsForBreakdown} totalPaise={deal.price_paise} />
                </div>
              )}
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

              {/* Usage rights + extra terms */}
              {(deal.usage_rights || deal.usage_rights_end_date) && (
                <div style={{ paddingTop: 8 }}>
                  {deal.usage_rights && (
                    <div style={termRow}>
                      <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Usage rights</span>
                      <b style={{ fontSize: 14, fontWeight: 700 }}>{deal.usage_rights}</b>
                    </div>
                  )}
                  {deal.usage_rights_end_date && (
                    <div style={termRow}>
                      <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Rights expire</span>
                      <b style={{ fontSize: 14, fontWeight: 700 }}>{formatDate(deal.usage_rights_end_date + 'T00:00:00')}</b>
                    </div>
                  )}
                </div>
              )}

              {/* Accept / Counter / Decline actions */}
              {isNegotiating && (
                <div style={{ paddingTop: 22, marginTop: 22, borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
                  <AcceptDecline dealId={deal.id} items={items.map((i) => ({ id: i.id, label: i.label, price_paise: i.price_paise ?? 0 }))} />
                </div>
              )}
            </div>
          )}

          {/* ── Non-structured terms fallback (negotiating/agreed only) ── */}
          {!hasStructuredItems && (isNegotiating || deal.status === 'agreed') && (
            <div className="surface" style={{ padding: '22px 24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {deal.deliverables && <TermRow label="Deliverables" value={deal.deliverables} />}
                {deal.usage_rights && <TermRow label="Usage rights" value={deal.usage_rights} />}
                {deal.usage_rights_end_date && <TermRow label="Usage rights expire" value={formatDate(deal.usage_rights_end_date + 'T00:00:00')} />}
                {deal.rights_confirmed_at && <TermRow label="Rights confirmed" value={formatDateLong(deal.rights_confirmed_at)} />}
                {deal.revision_limit != null && <TermRow label="Revisions" value={revisionLabel(revTerms)} />}
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

          {/* ── Sections ── */}
          {(() => {
            const showShipment = deal.requires_shipment && !['declined', 'cancelled'].includes(deal.status)
            const showDeliverables = !isNegotiating && (hasStructuredItems || (!hasStructuredItems && true))
            const showPosted = ['approved', 'paid', 'complete'].includes(deal.status)
            const showInvoice = ['approved', 'paid', 'complete'].includes(deal.status)

            type Section = 'shipment' | 'deliverables' | 'brief' | 'posted' | 'invoice' | 'paid'
            const isPostApproval = deal.status === 'approved' || deal.status === 'paid' || deal.status === 'complete'
            const isCompleted = invoice?.status === 'paid' || (!invoice && (deal.status === 'paid' || deal.status === 'complete'))
            const sections: Section[] = isNegotiating
              ? ['brief', 'deliverables', 'invoice', 'shipment', 'posted']
              : isCompleted
                ? ['paid', 'invoice', 'deliverables', 'brief', 'shipment']
                : isPostApproval
                  ? ['posted', 'invoice', 'deliverables', 'brief', 'shipment']
                  : ['deliverables', 'brief', 'invoice', 'shipment', 'posted']

            return sections.map((section) => {
              switch (section) {
                case 'brief': {
                  if (!(pitch || guidelines || avoid || briefAttachments.length > 0)) return null
                  const guidelinePoints: string[] = guidelines ? guidelines.split('\n').filter(Boolean) : []
                  const avoidPoints: string[] = avoid ? avoid.split('\n').filter(Boolean) : []
                  const glParts: string[] = []
                  if (guidelinePoints.length > 0) glParts.push(`${guidelinePoints.length} guideline${guidelinePoints.length !== 1 ? 's' : ''}`)
                  if (avoidPoints.length > 0) glParts.push(`${avoidPoints.length} to avoid`)
                  // Brief content (shared between open and collapsed modes)
                  const briefContent = (
                    <>
                      {/* The brief */}
                      {pitch && (
                        <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 36, paddingTop: 34, borderTop: '1px solid var(--border-hairline)' }}>
                          <div style={metaLabel}>The brief</div>
                          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-soft)', margin: 0, maxWidth: 620, whiteSpace: 'pre-wrap' }}>{pitch}</p>
                        </div>
                      )}

                      {/* Attachments */}
                      {briefAttachments.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 36, paddingTop: 34, borderTop: '1px solid var(--border-hairline)' }}>
                          <div style={metaLabel}>What they&apos;ve attached</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                            {briefAttachments.map((att) => {
                              const signedUrl = attachmentUrls[att.storage_path]
                              const ext = att.name.split('.').pop()?.toUpperCase() || 'FILE'
                              const sizeMB = (att.size_bytes / (1024 * 1024)).toFixed(1)
                              return (
                                <a key={att.storage_path} href={signedUrl || '#'} target="_blank" rel="noopener noreferrer" className="att-card" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px', borderRadius: 14, background: 'var(--card)', border: '1px solid var(--hairline)', boxShadow: '0 1px 2px rgba(22,23,15,.03)', cursor: 'pointer', textDecoration: 'none' }}>
                                  <span style={{ width: 32, height: 32, borderRadius: 10, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--sec-2)', border: '1px solid var(--sec-mid-2, var(--hairline))', color: 'var(--sec-ink, var(--ink-soft))' }}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                                  </span>
                                  <span style={{ minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                                    <span style={{ display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 2 }}>{ext} · {sizeMB} MB</span>
                                  </span>
                                </a>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Product kit — in brief */}
                      {deal.requires_shipment && (
                        <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 36, paddingTop: 34, borderTop: '1px solid var(--border-hairline)' }}>
                          <div style={metaLabel}>Product kit</div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', paddingTop: 3 }}>
                            <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', marginTop: 1 }}><path d="M16 16V4H2v12h14zM16 8h4l2 4v4h-6" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="18.5" cy="18.5" r="2" /></svg>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700 }}>You will be sent a product kit</div>
                                <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>Ships once the deal is agreed</div>
                              </div>
                            </div>
                            {(!deal.shipment_status || deal.shipment_status === 'pending') && (
                              <a href="#shipment" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border-hairline)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', textDecoration: 'none', cursor: 'pointer' }}>
                                {(deal as Record<string, unknown>).shipping_address ? 'View address' : 'Add address'}
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Full terms — toggle */}
                      <BriefDetailsToggle label="Full terms" defaultOpen={!deal.agreed_at}>
                        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column' }}>
                          {deal.price_paise != null && (
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                              <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Your rate</span>
                              <b style={{ fontSize: 14, fontWeight: 700 }}>{formatINR(deal.price_paise)}</b>
                            </div>
                          )}
                          {fee && fee.fee_paise > 0 && (
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                              <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Platform fee ({fee.fee_percent}%), paid by the brand</span>
                              <b style={{ fontSize: 14, fontWeight: 700 }}>{formatINR(fee.fee_paise)}</b>
                            </div>
                          )}
                          {deal.usage_rights && (
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                              <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Usage rights</span>
                              <b style={{ fontSize: 14, fontWeight: 700 }}>{deal.usage_rights}{deal.usage_rights_end_date && `, ${new Date(deal.usage_rights_end_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}</b>
                            </div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                            <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Revisions</span>
                            <b style={{ fontSize: 14, fontWeight: 700 }}>{deal.revision_limit ?? 0} included{(deal.price_per_extra_revision_paise ?? 0) > 0 ? `, then ${formatINR(deal.price_per_extra_revision_paise)}` : ''}</b>
                          </div>
                          {deal.payment_terms && (
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                              <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Payment terms</span>
                              <b style={{ fontSize: 14, fontWeight: 700 }}>{deal.payment_terms}</b>
                            </div>
                          )}
                        </div>
                      </BriefDetailsToggle>

                      {/* Creative guidelines — toggle */}
                      {(guidelinePoints.length > 0 || avoidPoints.length > 0) && (
                        <BriefDetailsToggle label="Creative guidelines" subtitle={glParts.join(' · ')} defaultOpen={!deal.agreed_at}>
                          {guidelinePoints.length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 28 }}>
                              <div style={metaLabel}>Creative guidelines</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {guidelinePoints.map((point: string, i: number) => (
                                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                    <span style={{ width: 22, height: 22, borderRadius: 7, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: 'var(--ink)', color: '#FFFFFF' }}>{i + 1}</span>
                                    <span style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{point}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {avoidPoints.length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 30, paddingTop: 28, borderTop: guidelinePoints.length > 0 ? '1px solid var(--border-hairline)' : 'none' }}>
                              <div style={metaLabel}>Please avoid</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {avoidPoints.map((point: string, i: number) => (
                                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2.2" strokeLinecap="round" style={{ flex: 'none', marginTop: 4 }}><path d="M18 6 6 18M6 6l12 12" /></svg>
                                    <span style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{point}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </BriefDetailsToggle>
                      )}
                    </>
                  )

                  // When negotiating or agreed (pre-submission): open surface
                  if (isNegotiating || deal.status === 'agreed') {
                    return (
                      <div key="brief" className="surface" style={{ padding: '26px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                          <div>
                            <div style={metaLabel}>{brand} &middot; {formatDate(deal.created_at)}</div>
                            <h3 style={{ ...sectionHeading, marginTop: 8 }}>The brief in detail</h3>
                          </div>
                          {canSubmit && (
                            <a href="#deliverables" className="neonbtn" style={{
                              display: 'inline-flex', alignItems: 'center', gap: 8,
                              height: 46, padding: '0 22px', borderRadius: 12,
                              background: 'var(--neon)', border: 'none',
                              boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
                              fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 13.5, color: 'var(--ink)',
                              textDecoration: 'none', cursor: 'pointer',
                            }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M12 3v13M7 8l5-5 5 5" /></svg>
                              Ready to deliver
                            </a>
                          )}
                        </div>
                        {briefContent}
                      </div>
                    )
                  }

                  // Post-submission: collapsible surface
                  return (
                    <BriefDetailsToggle key="brief" label="The brief in detail" subtitle={`${brand} · ${formatDate(deal.created_at)}`} variant="surface">
                      {briefContent}
                    </BriefDetailsToggle>
                  )
                }

                case 'shipment':
                  if (!showShipment) return null
                  return (
                    <div key="shipment" id="shipment" className="surface" style={{ padding: '22px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                        <h3 style={sectionHeading}>Product shipment</h3>
                        {(!deal.shipment_status || deal.shipment_status === 'pending') && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)' }} />
                            {!deal.shipment_status ? 'Included in this deal' : 'Not shipped yet'}
                          </span>
                        )}
                        {deal.shipment_status === 'shipped' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--info, #5AA9E6)' }} />
                            Shipped{deal.shipped_at && ` ${formatDate(deal.shipped_at)}`}
                          </span>
                        )}
                        {deal.shipment_status === 'delivered' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success, #1F9D6B)' }} />
                            Delivered
                          </span>
                        )}
                      </div>
                      {(!deal.shipment_status || deal.shipment_status === 'pending') && (
                        <>
                          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '14px 0 0', maxWidth: 640 }}>
                            {!deal.shipment_status
                              ? 'This deal includes a product kit. The brand will ship it to you once the deal is agreed.'
                              : 'The brand is preparing a product kit to send to you. Send your address so they know where to ship.'}
                          </p>
                          <ShippingAddressForm dealId={deal.id} existingAddress={(deal as Record<string, unknown>).shipping_address as string | null} />
                        </>
                      )}
                      {deal.shipment_status === 'shipped' && (
                        <>
                          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '14px 0 0', maxWidth: 640 }}>
                            Your product kit is on its way. Keep an eye out for the delivery.
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
                            {deal.carrier_note && (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999, background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16V4H2v12h14zM16 8h4l2 4v4h-6" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="18.5" cy="18.5" r="2" /></svg>
                                {deal.carrier_note}
                              </div>
                            )}
                            {deal.tracking_link && (
                              <a href={deal.tracking_link} target="_blank" rel="noopener noreferrer" className="pill-hover" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 48, padding: '0 22px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)', boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 8px 16px rgba(22,23,15,.04)', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer', textDecoration: 'none' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16V4H2v12h14zM16 8h4l2 4v4h-6" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="18.5" cy="18.5" r="2" /></svg>
                                Track shipment
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M17 7H7m10 0v10" /></svg>
                              </a>
                            )}
                          </div>
                        </>
                      )}
                      {deal.shipment_status === 'delivered' && (
                        <>
                          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '14px 0 0', maxWidth: 640 }}>
                            Product delivered. You can start creating content now.
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
                            {deal.carrier_note && (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999, background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                                {deal.carrier_note}
                              </div>
                            )}
                            {deal.tracking_link && (
                              <a href={deal.tracking_link} target="_blank" rel="noopener noreferrer" className="pill-hover" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 48, padding: '0 22px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)', boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 8px 16px rgba(22,23,15,.04)', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer', textDecoration: 'none' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16V4H2v12h14zM16 8h4l2 4v4h-6" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="18.5" cy="18.5" r="2" /></svg>
                                Tracking link
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M17 7H7m10 0v10" /></svg>
                              </a>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )

                case 'deliverables':
                  if (isNegotiating) return null
                  if (hasStructuredItems) {
                    const approvedCount = items!.filter((i) => i.item_status === 'approved').length
                    const hasRevision = items!.some((i) => i.item_status === 'revision')
                    const submittedCount = items!.filter((i) => i.item_status === 'submitted' || i.item_status === 'approved').length
                    const submittedItem = items!.find((i) => i.submitted_at)
                    const sentDate = submittedItem?.submitted_at ? formatDate(submittedItem.submitted_at) : null
                    const approvedAt = items!.find((i) => i.approved_at)?.approved_at
                    const allApproved = approvedCount === items!.length

                    const subtitle = hasRevision
                      ? undefined // subtitle rendered inline with dot below
                      : submittedCount > 0
                        ? `${allApproved ? approvedCount : submittedCount} of ${items!.length} ${allApproved ? 'approved' : 'submitted'}${allApproved && approvedAt ? ` · ${formatDate(approvedAt)}` : sentDate ? ` · sent ${sentDate}` : ''}`
                        : undefined

                    // Collapsed in approved/paid/complete states
                    const isDelivsCollapsible = deal.status === 'approved' || deal.status === 'paid' || deal.status === 'complete'

                    const delivContent = (
                      <>
                        {hasRevision && (
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span />
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: '.04em', color: 'var(--ink-soft)' }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)' }} />
                              {approvedCount} of {items!.length} approved{(() => {
                                const timelineDate = (deal as Record<string, unknown>).timeline_date as string | null
                                return timelineDate ? ` · resubmit by ${formatDate(timelineDate)}` : ''
                              })()}
                            </span>
                          </div>
                        )}
                        <DeliverableItems dealId={deal.id} items={items!} canSubmit={canSubmit} dealStatus={deal.status} brandName={brand} />
                      </>
                    )

                    if (isDelivsCollapsible) {
                      return (
                        <BriefDetailsToggle key="deliverables" label="Deliverables" subtitle={subtitle} variant="surface">
                          {delivContent}
                        </BriefDetailsToggle>
                      )
                    }

                    return (
                      <div key="deliverables" className="surface" style={{ padding: '22px 24px' }} id="deliverables">
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                          <h3 style={sectionHeading}>Deliverables</h3>
                          {subtitle && <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{subtitle}</span>}
                        </div>
                        {hasRevision && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: '.04em', color: 'var(--ink-soft)' }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)' }} />
                              {approvedCount} of {items!.length} approved{(() => {
                                const timelineDate = (deal as Record<string, unknown>).timeline_date as string | null
                                return timelineDate ? ` · resubmit by ${formatDate(timelineDate)}` : ''
                              })()}
                            </span>
                          </div>
                        )}
                        <DeliverableItems dealId={deal.id} items={items!} canSubmit={canSubmit} dealStatus={deal.status} brandName={brand} />
                      </div>
                    )
                  }
                  return (
                    <div key="deliverables" className="surface" style={{ padding: '22px 24px' }}>
                      <h3 style={sectionHeading}>Deliverables</h3>
                      {deliverables && deliverables.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                          {deliverables.map((d) => (
                            <div key={d.id} style={{ padding: 12, border: '1px solid var(--border-hairline, #EAEAE3)', borderRadius: 14, background: 'var(--card)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>v{d.version}</span>
                                  {d.note && <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>, {d.note}</span>}
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
                  )

                case 'posted':
                  if (!showPosted) return null
                  {
                    // Build per-item posted data (only approved items get posted)
                    const postedItems = hasStructuredItems
                      ? items!.filter((i) => i.item_status === 'approved').map((i) => ({
                          id: i.id,
                          label: i.label,
                          platform: i.platform,
                          posted_url: (i as any).posted_url as string | null,
                          posted_at: (i as any).posted_at as string | null,
                        }))
                      : undefined

                    return (
                      <div key="posted" className="surface" style={{ padding: 24 }}>
                        <PostedCard
                          dealId={deal.id}
                          items={postedItems}
                          timelineDate={(deal as Record<string, unknown>).timeline_date as string | null}
                        />
                      </div>
                    )
                  }

                case 'paid':
                  if (!isCompleted) return null
                  {
                    const paidEvent = (events ?? []).filter((e: any) => e.event_type === 'deal.status_changed' && (e.detail?.to === 'paid' || e.detail?.new_status === 'paid')).pop()
                    const paidTs = paidEvent ? formatDateWithTime(paidEvent.created_at) : (invoice?.accepted_at ? formatDateWithTime(invoice.accepted_at) : '')
                    const rightsEnd = (deal as Record<string, unknown>).usage_rights_end_date as string | null
                    const rightsText = rightsEnd ? `Rights lapse ${formatDate(rightsEnd + 'T00:00:00')}.` : ''

                    return (
                      <div key="paid" className="surface" style={{ padding: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: '.04em', color: 'var(--ink-soft)' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--neon-deep)' }} />
                            Paid in full
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
                          {/* Mascot */}
                          <svg width="44" height="44" viewBox="0 0 336 336" fill="none" style={{ flexShrink: 0 }}>
                            <path d="M168 12C278 12 324 112 324 188C324 276 252 324 168 324C84 324 12 276 12 188C12 112 58 12 168 12Z" fill="#E8FF66" />
                            <ellipse cx="114" cy="126" rx="54" ry="36" fill="#fff" opacity="0.55" />
                            <ellipse cx="168" cy="188" rx="24" ry="10" fill="#fff" opacity="0.18" />
                          </svg>
                          <div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, letterSpacing: '-0.025em' }}>You have been guapd</div>
                            <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-soft)', marginTop: 4 }}>
                              Paid in full{paidTs ? ` on ${paidTs.split(',')[0]}` : ''}.{rightsText ? ` ${rightsText}` : ''}
                            </div>
                          </div>
                        </div>

                        {/* Dark "Received" bar */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '20px 24px', marginTop: 24, borderRadius: 14, background: 'var(--ink)', color: '#FFFFFF' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 700 }}>Received</span>
                          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1, fontSize: 34 }}>
                            {creatorReceives ? formatINR(creatorReceives) : (invoice ? formatINR(invoice.creator_receives_paise) : '')}
                          </span>
                        </div>

                        {/* Footer with payment details */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 18 }}>
                          <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>
                            {paidTs ? `Paid ${paidTs}` : 'Paid'}
                          </span>
                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                            <Link href="/creator/payments" className="pill-hover" style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                              height: 46, padding: '0 20px', borderRadius: 12,
                              background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)',
                              boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 8px 16px rgba(22,23,15,.04)',
                              fontWeight: 700, fontSize: 13, color: 'var(--ink)', cursor: 'pointer', textDecoration: 'none',
                            }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                              View in payments
                            </Link>
                            <OpenDealChat className="pill-hover" style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                              height: 46, padding: '0 20px', borderRadius: 12,
                              background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)',
                              boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 8px 16px rgba(22,23,15,.04)',
                              fontWeight: 700, fontSize: 13, color: 'var(--ink)', cursor: 'pointer', textDecoration: 'none',
                            }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>
                              Message brand
                            </OpenDealChat>
                          </div>
                        </div>
                      </div>
                    )
                  }

                case 'invoice':
                  if (!showInvoice) return null
                  {
                    const invoiceContent = (
                      <InvoiceCard
                        dealId={deal.id}
                        dealRef={deal.deal_ref}
                        invoice={invoice}
                        isPosted={deal.is_posted}
                        creatorReceivesPaise={creatorReceives}
                        brandPaysPaise={fee?.brand_pays_paise}
                        feePaise={fee?.fee_paise}
                        feePercent={deal.fee_percent}
                        feeMode={feeMode}
                        paymentTerms={deal.payment_terms}
                        items={hasStructuredItems ? items!.map((i) => ({ label: i.label, price_paise: i.price_paise })) : undefined}
                        brandName={brand}
                        dealStatus={deal.status}
                      />
                    )

                    // Collapsible when invoice exists and is paid
                    if (invoice && (invoice.status === 'paid')) {
                      return (
                        <BriefDetailsToggle
                          key="invoice"
                          label={<>Invoice{deal.deal_ref && <> <span style={{ color: 'var(--ink-faint)', fontWeight: 600 }}>#{deal.deal_ref}</span></>} <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: '.04em', color: 'var(--ink-soft)', marginLeft: 12 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--neon-deep)' }} />Paid in full</span></>}
                          variant="surface"
                        >
                          {invoiceContent}
                        </BriefDetailsToggle>
                      )
                    }

                    return (
                      <div key="invoice" className="surface" style={{ padding: 24 }}>
                        {invoiceContent}
                      </div>
                    )
                  }

                default:
                  return null
              }
            })
          })()}

          {/* ── Negotiation history (collapsed, after accepted) ── */}
          {!isNegotiating && showNegotiationHistory && (
            <NegotiationHistory
              events={negotiationEvents}
              variant="creator"
              brandName={brand}
              collapsed
            />
          )}

          {/* ── Review card (only on completed deals) ── */}
          {isCompleted && (
            <CreatorReviewCard
              dealId={deal.id}
              brandName={brand}
              existingRating={existingReview?.rating}
              existingNote={existingReview?.note}
            />
          )}

        </div>
      </div>
    
      {/* The panel, rendered at last. CreatorThread existed and was never
          imported anywhere, so Message had nothing to open and navigated away
          from the deal instead. */}
      <CreatorThread
        dealId={deal.id}
        dealStatus={deal.status}
        dealCompletedAt={deal.completed_at}
        dealPaidAt={invoice?.paid_at ?? null}
        initialMessages={(messages ?? []).map((m) => ({
          id: m.id,
          deal_id: m.deal_id,
          sender_party: m.sender_party as 'brand' | 'creator',
          body: m.body,
          created_at: m.created_at,
        }))}
        autoOpen={searchParams?.chat === '1'}
        hideLauncher
      />

    </main>
    </>
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
