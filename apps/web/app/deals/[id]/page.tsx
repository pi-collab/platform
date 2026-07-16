import { createClient } from '@/lib/supabase/server'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import DealThread from './DealThread'
import ItemReview from './ItemReview'
import BrandInvoiceCard from './BrandInvoiceCard'
import { calculateFee } from '@/lib/fee'
import { deriveDisplayStatus } from '@/lib/deal-status'
import RealtimeDealListener from '@/components/RealtimeDealListener'
import ViewFileButton from './ViewFileButton'
import ShipmentCard from './ShipmentCard'

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(0)}K`
  return `₹${rupees.toLocaleString('en-IN')}`
}

const ITEM_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:   { bg: '#f3f4f6', color: '#6b7280' },
  submitted: { bg: '#fef9c3', color: '#854d0e' },
  revision:  { bg: '#ffedd5', color: '#9a3412' },
  approved:  { bg: '#dcfce7', color: '#166534' },
}


export default async function DealDetailPage({ params }: { params: { id: string } }) {
  await verifyApprovedBrand()

  const supabase = createClient()

  // Fetch deal + events in parallel. RLS deals_read restricts to brand's own deals.
  // If another brand guesses the URL, .maybeSingle() returns null → notFound().
  const [{ data: deal, error: dealError }, { data: events }, { data: messages }, { data: items }, { data: invoice }] = await Promise.all([
    supabase
      .from('deals')
      .select('id, title, deliverables, price_paise, price_per_extra_revision_paise, fee_percent, fee_mode, status, timeline_date, revision_limit, revisions_used, usage_rights, payment_terms, last_offer_by, created_at, updated_at, agreed_at, completed_at, requires_shipment, shipment_status, tracking_link, carrier_note, shipped_at, is_posted, posted_url, posted_at, usage_rights_end_date, rights_confirmed_at, campaign_id, creators(id, full_name, handle, profile_photo_url)')
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
      .select('id, label, platform, handle, item_status, external_url, storage_path, file_name, version, price_paise, reel_type, boosting_rights, boosting_duration_months, submitted_at, approved_at')
      .eq('deal_id', params.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('invoices')
      .select('id, status, base_paise, overage_paise, fee_paise, fee_percent, fee_mode, brand_pays_paise, creator_receives_paise, payment_terms, due_date, issued_at, accepted_at')
      .eq('deal_id', params.id)
      .maybeSingle(),
  ])

  if (dealError || !deal) notFound()

  // Fetch campaign name if deal belongs to one
  let campaignName: string | null = null
  if (deal.campaign_id) {
    const { data: camp } = await supabase
      .from('campaigns')
      .select('name')
      .eq('id', deal.campaign_id)
      .maybeSingle()
    campaignName = camp?.name ?? null
  }

  const rawCreator = deal.creators as unknown
  const creator = Array.isArray(rawCreator)
    ? (rawCreator[0] as { id: string; full_name: string; handle: string | null; profile_photo_url: string | null } | undefined) ?? null
    : (rawCreator as { id: string; full_name: string; handle: string | null; profile_photo_url: string | null } | null)
  const derived = deriveDisplayStatus(deal.status, invoice?.status ?? null, invoice?.due_date ?? null)
  const sc = derived.color
  const hasItems = items && items.length > 0
  const itemsSubmitted = hasItems ? items.filter((i) => i.item_status === 'submitted' || i.item_status === 'approved').length : 0
  const canReview = hasItems && (deal.status === 'delivered' || deal.status === 'revision')

  return (
    <section style={{ padding: '2.5rem var(--container-pad)', maxWidth: 'var(--container-width)', margin: '0 auto' }}>
      <RealtimeDealListener dealId={deal.id} />

      {/* Back */}
      <Link href="/deals" style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
        &larr; Back to deals
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-heading)', margin: 0 }}>
              {deal.title || 'Untitled deal'}
            </h1>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>
              {derived.label}
            </span>
          </div>
          {creator && (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: 0 }}>
              with{' '}
              <Link href={`/browse/${creator.id}`} style={{ color: 'var(--color-heading)', textDecoration: 'none', fontWeight: 600 }}>
                {creator.full_name}
              </Link>
              {creator.handle && <span style={{ color: 'var(--color-muted)' }}> · {creator.handle}</span>}
            </p>
          )}
          {deal.campaign_id && campaignName && (
            <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', margin: '0.25rem 0 0' }}>
              Campaign:{' '}
              <Link href={`/campaigns/${deal.campaign_id}`} style={{ color: 'var(--color-heading)', textDecoration: 'none', fontWeight: 600 }}>
                {campaignName}
              </Link>
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {['complete', 'paid', 'approved'].includes(deal.status) && (
            <Link
              href={`/deals/new?from=${deal.id}`}
              style={{ padding: '0.5rem 1rem', background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: 'var(--radius-lg)', fontWeight: 700, fontSize: '0.8125rem', textDecoration: 'none', fontFamily: 'var(--font-heading)', whiteSpace: 'nowrap' }}
            >
              New deal, same terms
            </Link>
          )}
          {deal.price_paise != null && deal.price_paise > 0 && (() => {
            const extra = Math.max(0, (deal.revisions_used ?? 0) - (deal.revision_limit ?? 0))
            const overage = extra * (deal.price_per_extra_revision_paise ?? 0)
            const fee = calculateFee(deal.price_paise, deal.fee_percent ?? 0, (deal.fee_mode as 'on_top' | 'deducted') ?? 'on_top')
            const brandTotal = fee.brand_pays_paise + overage
            return (
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-heading)', margin: 0 }}>
                  {formatRupees(brandTotal)}
                </p>
                {(fee.fee_paise > 0 || overage > 0) && (
                  <p style={{ fontFamily: 'monospace', fontSize: '0.6875rem', color: 'var(--color-muted)', margin: '0.15rem 0 0' }}>
                    {formatRupees(deal.price_paise)} base
                    {fee.fee_paise > 0 && ` + ${formatRupees(fee.fee_paise)} fee`}
                    {overage > 0 && ` + ${extra} extra rev`}
                  </p>
                )}
              </div>
            )
          })()}
          <DealThread dealId={deal.id} dealStatus={deal.status} initialMessages={(messages ?? []) as { id: string; deal_id: string; sender_party: 'brand' | 'creator'; body: string | null; created_at: string }[]} />
        </div>
      </div>

      {/* Deliverable Items — interactive review when delivered/revision, read-only otherwise */}
      {hasItems && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ ...sectionTitle, marginBottom: '0.75rem' }}>
            {canReview ? 'Review Deliverables' : 'Deliverable Items'}
          </h2>
          {canReview ? (
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
              }))}
              revisionsUsed={deal.revisions_used ?? 0}
              revisionLimit={deal.revision_limit}
              dealStatus={deal.status}
              pricePerExtraRevisionPaise={deal.price_per_extra_revision_paise ?? 0}
            />
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--color-border, #e5e5e5)', overflow: 'hidden' }}>
                  <div style={{ width: `${(itemsSubmitted / items.length) * 100}%`, height: '100%', background: '#16a34a', borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted)' }}>
                  {itemsSubmitted} of {items.length} submitted
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {items.map((item) => {
                  const isc = ITEM_STATUS_COLORS[item.item_status] ?? ITEM_STATUS_COLORS.pending
                  const displayHandle = item.handle.startsWith('@') ? item.handle : `@${item.handle}`
                  return (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0.75rem', border: '1px solid var(--color-border, #e5e5e5)', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--glass-bg, #fafafa)' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-heading)' }}>{item.label}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginLeft: '0.375rem' }}>
                          {item.platform} {displayHandle}
                        </span>
                        {item.reel_type && (
                          <span style={{ fontSize: '0.625rem', fontWeight: 600, padding: '0.1rem 0.375rem', borderRadius: 9999, background: '#f3f4f6', color: '#555', marginLeft: '0.375rem' }}>
                            {item.reel_type === 'collab' ? 'Collab' : 'Non-collab'}
                          </span>
                        )}
                        {item.boosting_rights && (
                          <span style={{ fontSize: '0.625rem', fontWeight: 600, padding: '0.1rem 0.375rem', borderRadius: 9999, background: '#eff6ff', color: '#2563eb', marginLeft: '0.375rem' }}>
                            Boosting {item.boosting_duration_months ? `${item.boosting_duration_months}mo` : '∞'}
                          </span>
                        )}
                        {item.external_url && (
                          <a
                            href={item.external_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: '0.75rem', color: '#2563eb', wordBreak: 'break-all', display: 'block', marginTop: '0.2rem' }}
                          >
                            {item.external_url.length > 50 ? item.external_url.slice(0, 50) + '...' : item.external_url}
                          </a>
                        )}
                        {item.storage_path && item.file_name && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-heading)', display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.2rem' }}>
                            <span style={{ wordBreak: 'break-all' }}>{item.file_name}</span>
                            <ViewFileButton dealId={deal.id} itemId={item.id} />
                          </div>
                        )}
                      </div>
                      <span style={{
                        fontSize: '0.625rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: 9999,
                        background: isc.bg, color: isc.color, textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        {item.item_status}{item.version > 1 ? ` v${item.version}` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Shipment — only for product deals */}
      {deal.requires_shipment && deal.shipment_status && !['negotiating', 'declined', 'cancelled'].includes(deal.status) && (
        <div style={{ marginBottom: '2rem' }}>
          <ShipmentCard
            dealId={deal.id}
            shipmentStatus={deal.shipment_status}
            trackingLink={deal.tracking_link}
            carrierNote={deal.carrier_note}
            shippedAt={deal.shipped_at}
          />
        </div>
      )}

      {/* Posted status */}
      {deal.is_posted && deal.posted_url && (
        <div style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md, 8px)', background: '#f0fdf4' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#16a34a', margin: '0 0 0.25rem' }}>
            Content Posted
          </p>
          <a href={deal.posted_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8125rem', color: '#2563eb', wordBreak: 'break-all' }}>
            {deal.posted_url.length > 60 ? deal.posted_url.slice(0, 60) + '...' : deal.posted_url}
          </a>
          {deal.posted_at && (
            <p style={{ fontSize: '0.6875rem', color: '#888', margin: '0.25rem 0 0' }}>
              Posted {new Date(deal.posted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>
      )}
      {(['approved', 'paid', 'complete'].includes(deal.status)) && !deal.is_posted && (
        <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '2rem', fontStyle: 'italic' }}>
          Awaiting creator to post the content.
        </p>
      )}

      {/* Invoice — show when invoice exists (issued, accepted, paid) */}
      {invoice && (
        <div style={{ marginBottom: '2rem' }}>
          <BrandInvoiceCard dealId={deal.id} invoice={invoice} />
        </div>
      )}

      {/* Deal details grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginBottom: '2.5rem' }}>
        {/* Terms */}
        <div>
          <h2 style={sectionTitle}>Deal Terms</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {hasItems ? (
              <div>
                <p style={labelStyle}>Deliverables</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {items.map((item) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--color-heading)' }}>
                        {item.label} <span style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>({item.platform} {item.handle.startsWith('@') ? item.handle : `@${item.handle}`})</span>
                        {item.reel_type && <span style={{ fontSize: '0.625rem', fontWeight: 600, padding: '0.1rem 0.375rem', borderRadius: 9999, background: '#f3f4f6', color: '#555', marginLeft: '0.25rem' }}>{item.reel_type === 'collab' ? 'Collab' : 'Non-collab'}</span>}
                        {item.boosting_rights && <span style={{ fontSize: '0.625rem', fontWeight: 600, padding: '0.1rem 0.375rem', borderRadius: 9999, background: '#eff6ff', color: '#2563eb', marginLeft: '0.25rem' }}>Boosting {item.boosting_duration_months ? `${item.boosting_duration_months}mo` : '∞'}</span>}
                      </span>
                      {item.price_paise != null && item.price_paise > 0 && (
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--color-heading)', whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>
                          {formatRupees(item.price_paise)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <DetailField label="Deliverables" value={deal.deliverables} />
            )}
            {deal.price_paise != null && deal.price_paise > 0 && (() => {
              const fee = calculateFee(deal.price_paise, deal.fee_percent ?? 0, (deal.fee_mode as 'on_top' | 'deducted') ?? 'on_top')
              return (
                <>
                  <div>
                    <p style={labelStyle}>Base Price</p>
                    <p style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-heading)', margin: 0 }}>
                      {formatRupees(deal.price_paise)}
                    </p>
                  </div>
                  {fee.fee_paise > 0 && (
                    <>
                      <DetailField label={`Platform fee (${fee.fee_percent}%, ${fee.fee_mode === 'on_top' ? 'on top' : 'deducted'})`} value={formatRupees(fee.fee_paise)} />
                      <div>
                        <p style={labelStyle}>You pay</p>
                        <p style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-heading)', margin: 0 }}>
                          {formatRupees(fee.brand_pays_paise)}
                        </p>
                      </div>
                      <DetailField label="Creator receives" value={formatRupees(fee.creator_receives_paise)} />
                    </>
                  )}
                </>
              )
            })()}
            <DetailField label="Delivery date" value={deal.timeline_date ? new Date(deal.timeline_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null} />
            <DetailField label="Revisions" value={`${deal.revisions_used} / ${deal.revision_limit} used`} />
            {(deal.price_per_extra_revision_paise ?? 0) > 0 && (
              <DetailField label="Per extra revision" value={formatRupees(deal.price_per_extra_revision_paise)} />
            )}
            {(deal.revisions_used ?? 0) > (deal.revision_limit ?? 0) && (deal.price_per_extra_revision_paise ?? 0) > 0 && (() => {
              const extra = (deal.revisions_used ?? 0) - (deal.revision_limit ?? 0)
              const overage = extra * (deal.price_per_extra_revision_paise ?? 0)
              return (
                <div>
                  <p style={labelStyle}>Amount owed</p>
                  <p style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-heading)', margin: 0 }}>
                    Base {formatRupees(deal.price_paise)} + {extra} extra revision{extra !== 1 ? 's' : ''} × {formatRupees(deal.price_per_extra_revision_paise)} = {formatRupees(deal.price_paise + overage)}
                  </p>
                </div>
              )
            })()}
            <DetailField label="Usage rights" value={deal.usage_rights} />
            {deal.usage_rights_end_date && (
              <DetailField
                label="Usage rights expire"
                value={new Date(deal.usage_rights_end_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              />
            )}
            {deal.rights_confirmed_at && (
              <DetailField
                label="Rights confirmed"
                value={new Date(deal.rights_confirmed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              />
            )}
            <DetailField label="Payment terms" value={deal.payment_terms} />
            <DetailField label="Last offer by" value={deal.last_offer_by ? (deal.last_offer_by as string).charAt(0).toUpperCase() + (deal.last_offer_by as string).slice(1) : null} />
          </div>
        </div>

        {/* Timeline / audit log */}
        <div>
          <h2 style={sectionTitle}>Timeline</h2>
          {(!events || events.length === 0) ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>No events recorded yet.</p>
          ) : (
            <>
              <style>{`
                @keyframes timeline-pulse {
                  0%, 100% { box-shadow: 0 0 0 0 rgba(17,17,17,0.4); }
                  50% { box-shadow: 0 0 0 4px rgba(17,17,17,0.08); }
                }
              `}</style>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {events.map((ev, i) => {
                  const isCurrent = i === events.length - 1
                  const parsed = parseEvent(ev)
                  const dotColor = isCurrent ? (parsed.dotColor ?? '#111') : '#d5d5d5'

                  return (
                    <div key={ev.id} style={{ display: 'flex', gap: '0.75rem', paddingBottom: i < events.length - 1 ? '1rem' : 0 }}>
                      {/* Dot + line */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16 }}>
                        <div style={{
                          width: isCurrent ? 10 : 8,
                          height: isCurrent ? 10 : 8,
                          borderRadius: '50%',
                          background: dotColor,
                          flexShrink: 0,
                          marginTop: 4,
                          ...(isCurrent ? { animation: 'timeline-pulse 2s ease-in-out infinite' } : {}),
                        }} />
                        {i < events.length - 1 && <div style={{ width: 1, flex: 1, background: '#e5e5e5' }} />}
                      </div>
                      {/* Content */}
                      <div style={{ paddingBottom: '0.25rem', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-heading)', margin: 0 }}>
                            {parsed.label}
                          </p>
                          {isCurrent && (
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.375rem', borderRadius: 9999, background: 'var(--color-heading)', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Current
                            </span>
                          )}
                        </div>
                        {parsed.description && (
                          <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', margin: '0.2rem 0 0' }}>
                            {parsed.description}
                          </p>
                        )}
                        <p style={{ fontSize: '0.6875rem', color: 'var(--color-subtle)', margin: '0.2rem 0 0' }}>
                          {new Date(ev.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div style={{ marginTop: '2rem', fontSize: '0.75rem', color: 'var(--color-subtle)' }}>
        <p style={{ margin: '0.15rem 0' }}>Created: {new Date(deal.created_at).toLocaleString('en-IN')}</p>
        <p style={{ margin: '0.15rem 0' }}>Updated: {new Date(deal.updated_at).toLocaleString('en-IN')}</p>
        {deal.agreed_at && <p style={{ margin: '0.15rem 0' }}>Agreed: {new Date(deal.agreed_at).toLocaleString('en-IN')}</p>}
        {deal.completed_at && <p style={{ margin: '0.15rem 0' }}>Completed: {new Date(deal.completed_at).toLocaleString('en-IN')}</p>}
      </div>
    </section>
  )
}

const STATUS_LABELS: Record<string, { label: string; description: string; dotColor: string }> = {
  negotiating: { label: 'Offer sent \u2014 Negotiating', description: 'Awaiting creator\u2019s response', dotColor: '#d97706' },
  agreed:      { label: 'Terms agreed', description: 'Both parties confirmed the deal terms', dotColor: '#2563eb' },
  delivered:   { label: 'Deliverable submitted', description: 'Your review is needed', dotColor: '#7c3aed' },
  revision:    { label: 'Revision requested', description: 'Creator is working on changes', dotColor: '#ea580c' },
  approved:    { label: 'Approved', description: 'Deliverable accepted', dotColor: '#16a34a' },
  paid:        { label: 'Payment released', description: 'Payment sent to creator', dotColor: '#059669' },
  complete:    { label: 'Deal complete', description: 'This deal is finished', dotColor: '#374151' },
  declined:    { label: 'Offer declined', description: 'Creator declined the offer', dotColor: '#dc2626' },
  cancelled:   { label: 'Deal cancelled', description: '', dotColor: '#6b7280' },
}

function parseEvent(ev: { event_type: string; detail: any }): { label: string; description: string; dotColor?: string } {
  // deal.created
  if (ev.event_type === 'deal.created') {
    return { label: 'Deal created', description: 'Offer sent to creator', dotColor: '#d97706' }
  }

  // deal.status_changed — parse the to/from in detail
  if (ev.event_type === 'deal.status_changed') {
    const detail = ev.detail as { from?: string; to?: string; old_status?: string; new_status?: string } | null
    const to = detail?.to ?? detail?.new_status
    const from = detail?.from ?? detail?.old_status

    if (to && STATUS_LABELS[to]) {
      const info = STATUS_LABELS[to]
      const fromLabel = from ? statusWord(from) : null
      const transition = fromLabel ? `${fromLabel} \u2192 ${statusWord(to)}` : ''
      return {
        label: info.label,
        description: transition ? `${transition}${info.description ? ' \u2014 ' + info.description.charAt(0).toLowerCase() + info.description.slice(1) : ''}` : info.description,
        dotColor: info.dotColor,
      }
    }

    // Fallback: show transition if we have from/to
    if (from && to) {
      return { label: `${statusWord(from)} \u2192 ${statusWord(to)}`, description: '' }
    }
  }

  // deal.rights_confirmed — creator confirmed content rights terms at acceptance
  if (ev.event_type === 'deal.rights_confirmed') {
    return {
      label: 'Rights terms confirmed',
      description: 'Creator agreed to the content rights terms',
      dotColor: '#2563eb',
    }
  }

  // deal.posted — creator marked content as live
  if (ev.event_type === 'deal.posted') {
    const detail = ev.detail as { posted_url?: string } | null
    return {
      label: 'Content posted',
      description: detail?.posted_url ? `Live at ${detail.posted_url}` : 'Creator marked content as live',
      dotColor: '#16a34a',
    }
  }

  // Any other event type — humanize
  const label = ev.event_type.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const description = ev.detail && typeof ev.detail === 'string' ? ev.detail : ''
  return { label, description }
}

function statusWord(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p style={labelStyle}>{label}</p>
      <p style={{ fontSize: '0.8125rem', color: value ? 'var(--color-heading)' : '#ccc', margin: 0 }}>{value || '—'}</p>
    </div>
  )
}

/* ── Styles ─────────────────────────────────────────────────────── */

const sectionTitle: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontSize: '0.9375rem',
  fontWeight: 700,
  color: 'var(--color-heading)',
  margin: '0 0 0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--color-muted)',
  margin: '0 0 0.15rem',
}
