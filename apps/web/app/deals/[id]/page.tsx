import { createClient } from '@/lib/supabase/server'
import { verifyBrand } from '@/lib/brand-auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import DealThread from './DealThread'
import OpenDealChat from '@/components/OpenDealChat'
import ItemReview from './ItemReview'
import BrandInvoiceCard from './BrandInvoiceCard'
import { calculateFee } from '@/lib/fee'
import DealBreakdown, { hasAddons, type BreakdownItem } from '@/components/DealBreakdown'
import { revisionTerms, revisionLabel, overagePaise } from '@/lib/revisions'
import { deriveDisplayStatus } from '@/lib/deal-status'
import RealtimeDealListener from '@/components/RealtimeDealListener'
import ViewFileButton from './ViewFileButton'
import ShipmentCard from './ShipmentCard'
import BriefDetailsToggle from './BriefDetailsToggle'
import StepperTimeline from './StepperTimeline'
import PaymentBreakup from './PaymentBreakup'
import CollapsibleSection from './CollapsibleSection'
import BrandReviewCard from './BrandReviewCard'
import HeldNotice from '@/components/HeldNotice'

function formatRupees(paise: number): string {
  const rupees = paise / 100
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

const STATUS_TO_STEP: Record<string, number> = {
  negotiating: 1,
  agreed: 2,
  delivered: 3,
  revision: 3,
  approved: 4,
  paid: 6,
  complete: 7,
  declined: -1,
  cancelled: -1,
}

const STATUS_DOT_COLORS: Record<string, string> = {
  negotiating: 'var(--warning)',
  agreed: 'var(--info, #5AA9E6)',
  delivered: 'var(--info, #5AA9E6)',
  revision: 'var(--warning)',
  approved: 'var(--success, #1F9D6B)',
  paid: 'var(--success, #1F9D6B)',
  complete: 'var(--success, #1F9D6B)',
  declined: 'var(--danger, #D2545A)',
  cancelled: 'var(--ink-faint)',
}

const STATUS_DISPLAY: Record<string, string> = {
  negotiating: 'Negotiating',
  agreed: 'Agreed',
  delivered: 'Submitted',
  revision: 'Revision requested',
  approved: 'Approved',
  paid: 'Paid',
  complete: 'Complete',
  declined: 'Declined',
  cancelled: 'Cancelled',
}

const NEXT_LABELS: Record<string, string> = {
  negotiating: 'Next \u00B7 agree terms',
  agreed: 'Next \u00B7 awaiting deliverable',
  delivered: 'Next \u00B7 review & approve',
  revision: 'Next \u00B7 awaiting revision',
  approved: 'Next \u00B7 invoice & payment',
  paid: 'Next \u00B7 complete',
  complete: 'Deal complete',
}

export default async function DealPage({ params, searchParams }: {
  params: { id: string }
  searchParams: { chat?: string }
}) {
  const brand = await verifyBrand()

  const supabase = createClient()

  const [{ data: deal, error: dealError }, { data: events }, { data: messages }, { data: items }, { data: invoice }] = await Promise.all([
    supabase
      .from('deals')
      .select('id, deal_ref, title, deliverables, price_paise, price_per_extra_revision_paise, fee_percent, fee_mode, status, held_at, timeline_date, revision_limit, revisions_used, usage_rights, payment_terms, last_offer_by, created_at, updated_at, agreed_at, completed_at, requires_shipment, shipment_status, tracking_link, carrier_note, shipped_at, shipping_address, is_posted, posted_url, posted_at, usage_rights_end_date, rights_confirmed_at, campaign_id, brief_pitch, brief_guidelines, brief_avoid, brief_attachments, creators(id, full_name, handle, profile_photo_url)')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('events')
      .select('id, event_type, detail, created_at')
      .eq('deal_id', params.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('messages')
      .select('id, deal_id, sender_party, body, created_at')
      .eq('deal_id', params.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('deal_deliverable_items')
      .select('id, label, platform, handle, item_status, external_url, storage_path, file_name, version, price_paise, reel_type, boosting_rights, boosting_duration_months, collab_charge_paise, collab_rate_type, collab_rate_value, boosting_days, boosting_charge_paise, boosting_30day_paise, submitted_at, approved_at, updated_at, revision_note')
      .eq('deal_id', params.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('invoices')
      .select('id, status, base_paise, overage_paise, fee_paise, fee_percent, fee_mode, brand_pays_paise, creator_receives_paise, payment_terms, due_date, issued_at, accepted_at')
      .eq('deal_id', params.id)
      .maybeSingle(),
  ])

  if (dealError || !deal) notFound()

  const isCompleted = ['paid', 'complete'].includes(deal.status)

  let brandReview: { rating: number; note: string | null } | null = null
  if (isCompleted) {
    const { data: review } = await supabase
      .from('deal_reviews')
      .select('rating, note')
      .eq('deal_id', deal.id)
      .eq('reviewer_role', 'brand')
      .maybeSingle()
    brandReview = review ?? null
  }

  let campaignName: string | null = null
  let campaignBrief: { pitch: string | null; guidelines: string | null } | null = null
  if (deal.campaign_id) {
    const { data: camp } = await supabase
      .from('campaigns')
      .select('name, brief_pitch, brief_guidelines')
      .eq('id', deal.campaign_id)
      .maybeSingle()
    campaignName = camp?.name ?? null
    if (camp?.brief_pitch || camp?.brief_guidelines) {
      campaignBrief = { pitch: (camp as Record<string, unknown>).brief_pitch as string | null, guidelines: (camp as Record<string, unknown>).brief_guidelines as string | null }
    }
  }

  const rawCreator = deal.creators as unknown
  const creator = Array.isArray(rawCreator)
    ? (rawCreator[0] as { id: string; full_name: string; handle: string | null; profile_photo_url: string | null } | undefined) ?? null
    : (rawCreator as { id: string; full_name: string; handle: string | null; profile_photo_url: string | null } | null)

  const derived = deriveDisplayStatus(deal.status, invoice?.status ?? null, invoice?.due_date ?? null)
  const hasItems = items && items.length > 0
  const canReview = hasItems && (deal.status === 'delivered' || deal.status === 'revision')
  const firstName = creator?.full_name.split(' ')[0] ?? 'Creator'
  const hasInvoice = !!invoice
  const currentStepIndex = hasInvoice && deal.status === 'approved' ? 5 : (STATUS_TO_STEP[deal.status] ?? 0)
  const statusDotColor = hasInvoice && deal.status === 'approved' ? 'var(--warning)' : (STATUS_DOT_COLORS[deal.status] ?? 'var(--ink-faint)')
  const statusLabel = hasInvoice && deal.status === 'approved' ? 'Invoice' : (STATUS_DISPLAY[deal.status] ?? derived.label)
  const nextLabel = hasInvoice && deal.status === 'approved' ? 'Next \u00B7 payment' : (NEXT_LABELS[deal.status] ?? '')

  // Fee calculation

  /* Deliverable rows in the shape the shared breakdown reads. Cast because this
     page's item type is inferred from its select string, which now carries the
     add-on columns. */
  const itemsForBreakdown = (items ?? []) as unknown as BreakdownItem[]

  const feeInfo = deal.price_paise != null && deal.price_paise > 0
    ? calculateFee(deal.price_paise, deal.fee_percent ?? 0, (deal.fee_mode as 'on_top' | 'deducted') ?? 'on_top')
    : null
  const revTerms = revisionTerms(deal.revision_limit, deal.price_per_extra_revision_paise)
  const extra = revTerms.unlimited ? 0 : Math.max(0, (deal.revisions_used ?? 0) - revTerms.limit)
  const overage = overagePaise(revTerms, deal.revisions_used ?? 0)
  const brandTotal = feeInfo ? feeInfo.brand_pays_paise + overage : (deal.price_paise ?? 0) + overage

  // Brief content
  const briefPitch = (deal as any).brief_pitch ?? campaignBrief?.pitch ?? null
  const briefGuidelines = (deal as any).brief_guidelines ?? campaignBrief?.guidelines ?? null
  const briefAvoid = (deal as any).brief_avoid as string | null
  const briefAttachments = ((deal as any).brief_attachments ?? []) as { name: string; storage_path: string; size_bytes: number; content_type: string }[]

  // Generate signed URLs for brief attachments
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

  // Group items by platform+handle for deliverables display
  const groupedItems = new Map<string, typeof items>()
  if (hasItems) {
    for (const item of items) {
      const key = `${item.platform}::${item.handle}`
      if (!groupedItems.has(key)) groupedItems.set(key, [])
      groupedItems.get(key)!.push(item)
    }
  }

  return (
    <main style={{ flex: '1 1 0%', minWidth: 0, padding: 'clamp(18px, 2.4vw, 30px) clamp(22px, 4vw, 56px) clamp(56px, 6vw, 96px)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <RealtimeDealListener dealId={deal.id} />

        {/* The most important place this can appear. The deal reads
            "Negotiating" with a timeline and an open thread, so without this
            the brand waits on a creator who was never told the deal exists.
            Gated on THIS deal being held, not on the account having holds —
            on a deal page the relevant fact is this deal. */}
        {(deal as { held_at?: string | null }).held_at && (
          <HeldNotice
            heldCount={1}
            status={brand.brandStatus}
            rejectionReason={brand.rejectionReason}
          />
        )}

        {/* ── Hero card ── */}
        <div className="surface" style={{ padding: '28px 30px' }}>
          <Link href="/deals" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', whiteSpace: 'nowrap', textDecoration: 'none' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            Back to deals
          </Link>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                {campaignName ? `${campaignName} \u00B7 ` : ''}{deal.deal_ref ?? ''}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 0' }}>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 3.4vw, 34px)', fontWeight: 700, letterSpacing: '-0.025em', margin: 0 }}>
                  {deal.title || <>Deal with{' '}<span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400 }}>{firstName}</span></>}
                </h1>
                {['paid', 'complete'].includes(deal.status) && creator && (
                  <>
                    <Link
                      href={`/browse/${creator.id}`}
                      aria-label="Storefront"
                      style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card)', border: '1px solid var(--frost-edge, var(--hairline))', textDecoration: 'none' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" /><path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9" /><path d="M12 3v6" /></svg>
                    </Link>
                    <OpenDealChat
                      aria-label={`Message ${firstName}`}
                      style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card)', border: '1px solid var(--frost-edge, var(--hairline))', textDecoration: 'none' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                    </OpenDealChat>
                  </>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flex: '0 0 auto' }}>
              {['paid', 'complete'].includes(deal.status) && creator ? (
                <>
                  <Link
                    href={`/deals/new?from=${deal.id}`}
                    className="neonbtn"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 18px', borderRadius: 11, background: 'var(--neon)', border: 'none', boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, color: 'var(--ink)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></svg>
                    Re-engage {firstName}
                  </Link>
                  <Link href={`/deals/${deal.id}/analytics`} className="pill" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 42, padding: '0 16px', borderRadius: 11, background: 'var(--card)', border: '1px solid var(--frost-edge, var(--hairline))', boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 8px 16px rgba(22,23,15,.04)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', textDecoration: 'none', whiteSpace: 'nowrap' }}>View analytics</Link>
                </>
              ) : (
                <>
                  {creator && (
                    <Link
                      href={`/browse/${creator.id}`}
                      aria-label="Storefront"
                      style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card)', border: '1px solid var(--frost-edge, var(--hairline))', boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 8px 16px rgba(22,23,15,.04)', textDecoration: 'none' }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" /><path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9" /><path d="M12 3v6" /></svg>
                    </Link>
                  )}
                  {creator && (
                    <OpenDealChat
                      className="neonbtn"
                      aria-label={`Message ${firstName}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        height: 40, padding: '0 18px', borderRadius: 11,
                        background: 'var(--neon)', border: 'none',
                        boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
                        fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, color: 'var(--ink)',
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      {/* Named, not a bare icon. The creator side already said
                          "Message brand"; an unlabelled circle on the other side
                          left a brand guessing what it did. */}
                      Message {firstName}
                    </OpenDealChat>
                  )}
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border-hairline)', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: statusDotColor, boxShadow: `0 0 0 4px color-mix(in oklab, ${statusDotColor} 22%, transparent)` }} />
              {statusLabel}
            </span>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              {deal.status === 'negotiating' && `Awaiting ${firstName}'s response`}
              {deal.status === 'agreed' && 'Terms agreed, awaiting deliverable'}
              {deal.status === 'delivered' && 'Deliverable submitted, your review is needed'}
              {deal.status === 'revision' && `Revision requested, ${firstName} is working on changes`}
              {deal.status === 'approved' && !invoice && 'Deliverable approved'}
              {deal.status === 'approved' && invoice && (
                <>Invoice sent {invoice.issued_at ? new Date(invoice.issued_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}{invoice.due_date && <> &middot; pay by <b style={{ color: 'var(--ink)' }}>{new Date(invoice.due_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</b></>}</>
              )}
              {deal.status === 'paid' && 'Payment completed'}
              {deal.status === 'complete' && 'This deal is complete'}
              {deal.status === 'declined' && `${firstName} declined this offer`}
              {deal.status === 'cancelled' && 'This deal was cancelled'}
            </span>
          </div>
        </div>

        {/* ── Progress stepper with expandable timeline ── */}
        {deal.status !== 'declined' && deal.status !== 'cancelled' && (
          <StepperTimeline
            currentStepIndex={currentStepIndex}
            nextLabel={nextLabel}
            events={(events ?? []) as { id: string; event_type: string; detail: any; created_at: string }[]}
          />
        )}

        {/* ── Agreed confirmation card (agreed stage only) ── */}
        {deal.agreed_at && deal.status === 'agreed' && (
          <div className="surface" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: 'var(--neon-deep)', boxShadow: '0 0 0 4px color-mix(in oklab, var(--neon) 22%, transparent)' }} />
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink)' }}>
                Agreed on {new Date(deal.agreed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '12px 0 0', maxWidth: 640 }}>
              {firstName} accepted at {deal.price_paise ? formatRupees(deal.price_paise) : 'the offered terms'}.
              {deal.requires_shipment
                ? ` A product kit needs to get to ${firstName.toLowerCase()} to get the deal going. Ship it below to start the delivery window.`
                : deal.status === 'agreed'
                  ? ` Awaiting ${firstName.toLowerCase()} to submit deliverables.`
                  : ''}
            </p>
          </div>
        )}

        {/* ── Deal complete (paid) ── */}
        {invoice && invoice.status === 'paid' && (
          <div className="surface" style={{ padding: 24 }}>
            <BrandInvoiceCard
              dealId={deal.id}
              dealRef={deal.deal_ref}
              invoice={invoice}
              creatorFirstName={firstName}
              creatorId={creator?.id}
              usageRightsEndDate={deal.usage_rights_end_date}
              paidAt={(deal as any).paid_at ?? null}
            />
          </div>
        )}

        {/* ── Invoice (unpaid — expanded) ── */}
        {invoice && invoice.status !== 'paid' && (
          <div className="surface" style={{ padding: 24 }}>
            <BrandInvoiceCard
              dealId={deal.id}
              dealRef={deal.deal_ref}
              invoice={invoice}
              lineItems={hasItems ? items.filter(i => i.price_paise != null && i.price_paise > 0).map(i => ({ label: i.label, pricePaise: i.price_paise! })) : undefined}
              creatorFirstName={firstName}
              creatorId={creator?.id}
              usageRightsEndDate={deal.usage_rights_end_date}
              paidAt={null}
            />
          </div>
        )}

        {/* ── Invoice details (paid — collapsible) ── */}
        {invoice && invoice.status === 'paid' && (
          <CollapsibleSection
            title="Invoice"
            subtitle={`Paid${invoice.accepted_at ? ` ${new Date(invoice.accepted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}`}
          >
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 16 }}>
              {hasItems && items.filter(i => i.price_paise != null && i.price_paise > 0).map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{item.label}</span>
                  <b style={{ fontSize: 14, fontWeight: 700 }}>{formatRupees(item.price_paise!)}</b>
                </div>
              ))}
              {invoice.fee_paise > 0 && (
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Platform fee ({invoice.fee_percent}%)</span>
                  <b style={{ fontSize: 14, fontWeight: 700 }}>{invoice.fee_mode === 'deducted' ? `\u2212${formatRupees(invoice.fee_paise)}` : formatRupees(invoice.fee_paise)}</b>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Creator received</span>
                <b style={{ fontSize: 14, fontWeight: 700 }}>{formatRupees(invoice.creator_receives_paise)}</b>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '18px 24px', margin: '22px 0 0', borderRadius: 14, background: 'var(--ink)', color: '#FFFFFF' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>You paid</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1, fontSize: 34 }}>{formatRupees(invoice.brand_pays_paise)}</span>
            </div>
          </CollapsibleSection>
        )}

        {/* ── Waiting to post ── */}
        {['approved', 'paid', 'complete'].includes(deal.status) && !deal.is_posted && (
          <div className="surface" style={{ padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)' }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Waiting to go live</span>
            </div>
            <h3 style={{ fontSize: 26, lineHeight: 1.25, margin: '14px 0 0' }}>
              Deliverables are approved, waiting for <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400 }}>{firstName}</span> to post
            </h3>
            <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '12px 0 0', maxWidth: 440 }}>
              All assets are approved. {firstName}&apos;s invoice opens once the content is marked live.
            </p>
          </div>
        )}

        {/* ── Live posts card (when posted) ── */}
        {deal.is_posted && hasItems && (
          <div className="surface" style={{ padding: '22px 24px' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Live posts</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              {items.filter(i => i.item_status === 'approved').map((item) => {
                const isReel = item.label.toLowerCase().includes('reel')
                const postedDate = item.approved_at ? new Date(item.approved_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14, border: '1px solid var(--hairline)' }}>
                    <span style={{ width: 44, height: 44, borderRadius: 11, background: 'var(--sec, var(--sec-2, #F4F8FC))', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isReel ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m10 8 6 4-6 4V8z" /><rect x="2" y="3" width="20" height="18" rx="4" /></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                      )}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontSize: 14 }}>{item.label}</b>
                      {postedDate && <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}> &middot; Live {postedDate}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 'none' }}>
                      {deal.posted_url && (
                        <a href={deal.posted_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', textDecoration: 'underline', textUnderlineOffset: 3 }}>View post</a>
                      )}
                      <Link href={`/deals/${deal.id}/analytics`} className="pill" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 38, padding: '0 16px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--frost-edge, var(--hairline))', boxShadow: '0 6px 14px -10px rgba(40,45,25,.4)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', textDecoration: 'none' }}>View analytics</Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Deliverables card ── */}
        {hasItems && (() => {
          const approvedCount = items.filter(i => i.item_status === 'approved').length
          const allPostedSubtitle = deal.is_posted
            ? `${approvedCount} of ${items.length} approved \u00B7 ${approvedCount === items.length ? 'all' : approvedCount} live`
            : undefined

          const delivHeader = !deal.is_posted ? (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
                {canReview ? 'Review deliverables' : 'Deliverables'}
              </h3>
              {deal.status === 'negotiating' && (
                <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>Only the ask changes in a counter</span>
              )}
              {deal.status === 'agreed' && (
                <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>Waiting on {firstName} to submit</span>
              )}
              {deal.status === 'approved' && hasItems && (
                <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>
                  {approvedCount} of {items.length} approved
                  {items.some(i => i.approved_at) && ` \u00B7 ${new Date(items.find(i => i.approved_at)!.approved_at!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                </span>
              )}
              {(deal.status === 'delivered' || deal.status === 'revision') && hasItems && (() => {
                const revisionCount = items.filter(i => i.item_status === 'revision').length
                const parts: string[] = []
                if (approvedCount > 0) parts.push(`${approvedCount} of ${items.length} approved`)
                if (revisionCount > 0) parts.push(`${revisionCount} in revision`)
                return parts.length > 0 ? (
                  <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{parts.join(' \u00B7 ')}</span>
                ) : null
              })()}
            </div>
          ) : null

          const delivContent = (<>
            {canReview ? (
              <div style={{ marginTop: 20 }}>
                <ItemReview
                  dealId={deal.id}
                  items={items.map((i) => ({
                    id: i.id,
                    label: i.label,
                    platform: i.platform,
                    handle: i.handle,
                    item_status: i.item_status,
                    external_url: i.external_url,
                    storage_path: i.storage_path,
                    file_name: i.file_name,
                    version: i.version,
                    price_paise: i.price_paise,
                    reel_type: i.reel_type ?? null,
                    boosting_rights: i.boosting_rights ?? null,
                    boosting_duration_months: i.boosting_duration_months ?? null,
                    submitted_at: i.submitted_at ?? null,
                    updated_at: i.updated_at ?? null,
                    revision_note: i.revision_note ?? null,
                  }))}
                  revisionsUsed={deal.revisions_used ?? 0}
                  revisionLimit={deal.revision_limit}
                  perExtraRevisionPaise={deal.price_per_extra_revision_paise ?? 0}
                  dealStatus={deal.status}
                  pricePerExtraRevisionPaise={deal.price_per_extra_revision_paise ?? 0}
                  creatorFirstName={firstName}
                />
              </div>
            ) : (
              <>
                {/* Read-only items grouped by platform */}
                {Array.from(groupedItems.entries()).map(([key, groupItems]) => {
                    if (!groupItems) return null
                  const [platform, handle] = key.split('::')
                  const displayHandle = handle?.startsWith('@') ? handle : `@${handle}`
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '24px 0 12px' }}>
                        <span style={{ display: 'inline-flex', color: 'var(--ink)' }}>
                          {platform.toLowerCase() === 'instagram' && (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" /></svg>
                          )}
                          {platform.toLowerCase() === 'youtube' && (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 17V7a3 3 0 0 1 3-3h13a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3Z" /><path d="m10 9 5 3-5 3Z" /></svg>
                          )}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink)' }}>
                          {platform} &middot; {displayHandle}
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {groupItems.map((item) => {
                          const details: string[] = []
                          if (item.reel_type) details.push(item.reel_type === 'collab' ? 'Collab post' : 'Non-collab')
                          if (item.boosting_rights) details.push(`${item.boosting_duration_months ?? '\u221E'}-day boosting rights`)

                          const isItemResubmitted = item.item_status === 'submitted' && item.version > 1 && !!item.revision_note
                          const itemStatusLabel = isItemResubmitted ? 'Resubmitted' : item.item_status === 'submitted' ? 'Submitted' : item.item_status === 'approved' ? 'Approved' : item.item_status === 'revision' ? 'Revision requested' : null
                          const showAwaitingBadge = deal.status === 'agreed' || (deal.status !== 'negotiating' && !item.item_status)
                          const isApprovedItem = item.item_status === 'approved'

                          // Pill-style badge for approved items (neon tinted), inline dot+text for others
                          const statusBadge = isApprovedItem ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 'var(--radius-pill, 999px)', background: 'color-mix(in oklab, var(--neon) 20%, var(--card))', fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--neon-deep)' }} />
                              {item.approved_at ? `Approved ${new Date(item.approved_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'Approved'}
                            </span>
                          ) : itemStatusLabel ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 12.5, color: 'var(--ink)' }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.item_status === 'submitted' ? 'var(--info, #5AA9E6)' : 'var(--warning)' }} />
                              {itemStatusLabel}
                            </span>
                          ) : showAwaitingBadge ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 12.5, color: 'var(--ink)' }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)' }} />Awaiting creator
                            </span>
                          ) : null

                          // For posted deals, show "Live [date] · ₹X" instead of reel type details
                          const postedItemSubtitle = deal.is_posted && isApprovedItem
                            ? [
                                item.approved_at ? `Live ${new Date(item.approved_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : null,
                                item.price_paise != null && item.price_paise > 0 ? formatRupees(item.price_paise) : null,
                              ].filter(Boolean).join(' \u00B7 ')
                            : null

                          return (
                            <div key={item.id} style={{ borderRadius: 14, border: '1.5px solid var(--hairline, #EAEAE3)', background: 'var(--card)', padding: '16px 18px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                                <div>
                                  <span style={{ fontSize: 15, fontWeight: 700 }}>{item.label}</span>
                                  {postedItemSubtitle ? (
                                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 3 }}>{postedItemSubtitle}</div>
                                  ) : (details.length > 0 || (item.price_paise != null && item.price_paise > 0)) && (
                                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 3 }}>
                                      {details.join(' \u00B7 ')}
                                      {details.length > 0 && item.price_paise != null && item.price_paise > 0 ? ` \u00B7 ${formatRupees(item.price_paise)}` : ''}
                                      {details.length === 0 && item.price_paise != null && item.price_paise > 0 ? formatRupees(item.price_paise) : ''}
                                    </div>
                                  )}
                                </div>
                                {statusBadge}
                              </div>
                              {/* File pill */}
                              {(item.external_url || (item.storage_path && item.file_name)) && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: '12px 16px', borderRadius: 'var(--radius-pill, 999px)', background: 'var(--sec-2, #f5f5f0)', border: '1px solid var(--sec-mid-2, #e5e5dc)', marginTop: 14 }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                                    {item.storage_path ? (
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                                    ) : (
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07L11 5" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3A5 5 0 0 0 11 21l1-1" /></svg>
                                    )}
                                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', wordBreak: 'break-all' }}>
                                      {item.file_name ?? (item.external_url && item.external_url.length > 40 ? item.external_url.slice(0, 40) + '\u2026' : item.external_url)}
                                    </span>
                                  </span>
                                  {item.storage_path ? (
                                    <ViewFileButton dealId={deal.id} itemId={item.id} />
                                  ) : item.external_url ? (
                                    <a href={item.external_url} target="_blank" rel="noopener noreferrer" className="viewlink" style={{ padding: 0, background: 'none', border: 'none', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', textDecoration: 'underline', textUnderlineOffset: 3 }}>View file</a>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                {/* Helper note for agreed status */}
                {deal.status === 'agreed' && (
                  <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 16 }}>
                    {firstName} submits directly through their deal page, so there&apos;s nothing for you to upload here.
                  </div>
                )}

              </>
            )}
          </>)

          // When posted: wrap in CollapsibleSection; otherwise: plain surface card
          return deal.is_posted ? (
            <CollapsibleSection title="Deliverables" subtitle={allPostedSubtitle}>
              <div style={{ marginTop: 4 }}>{delivContent}</div>
            </CollapsibleSection>
          ) : (
            <div className="surface" style={{ padding: 24 }}>
              {delivHeader}
              {delivContent}
            </div>
          )
        })()}

        {/* ── Shipment card (after deliverables) ── */}
        {deal.requires_shipment && deal.shipment_status && !['negotiating', 'declined', 'cancelled'].includes(deal.status) && (
          <div className="surface" style={{ padding: 24 }}>
            <ShipmentCard
              dealId={deal.id}
              shipmentStatus={deal.shipment_status}
              trackingLink={deal.tracking_link}
              carrierNote={deal.carrier_note}
              shippedAt={deal.shipped_at}
              shippingAddress={(deal as Record<string, unknown>).shipping_address as string | null}
            />
          </div>
        )}

        {/* ── Agreed terms summary card (agreed stage only) ── */}
        {deal.agreed_at && deal.status === 'agreed' && deal.price_paise != null && deal.price_paise > 0 && (
          <div className="surface" style={{ padding: '26px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Agreed terms</h3>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--neon-deep)' }} />
                Agreed {new Date(deal.agreed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginTop: 22 }}>
              {/* Left — deliverables summary */}
              <div style={{ flex: '1.3', paddingRight: 32 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Deliverables</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15, marginTop: 8 }}>
                  {hasItems
                    ? (() => {
                        const counts = new Map<string, number>()
                        for (const item of items) {
                          const type = item.label.replace(/^Instagram\s+/i, '').replace(/^YouTube\s+/i, '')
                          counts.set(type, (counts.get(type) ?? 0) + 1)
                        }
                        return Array.from(counts.entries()).map(([type, count]) => `${count} ${type}`).join(' + ')
                      })()
                    : `${(deal.deliverables as any)?.length ?? 0} deliverables`}
                </div>
                {hasItems && (
                  <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 8 }}>
                    {(() => {
                      const platforms = new Set<string>()
                      for (const item of items) if (item.platform) platforms.add(item.platform)
                      return Array.from(platforms).join(' · ')
                    })()}
                    {deal.timeline_date && ` \u00B7 deliver by ${new Date(deal.timeline_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                  </div>
                )}
              </div>
              {/* Right — deliver by + payment terms */}
              <div style={{ flex: 1, paddingLeft: 32, borderLeft: '1px solid var(--border-hairline)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
                {deal.timeline_date && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Deliver by</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginTop: 5 }}>
                      {new Date(deal.timeline_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                )}
                {deal.payment_terms && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Payment terms</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginTop: 5 }}>
                      {deal.payment_terms}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Dark "You pay" footer — expandable breakup */}
            <PaymentBreakup
              brandTotal={brandTotal}
              dealTotal={deal.price_paise}
              feePaise={feeInfo?.fee_paise ?? 0}
              feePercent={feeInfo?.fee_percent ?? 0}
              feeMode={(deal.fee_mode as string) ?? 'on_top'}
              overage={overage}
              extraRevisions={extra}
            />
          </div>
        )}

        {/* ── Brief details ── */}
        {(briefPitch || briefGuidelines || briefAvoid || briefAttachments.length > 0 || deal.usage_rights || deal.payment_terms || deal.timeline_date || deal.revision_limit != null) && (
          ['negotiating', 'agreed'].includes(deal.status) ? (
          <div className="surface" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Brief details</h3>
              {deal.campaign_id && campaignName && (
                <Link href={`/campaigns/${deal.campaign_id}`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', textDecoration: 'none' }}>
                  {campaignName} &rarr;
                </Link>
              )}
            </div>

            {/* Brief pitch — 190px label + content grid */}
            {briefPitch && (
              <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 36, paddingTop: 34, borderTop: '1px solid var(--border-hairline)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', paddingTop: 3 }}>The brief</div>
                <p style={{ fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-soft)', margin: 0, maxWidth: 620, whiteSpace: 'pre-wrap' }}>{briefPitch}</p>
              </div>
            )}

            {/* Attachments — grid of clickable file cards */}
            {briefAttachments.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 36, paddingTop: 34, borderTop: '1px solid var(--border-hairline)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', paddingTop: 3 }}>Attachments</div>
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

            {/* Full terms — toggle */}
            <BriefDetailsToggle label="Full terms" defaultOpen={deal.status === 'negotiating'}>
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column' }}>
                {/* Per-deliverable money, only when there is something to break
                    down. A deal with no add-ons has one number per line and the
                    rows below already say it. */}
                {hasAddons(itemsForBreakdown) && (
                  <div style={{ marginBottom: 18 }}>
                    <DealBreakdown items={itemsForBreakdown} totalPaise={deal.price_paise} />
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Deal total</span>
                  <b style={{ fontSize: 14, fontWeight: 700 }}>{formatRupees(deal.price_paise)}</b>
                </div>
                {feeInfo && feeInfo.fee_paise > 0 && (
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Platform fee ({feeInfo.fee_percent}%){feeInfo.fee_mode === 'on_top' ? ', paid by you' : ', deducted from creator'}</span>
                    <b style={{ fontSize: 14, fontWeight: 700 }}>{formatRupees(feeInfo.fee_paise)}</b>
                  </div>
                )}
                {deal.timeline_date && (
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Delivery date</span>
                    <b style={{ fontSize: 14, fontWeight: 700 }}>{new Date(deal.timeline_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</b>
                  </div>
                )}
                {deal.usage_rights && (
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Usage rights</span>
                    <b style={{ fontSize: 14, fontWeight: 700 }}>{deal.usage_rights}{deal.usage_rights_end_date && `, to ${new Date(deal.usage_rights_end_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}</b>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Revisions</span>
                  <b style={{ fontSize: 14, fontWeight: 700 }}>{revisionLabel(revTerms)}{revTerms.perExtraPaise > 0 ? `, then ${formatRupees(revTerms.perExtraPaise)} each` : ''}{deal.revisions_used ? ` · ${deal.revisions_used} used` : ''}</b>
                </div>
                {deal.payment_terms && (
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Payment terms</span>
                    <b style={{ fontSize: 14, fontWeight: 700 }}>{deal.payment_terms}</b>
                  </div>
                )}
                {deal.rights_confirmed_at && (
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Rights confirmed</span>
                    <b style={{ fontSize: 14, fontWeight: 700 }}>{new Date(deal.rights_confirmed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</b>
                  </div>
                )}
              </div>
            </BriefDetailsToggle>

            {/* Creative guidelines — toggle section */}
            {(briefGuidelines || briefAvoid) && (() => {
              const guidelinePoints: string[] = briefGuidelines ? briefGuidelines.split('\n').filter(Boolean) : []
              const avoidPoints: string[] = briefAvoid ? briefAvoid.split('\n').filter(Boolean) : []
              const parts: string[] = []
              if (guidelinePoints.length > 0) parts.push(`${guidelinePoints.length} guideline${guidelinePoints.length !== 1 ? 's' : ''}`)
              if (avoidPoints.length > 0) parts.push(`${avoidPoints.length} to avoid`)
              return (
                <BriefDetailsToggle label="Creative guidelines" subtitle={parts.join(' · ')} defaultOpen={deal.status === 'negotiating'}>
                  {/* Guidelines */}
                  {guidelinePoints.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 28 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', paddingTop: 3 }}>Creative guidelines</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {guidelinePoints.map((point, i) => (
                          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            <span style={{ width: 22, height: 22, borderRadius: 7, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: 'var(--ink)', color: '#FFFFFF' }}>{i + 1}</span>
                            <span style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{point}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Avoid */}
                  {avoidPoints.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 30, paddingTop: 28, borderTop: guidelinePoints.length > 0 ? '1px solid var(--border-hairline)' : 'none' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', paddingTop: 3 }}>Please avoid</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {avoidPoints.map((point, i) => (
                          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2.2" strokeLinecap="round" style={{ flex: 'none', marginTop: 4 }}><path d="M18 6 6 18M6 6l12 12" /></svg>
                            <span style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{point}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </BriefDetailsToggle>
              )
            })()}

            {/* Shipment note — brief mention; full tracking is in ShipmentCard above */}
            {deal.requires_shipment && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 28, paddingTop: 24, borderTop: '1px solid var(--border-hairline)' }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--sec-2)', border: '1px solid var(--sec-mid-2, var(--hairline))', color: 'var(--sec-ink, var(--ink-soft))' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" /></svg>
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Product shipment included</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 1 }}>Shipped once the deal is agreed</span>
                </span>
              </div>
            )}
          </div>
          ) : (
          <CollapsibleSection title="Brief details">
            {briefPitch && (
              <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 36, paddingTop: 34, borderTop: '1px solid var(--border-hairline)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', paddingTop: 3 }}>The brief</div>
                <p style={{ fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-soft)', margin: 0, maxWidth: 620, whiteSpace: 'pre-wrap' }}>{briefPitch}</p>
              </div>
            )}
            {briefAttachments.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 36, paddingTop: 34, borderTop: '1px solid var(--border-hairline)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', paddingTop: 3 }}>Attachments</div>
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
            <BriefDetailsToggle label="Full terms">
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Deal total</span>
                  <b style={{ fontSize: 14, fontWeight: 700 }}>{formatRupees(deal.price_paise)}</b>
                </div>
                {feeInfo && feeInfo.fee_paise > 0 && (
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Platform fee ({feeInfo.fee_percent}%){feeInfo.fee_mode === 'on_top' ? ', paid by you' : ', deducted from creator'}</span>
                    <b style={{ fontSize: 14, fontWeight: 700 }}>{formatRupees(feeInfo.fee_paise)}</b>
                  </div>
                )}
                {deal.timeline_date && (
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Delivery date</span>
                    <b style={{ fontSize: 14, fontWeight: 700 }}>{new Date(deal.timeline_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</b>
                  </div>
                )}
                {deal.usage_rights && (
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Usage rights</span>
                    <b style={{ fontSize: 14, fontWeight: 700 }}>{deal.usage_rights}{deal.usage_rights_end_date && `, to ${new Date(deal.usage_rights_end_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}</b>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Revisions</span>
                  <b style={{ fontSize: 14, fontWeight: 700 }}>{revisionLabel(revTerms)}{revTerms.perExtraPaise > 0 ? `, then ${formatRupees(revTerms.perExtraPaise)} each` : ''}{deal.revisions_used ? ` · ${deal.revisions_used} used` : ''}</b>
                </div>
                {deal.payment_terms && (
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Payment terms</span>
                    <b style={{ fontSize: 14, fontWeight: 700 }}>{deal.payment_terms}</b>
                  </div>
                )}
                {deal.rights_confirmed_at && (
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Rights confirmed</span>
                    <b style={{ fontSize: 14, fontWeight: 700 }}>{new Date(deal.rights_confirmed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</b>
                  </div>
                )}
              </div>
            </BriefDetailsToggle>
          </CollapsibleSection>
          )
        )}

        {/* ── Agreed terms (collapsed, for post-agreed stages) ── */}
        {deal.agreed_at && deal.status !== 'negotiating' && deal.status !== 'agreed' && deal.status !== 'declined' && deal.status !== 'cancelled' && deal.price_paise != null && deal.price_paise > 0 && (
          <CollapsibleSection
            title="Agreed terms"
            subtitle={`Agreed ${new Date(deal.agreed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
          >
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 22 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Deal total</span>
                <b style={{ fontSize: 14, fontWeight: 700 }}>{formatRupees(deal.price_paise)}</b>
              </div>
              {feeInfo && feeInfo.fee_paise > 0 && (
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Platform fee ({feeInfo.fee_percent}%)</span>
                  <b style={{ fontSize: 14, fontWeight: 700 }}>{feeInfo.fee_mode === 'deducted' ? `\u2212${formatRupees(feeInfo.fee_paise)}` : `+${formatRupees(feeInfo.fee_paise)}`}</b>
                </div>
              )}
              {deal.timeline_date && (
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Delivery date</span>
                  <b style={{ fontSize: 14, fontWeight: 700 }}>{new Date(deal.timeline_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</b>
                </div>
              )}
              {deal.usage_rights && (
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Usage rights</span>
                  <b style={{ fontSize: 14, fontWeight: 700 }}>{deal.usage_rights}{deal.usage_rights_end_date && ` \u00B7 to ${new Date(deal.usage_rights_end_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}</b>
                </div>
              )}
              {deal.payment_terms && (
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderTop: '1px solid var(--border-hairline)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Payment terms</span>
                  <b style={{ fontSize: 14, fontWeight: 700 }}>{deal.payment_terms}</b>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '18px 24px', margin: '22px 0 0', borderRadius: 14, background: 'var(--ink)', color: '#FFFFFF' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>You pay</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1, fontSize: 34 }}>{formatRupees(brandTotal)}</span>
            </div>
          </CollapsibleSection>
        )}

        {/* ── Brand review card (completed deals only) ── */}
        {isCompleted && creator && (
          <BrandReviewCard
            dealId={deal.id}
            creatorName={creator.full_name}
            existingRating={brandReview?.rating}
            existingNote={brandReview?.note}
          />
        )}

        {/* ── Metadata footer ── */}
        <div style={{ padding: '0 6px', fontSize: 11, color: 'var(--ink-faint)' }}>
          <span>Created {new Date(deal.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          {deal.agreed_at && <span> &middot; Agreed {new Date(deal.agreed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
          {deal.completed_at && <span> &middot; Completed {new Date(deal.completed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
        </div>
      </div>

      {/* The chat panel, finally rendered. It was imported and never used, so
          every Message control had to send a brand to the inbox to reach a
          conversation that could have opened here. Its own launcher is hidden
          because the page already has Message buttons; two ways into one panel
          reads as two different features. */}
      {creator && (
        <DealThread
          dealId={deal.id}
          dealStatus={deal.status}
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
      )}
    </main>
  )
}
