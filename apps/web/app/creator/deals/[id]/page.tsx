import { createClient } from '@/lib/supabase/server'
import BrandMark from '@/components/BrandMark'
import { createAdminClient } from '@/lib/supabase/admin'
import MobileInvoiceCard from './MobileInvoiceCard'
import { formatDueStatus } from '@/lib/invoice'
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
import { paymentWhenLabel } from '@/lib/payment-terms'
import { zeroFeeNote, feeBearerNote } from '@/lib/fee-copy'
import { revisionTerms, revisionLabel } from '@/lib/revisions'
import DealBreakdown, { hasAddons, type BreakdownItem } from '@/components/DealBreakdown'
import NegotiationHistory from '@/components/NegotiationHistory'
import RealtimeDealListener from '@/components/RealtimeDealListener'
import { getCampaignBriefForCreator } from './actions'
import BriefDetailsToggle from '@/app/deals/[id]/BriefDetailsToggle'
import BriefBlock from './BriefBlock'
import { ReadyToDecideBar, TermsCard, DeliverablesCard, DeliverableRow, CardActions, chipStyle } from './deal-cards'
import { DealHeroCard, DealShellStyles, wrapper, backLinkStyle, metaLabel, sectionHeading, termRow } from './deal-shell'
import ShippingAddressForm from './ShippingAddressForm'
import CreatorStepper from './CreatorStepper'
import CreatorReviewCard from './CreatorReviewCard'
import CreatorLegView from './CreatorLegView'
import type { CreatorLegContext, CreatorCollabPost } from '@/lib/creator-leg-money'

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
      .select('id, deal_ref, title, deliverables, price_paise, price_per_extra_revision_paise, fee_percent, fee_mode, fee_basis, status, timeline_date, go_live_date, revision_limit, revisions_used, usage_rights, payment_terms, agreed_at, created_at, requires_shipment, shipment_status, tracking_link, carrier_note, shipped_at, shipping_address, is_posted, posted_url, posted_at, usage_rights_end_date, rights_confirmed_at, completed_at, brief_pitch, brief_guidelines, brief_avoid, brief_attachments, leg_role, brands(name, logo_url)')
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

  /* A Guapd Experience creator leg is its own screen: the brand "· Managed by
     Guapd", the creator's frozen day-rate terms and scope, accept / decline.
     None of the marketplace money, counter, invoice, upload or posting below
     applies to it. creator_leg_context returns this creator's own leg only. */
  if ((deal as { leg_role?: string | null }).leg_role === 'creator_leg') {
    const { data: legCtx, error: legErr } = await supabase.rpc('creator_leg_context', { p_deal_id: params.id })
    if (legErr || !legCtx) notFound()
    const lc = legCtx as CreatorLegContext
    // 0561: the videos Guapd sent this creator (their own deal only).
    const { data: collabRows } = await supabase.rpc('creator_collab_posts', { p_deal_id: params.id })
    /* 0546: the brief's attachments are signed here with the service key, but
       only the paths creator_leg_context just returned for THIS creator's own
       leg (their own brief, else the shared one), and only inside this
       Experience's brief folder. One hour, like the campaign brief. */
    const legAttachmentUrls: Record<string, string> = {}
    const legAtts = (lc.brief_detail?.attachments ?? []).filter((a) => typeof a.storage_path === 'string' && a.storage_path.startsWith('experience-briefs/'))
    if (legAtts.length > 0) {
      const admin = createAdminClient()
      const signed = await Promise.all(legAtts.map((a) => admin.storage.from('deal-files').createSignedUrl(a.storage_path, 3600)))
      signed.forEach((r, i) => { if (r.data?.signedUrl) legAttachmentUrls[legAtts[i].storage_path] = r.data.signedUrl })
    }
    // 0552: prefills the invoice form; the creator can change it.
    const { data: me } = await supabase.from('creators').select('full_name').eq('user_id', profileId).maybeSingle()
    // 0580: an invoice needs the bank account on file; the form asks for it first.
    const { data: payoutDetails } = await supabase.rpc('creator_payout_details')
    return <CreatorLegView dealId={params.id} ctx={lc} attachmentUrls={legAttachmentUrls} collabPosts={(collabRows ?? []) as CreatorCollabPost[]} creatorName={(me?.full_name as string | undefined) ?? ''} bankOnFile={(payoutDetails as { on_file?: boolean; pan_masked?: string | null } | null)?.on_file === true && !!(payoutDetails as { pan_masked?: string | null } | null)?.pan_masked}
      messages={(messages ?? []).map((m) => ({ id: m.id as string, deal_id: m.deal_id as string, sender_party: m.sender_party as 'brand' | 'creator', body: m.body as string | null, created_at: m.created_at as string }))}
      events={(events ?? []) as { id: string; event_type: string; detail: any; created_at: string }[]}
      unread={await unreadNotificationCount(supabase, profileId)}
      autoOpenChat={searchParams?.chat === '1'} />
  }

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
  const brandLogo = ((Array.isArray(rawBrand) ? rawBrand[0] : rawBrand) as { logo_url?: string | null } | null)?.logo_url ?? null
  const canSubmit = deal.status === 'agreed' || deal.status === 'revision'
  const hasStructuredItems = items && items.length > 0
  const isNegotiating = deal.status === 'negotiating'
  const sm = STATUS_META[deal.status] ?? STATUS_META.negotiating
  const invoiceIssuedOrLater = invoice && (invoice.status === 'issued' || invoice.status === 'accepted' || invoice.status === 'paid')
  const isCompleted = invoice?.status === 'paid' || (!invoice && (deal.status === 'paid' || deal.status === 'complete'))

  // Fee calculation
  const feeMode = (deal.fee_mode as 'on_top' | 'deducted') ?? 'deducted'

  // Deliverable rows in the shape the shared breakdown reads.
  const itemsForBreakdown = (items ?? []) as unknown as BreakdownItem[]

  const dealFeeBasis = (deal as Record<string, unknown>).fee_basis as string | null ?? null
  const goLiveDateStr = (deal as Record<string, unknown>).go_live_date as string | null ?? null
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

  /* NEGOTIATING vs OFFER RECEIVED. Both are status 'negotiating' — what
     separates them is whether anyone has countered yet. One counter event and
     the screen is a negotiation, so it says so and shows the two numbers on
     the table instead of only the brand's.

     "Their counter" is the brand's CURRENT number: their own counter if they
     have made one, otherwise the price still standing on the deal. A creator's
     counter deliberately does not move deal.price_paise — the brand accepting
     it is what does that (deals/[id]/deal-actions.ts) — so reading the price
     here would show the creator their own ask as the brand's offer. */
  const creatorCounterDetail = (events ?? [])
    .filter((e) => e.event_type === 'deal.counter_offer')
    .at(-1)?.detail as { counter_total_paise?: number } | undefined

  const lastNegotiationAt = negotiationEvents.at(-1)?.created_at ?? null

  /* WHO MOVED LAST decides which of the two negotiating screens the creator
     sees, and it has to come from the events. deals.last_offer_by looks like
     the field for this and is not: createDeal writes 'brand' and neither
     counter action ever updates it, so on GD-1068 - a deal the creator
     countered - it still reads 'brand'. Trusting it would show a creator the
     respond-now screen for their own ask.

     Compare the newest counter from each side instead. That is a fact neither
     action can forget to write, because writing the event IS the counter. */
  const lastCreatorCounterAt = (events ?? [])
    .filter((e) => e.event_type === 'deal.counter_offer').at(-1)?.created_at ?? null
  const lastBrandCounterAt = (events ?? [])
    .filter((e) => e.event_type === 'deal.brand_counter').at(-1)?.created_at ?? null

  const counterState = isNegotiating && negotiationEvents.length > 0
    ? {
        lastBy: (lastBrandCounterAt ?? '') > (lastCreatorCounterAt ?? '')
          ? ('brand' as const)
          : ('creator' as const),
        theirPaise: brandCounterDetail?.counter_total_paise ?? deal.price_paise ?? null,
        youAskedPaise: creatorCounterDetail?.counter_total_paise ?? null,
        at: lastNegotiationAt ? formatDate(lastNegotiationAt) : null,
      }
    : null

  // Brief data
  const pitch = campaignBrief?.pitch ?? (deal as any).brief_pitch ?? null
  const guidelines = campaignBrief?.guidelines ?? (deal as any).brief_guidelines ?? null
  const avoid = (deal as any).brief_avoid as string | null
  const briefAttachments = ((deal as any).brief_attachments ?? []) as { name: string; storage_path: string; size_bytes: number; content_type: string }[]

  /* SIGNED WITH THE ADMIN CLIENT, not the creator's session.
     The brand uploads these into deal-files, and storage RLS on the object
     refuses a signature to anyone but the uploader - so createSignedUrl
     returned nothing for the creator, the url stayed null, and the attachment
     rendered as plain text with no way to open it. The brand's own view worked,
     which is why it looked fine from that side.

     Safe here because the deal itself was fetched through the creator's own
     session a few lines up: RLS has already established that this deal is
     theirs, and these are the files the brand attached FOR them. Still a
     one-hour signature rather than a permanent link. */
  const attachmentUrls: Record<string, string> = {}
  if (briefAttachments.length > 0) {
    const admin = createAdminClient()
    const results = await Promise.all(
      briefAttachments.map((att) =>
        admin.storage.from('deal-files').createSignedUrl(att.storage_path, 3600)
      )
    )
    results.forEach((res, i) => {
      if (res.data?.signedUrl) {
        attachmentUrls[briefAttachments[i].storage_path] = res.data.signedUrl
      }
    })
  }

  /* The offer and AGREED states have phone screens. Every other state keeps
     the existing page on mobile, because only these were designed. */
  const isAgreedMobile = deal.status === 'agreed'
  /* 'delivered' is what the export calls Submitted: the creator has sent the
     work and the brand is reviewing. 'revision' is a different screen and is
     deliberately not folded in here. */
  const isSubmittedMobile = deal.status === 'delivered'
  const isRevisionMobile = deal.status === 'revision'
  /* Approved but not yet posted. Once everything is posted the deal moves on to
     paid/complete, which have no phone design yet. */
  const isApprovedMobile = deal.status === 'approved'
  /* Paid or complete. The deal is closed and the screen becomes a record. */
  const isCompleteMobile = deal.status === 'paid' || deal.status === 'complete'
  /* Issued means the brand has been asked; a draft has not been sent and is no
     different from having none. Mirrors the deals list. */
  const invoiceIssued = !!invoice && (invoice.status === 'issued' || invoice.status === 'accepted')
  const showMobileScreen = isNegotiating || isAgreedMobile || isSubmittedMobile || isRevisionMobile || isApprovedMobile || isCompleteMobile
  const offerUnread = showMobileScreen ? await unreadNotificationCount(supabase, profileId) : 0
  const splitLines = (v: unknown): string[] =>
    typeof v === 'string'
      ? v.split('\n').map((l) => l.replace(/^\s*[-•\d.)]+\s*/, '').trim()).filter(Boolean)
      : []
  // Shared by both renderings (the phone used to show only "The brand will ship product").
  const shipmentCard = deal.requires_shipment && !['declined', 'cancelled'].includes(deal.status) ? (
                    <div id="shipment" className="surface" style={{ padding: '22px 24px' }}>
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
  ) : null
  // A deal with no line items: one deliverable, versioned. Shared by both renderings.
  const legacyDeliverables = (
                    <div className="surface" style={{ padding: '22px 24px' }}>
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
  // Rating the brand once the deal is done. Shared by both renderings.
  const reviewCard = isCompleted ? (
    <CreatorReviewCard dealId={deal.id} brandName={brand} existingRating={existingReview?.rating} existingNote={existingReview?.note} />
  ) : null

  return (
    <>
    {showMobileScreen && (
      <CreatorOfferMobile
        stage={isCompleteMobile ? 'complete'
          : isApprovedMobile && invoiceIssued ? 'invoiced'
          : isApprovedMobile ? 'approved' : isRevisionMobile ? 'revision' : isSubmittedMobile ? 'submitted' : isAgreedMobile ? 'agreed' : 'offer'}
        approvedAt={(() => {
          const e = (events ?? []).filter((x: any) => x.event_type === 'deal.status_changed' && (x.detail?.to === 'approved' || x.detail?.new_status === 'approved')).pop()
          return e ? formatDate(e.created_at) : (deal.agreed_at ? null : null)
        })()}
        allPosted={items && items.length > 0 ? items.every((i) => !!(i as Record<string, unknown>).posted_url) : !!deal.is_posted}
        feeMode={feeMode}
        shipmentNode={shipmentCard}
        reviewNode={reviewCard}
        paidAt={invoice?.paid_at ? formatDate(invoice.paid_at) : (deal.completed_at ? formatDate(deal.completed_at) : null)}
        analyticsHref={`/creator/deals/${deal.id}/analytics`}
        invoiceAccepted={invoice?.status === 'accepted'}
        invoiceDueLabel={formatDueStatus(invoice?.due_date ?? null)?.text ?? null}
        invoiceNode={(isApprovedMobile || isCompleteMobile) ? (
          <MobileInvoiceCard
            dealId={deal.id}
            dealRef={deal.deal_ref}
            hasDraft={!!invoice}
            issued={invoiceIssued}
            accepted={invoice?.status === 'accepted'}
            paid={invoice?.status === 'paid' || isCompleteMobile}
            paidAt={invoice?.paid_at
              ? `${formatDate(invoice.paid_at)}, ${new Date(invoice.paid_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`
              : null}
            acceptedAt={invoice?.accepted_at ? formatDate(invoice.accepted_at) : null}
            issuedAt={invoice?.issued_at ? formatDate(invoice.issued_at) : null}
            dueLabel={formatDueStatus(invoice?.due_date ?? null)?.text ?? null}
            dueUrgent={formatDueStatus(invoice?.due_date ?? null)?.urgent ?? false}
            feeMode={feeMode}
            basePaise={invoice ? invoice.base_paise : deal.price_paise}
            feePaise={invoice ? invoice.fee_paise : (fee?.fee_paise ?? null)}
            feePercent={invoice ? invoice.fee_percent : (deal.fee_percent ?? null)}
            receivesPaise={invoice ? invoice.creator_receives_paise : creatorReceives}
          />
        ) : null}
        postNode={(isApprovedMobile || isCompleteMobile) ? (
          <PostedCard
            dealId={deal.id}
            /* No line items: one deal-level post, as on desktop. */
            items={!items || items.length === 0 ? undefined : items.map((i) => ({
              id: i.id,
              label: i.label,
              platform: i.platform,
              posted_url: (i as Record<string, unknown>).posted_url as string | null,
              posted_at: (i as Record<string, unknown>).posted_at as string | null,
            }))}
            timelineDate={deal.timeline_date}
            compact
          />
        ) : null}
        reviewedAt={(() => {
          const e = (events ?? []).filter((x: any) => x.event_type === 'deal.status_changed' && (x.detail?.to === 'revision' || x.detail?.new_status === 'revision')).pop()
          return e ? formatDate(e.created_at) : null
        })()}
        submittedAt={(() => {
          const ts = (items ?? []).map((i) => i.submitted_at).filter(Boolean).sort().at(-1)
          return ts ? formatDate(ts as string) : null
        })()}
        agreedAt={deal.agreed_at ? formatDate(deal.agreed_at) : null}
        rightsConfirmedAt={deal.rights_confirmed_at
          ? `${formatDate(deal.rights_confirmed_at)}, ${new Date(deal.rights_confirmed_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`
          : null}
        submitDone={items ? items.filter((i) => i.submitted_at != null).length : 0}
        submitTotal={items ? items.length : 0}
        submitNode={!(isAgreedMobile || isSubmittedMobile || isRevisionMobile || isApprovedMobile || isCompleteMobile) ? null
          : items && items.length > 0
            ? <DeliverableItems dealId={deal.id} items={items} canSubmit={canSubmit} dealStatus={deal.status} brandName={brand} hideStatusBanner compact completed={isCompleteMobile} />
            /* No line items: the versioned single deliverable and its upload, as on desktop. */
            : legacyDeliverables}
        brandName={brand}
        dealTitle={deal.title ?? 'Untitled deal'}
        receivesPaise={creatorReceives}
        totalPaise={deal.price_paise ?? null}
        feePaise={fee?.fee_paise ?? null}
        feePercent={deal.fee_percent ?? null}
        feeBasis={(deal as Record<string, unknown>).fee_basis as string | null ?? null}
        paymentTerms={deal.payment_terms ?? null}
        /* "Payment in 30 days" from the agreed terms. Terms are free text, so
           a day count is only stated when one is actually written there —
           otherwise the terms line above already says it in full. */
        /* Was: regex a day count out of the terms, else assume 30 days. That
           told a creator on a 100% ADVANCE deal - paid up front - to expect the
           money in 30 days. Structures with no day count are not 30-day
           structures, and paymentWhenLabel returns null rather than inventing
           one; the full terms line beside this already says it. */
        paymentIn={paymentWhenLabel(deal.payment_terms)}
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
          // The terms on each deliverable, as the desktop chips say them.
          detail: [
            i.handle ? (i.handle.startsWith('@') ? i.handle : `@${i.handle}`) : null,
            i.reel_type ? (i.reel_type === 'collab' ? 'Collab' : 'Non-collab') : null,
            i.boosting_rights ? `Boosting ${i.boosting_duration_months ? `${i.boosting_duration_months} months` : 'no end date'}` : null,
          ].filter(Boolean).join(' \u00B7 ') || null,
        }))}
        extraTermRows={[
          ...(goLiveDateStr ? [{ label: 'Go live', value: formatDate(goLiveDateStr) }] : []),
          ...(deal.usage_rights_end_date ? [{ label: 'Rights expire', value: formatDate(deal.usage_rights_end_date + 'T00:00:00') }] : []),
        ]}
        offerExtraNode={(isNegotiating && showNegotiationHistory) || hasAddons(itemsForBreakdown) ? (
          <div style={{ display: 'grid', gap: 12, margin: '12px 0' }}>
            {hasAddons(itemsForBreakdown) && <DealBreakdown items={itemsForBreakdown} totalPaise={deal.price_paise} />}
            {isNegotiating && showNegotiationHistory && <NegotiationHistory events={negotiationEvents} variant="creator" brandName={brand} />}
          </div>
        ) : null}
        isPosted={!!deal.is_posted}
        briefPitch={pitch}
        guidelines={splitLines(guidelines)}
        avoid={splitLines(avoid)}
        attachments={briefAttachments.map((a) => ({
          name: a.name,
          // Signed, and already fetched above for the desktop list.
          url: attachmentUrls[a.storage_path] ?? null,
        }))}
        messageHref={`/creator/inbox?deal=${deal.id}&from=deal`}
        counter={counterState}
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
    {/* Hidden on mobile for EVERY state that has a phone screen. This said
        isNegotiating, so when the agreed screen was added the desktop page
        stopped being hidden for agreed deals and rendered underneath it - the
        whole page again, below the fold. */}
    <main className={showMobileScreen ? 'offer-desktop' : undefined} style={wrapper}>
      <RealtimeDealListener dealId={deal.id} />
      <DealShellStyles />

      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div className="frame reveal" style={{ width: '100%', maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 36 }}>

          {/* ── Editorial hero (shared with Experience legs: deal-shell.tsx) ── */}
          <DealHeroCard
            brand={brand}
            brandLogo={brandLogo}
            meta={<>
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
            </>}
            headline={isNegotiating && hasBrandCounter ? 'Counter received from '
                    : isNegotiating ? 'Offer received from '
                    : deal.status === 'delivered' ? 'Delivered to '
                    : deal.status === 'revision' ? 'Changes asked by '
                    : (invoice && invoice.status === 'paid') || deal.status === 'paid' || deal.status === 'complete' ? 'Wrapped with '
                    : invoice && invoice.status === 'accepted' ? 'Invoice accepted by '
                    : invoice && invoice.status === 'issued' ? 'Invoice sent to '
                    : deal.status === 'approved' ? 'Approved by '
                    : 'Deal with '}
            chatLabel="Message brand"
            statusDot={(invoice?.status === 'paid' || (!invoice && (deal.status === 'paid' || deal.status === 'complete'))) ? 'var(--neon)' : invoiceIssuedOrLater ? 'var(--warning)' : sm.dot}
            statusGlow={(invoice?.status === 'paid' || (!invoice && (deal.status === 'paid' || deal.status === 'complete'))) ? 'color-mix(in oklab, var(--neon) 22%, transparent)' : invoiceIssuedOrLater ? 'rgba(200,154,60,.22)' : sm.glow}
            statusLabel={(invoice?.status === 'paid' || (!invoice && (deal.status === 'paid' || deal.status === 'complete'))) ? 'Complete' : invoiceIssuedOrLater ? 'Invoice' : sm.label}
            statusLine={<>{(() => {
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
                })()}</>}
          />

          {/* ── "Ready to decide?" CTA (negotiating only) ── */}
          {isNegotiating && (
            <ReadyToDecideBar
              title={hasBrandCounter ? 'New counter from the brand' : 'Ready to decide?'}
              sub={hasBrandCounter ? 'Review the updated terms below and respond.' : 'Scroll down to review terms and respond.'}
            />
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
          {(isNegotiating || deal.status === 'agreed') && (
            <TermsCard
              heading={isNegotiating ? 'Offer terms' : 'Agreed terms'}
              agreedLabel={deal.agreed_at ? `Agreed ${new Date(deal.agreed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${new Date(deal.agreed_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}` : null}
              title={hasStructuredItems ? items.map((i) => i.label).join(' + ') : deal.deliverables || 'TBD'}
              sub={items && items.length > 0 && items[0].platform ? `${items[0].platform}${deal.timeline_date ? ` \u00B7 deliver by ${formatDate(deal.timeline_date + 'T00:00:00')}` : ''}` : null}
              side={[
                ...(deal.timeline_date ? [{ label: 'Deliver by', value: formatDate(deal.timeline_date + 'T00:00:00') }] : []),
                ...(deal.revision_limit != null ? [{ label: 'Revisions', value: revTerms.unlimited ? `${deal.revisions_used ?? 0} \u00B7 unlimited` : `${deal.revisions_used ?? 0} / ${revTerms.limit}` }] : []),
              ]}
              receiveLabel={`You receive${deal.payment_terms ? `, ${deal.payment_terms.toLowerCase()}` : ''}`}
              receive={creatorReceives != null ? formatINR(creatorReceives) : null}
            />
          )}

          {/* ── Deliverable items breakdown (during negotiating only) ── */}
          {hasStructuredItems && isNegotiating && (
            <DeliverablesCard
              count={`${items.length} item${items.length !== 1 ? 's' : ''}`}
              rows={items.map((item, idx) => (
                <DeliverableRow key={item.id} last={idx === items.length - 1}
                  icon={item.platform?.toLowerCase().includes('youtube') ? 'youtube' : 'instagram'}
                  label={item.label}
                  price={item.price_paise != null && item.price_paise > 0 ? formatINR(item.price_paise) : null}
                  chips={[
                    <span key="h" style={chipStyle}>
                      {item.platform?.toLowerCase().includes('youtube') ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m10 8 6 4-6 4V8z" /><rect x="2" y="3" width="20" height="18" rx="4" /></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="12" cy="12" r="4.5" /><circle cx="17.5" cy="6.5" r="1" /></svg>
                      )}
                      {item.handle?.startsWith('@') ? item.handle : `@${item.handle}`}
                    </span>,
                    ...(item.reel_type ? [<span key="r" style={chipStyle}>{item.reel_type === 'collab' ? 'Collab' : 'Non-collab'}</span>] : []),
                    ...(item.boosting_rights ? [<span key="b" style={chipStyle}>Boosting {item.boosting_duration_months ? `${item.boosting_duration_months}mo` : '\u221E'}</span>] : []),
                  ]}
                />
              ))}
            >

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
                  {/* A zero fee renders neither row above, so without this the
                      line simply disappears and the creator is left to guess.
                      Reason comes from fee_basis, never from the amount. */}
                  {zeroFeeNote(deal.fee_percent, dealFeeBasis, 'creator') && (
                    <div style={termRow}>
                      <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Platform fee</span>
                      <b style={{ fontSize: 14, fontWeight: 700 }}>{zeroFeeNote(deal.fee_percent, dealFeeBasis, 'creator')}</b>
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
              {goLiveDateStr && (
                <div style={termRow}>
                  <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Go live</span>
                  <b style={{ fontSize: 14, fontWeight: 700 }}>{formatDate(goLiveDateStr)}</b>
                </div>
              )}
              {/* Legacy: only deals agreed before 0501 carry usage rights. */}
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
                <CardActions>
                  <AcceptDecline dealId={deal.id} items={items.map((i) => ({ id: i.id, label: i.label, price_paise: i.price_paise ?? 0 }))} />
                </CardActions>
              )}
            </DeliverablesCard>
          )}

          {/* ── Non-structured terms fallback (negotiating/agreed only) ── */}
          {!hasStructuredItems && (isNegotiating || deal.status === 'agreed') && (
            <div className="surface" style={{ padding: '22px 24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {deal.deliverables && <TermRow label="Deliverables" value={deal.deliverables} />}
                {goLiveDateStr && <TermRow label="Go live" value={formatDate(goLiveDateStr)} />}
                {/* Legacy: only deals agreed before 0501 carry usage rights. */}
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
                  // Brief content (shared between open and collapsed modes)
                  const briefContent = (
                    <BriefBlock
                      pitch={pitch}
                      guidelines={guidelines}
                      avoid={avoid}
                      attachments={briefAttachments}
                      attachmentUrls={attachmentUrls}
                      defaultOpen={!deal.agreed_at}
                      middle={
                        <>
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
                        </>
                      }
                    />
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
                  return <div key="shipment">{shipmentCard}</div>

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
                  return <div key="deliverables">{legacyDeliverables}</div>

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
          {reviewCard}

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

