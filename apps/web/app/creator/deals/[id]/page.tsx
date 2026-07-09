import { createClient } from '@/lib/supabase/server'
import { verifyCreator } from '@/lib/creator-auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import DeliverableItems from './DeliverableItems'
import SubmitDeliverable from './SubmitDeliverable'
import AcceptDecline from './AcceptDecline'
import InvoiceCard from './InvoiceCard'
import CreatorThread from './CreatorThread'
import { calculateFee } from '@/lib/fee'
import RealtimeDealListener from '@/components/RealtimeDealListener'

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  negotiating: { bg: '#dbeafe', color: '#1e40af' },
  agreed:      { bg: '#dcfce7', color: '#166534' },
  delivered:   { bg: '#fef9c3', color: '#854d0e' },
  revision:    { bg: '#ffedd5', color: '#9a3412' },
  approved:    { bg: '#dcfce7', color: '#166534' },
  paid:        { bg: '#d1fae5', color: '#065f46' },
  complete:    { bg: '#f3f4f6', color: '#374151' },
  declined:    { bg: '#fee2e2', color: '#991b1b' },
  cancelled:   { bg: '#f3f4f6', color: '#6b7280' },
}

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `\u20B9${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `\u20B9${(rupees / 1000).toFixed(0)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

export default async function CreatorDealDetailPage({ params }: { params: { id: string } }) {
  await verifyCreator()
  const supabase = createClient()

  const [{ data: deal, error: dealError }, { data: deliverables }, { data: items }, { data: invoice }, { data: messages }] = await Promise.all([
    supabase
      .from('deals')
      .select('id, title, deliverables, price_paise, price_per_extra_revision_paise, fee_percent, fee_mode, status, timeline_date, revision_limit, revisions_used, usage_rights, payment_terms, agreed_at, created_at, brands(name)')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('deliverables')
      .select('id, version, external_url, storage_path, filename, note, created_at')
      .eq('deal_id', params.id)
      .order('version', { ascending: false }),
    supabase
      .from('deal_deliverable_items')
      .select('id, label, platform, handle, item_status, external_url, storage_path, file_name, version, price_paise, submitted_at, revision_note')
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

  const rawBrand = deal.brands as unknown
  const brand = (Array.isArray(rawBrand) ? rawBrand[0]?.name : (rawBrand as any)?.name) ?? 'Unknown brand'
  const sc = STATUS_COLORS[deal.status] ?? { bg: '#f3f4f6', color: '#6b7280' }
  const canSubmit = deal.status === 'agreed' || deal.status === 'revision'
  const hasStructuredItems = items && items.length > 0

  return (
    <main style={wrapper}>
      <RealtimeDealListener dealId={deal.id} />

      <Link href="/creator/deals" style={backLink}>
        &larr; My deals
      </Link>

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
          <h1 style={heading}>{deal.title || 'Untitled deal'}</h1>
          <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>
            {deal.status}
          </span>
        </div>
        <p style={{ fontSize: '0.8125rem', color: '#888', margin: 0 }}>from {brand}</p>
      </div>

      {/* Terms */}
      <div style={termsCard}>
        <h2 style={sectionTitle}>{deal.status === 'negotiating' ? 'Offer Terms' : 'Agreed Terms'}</h2>

        {deal.agreed_at && (
          <p style={agreedDate}>
            Agreed on {new Date(deal.agreed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        )}

        <div style={termsGrid}>
          {hasStructuredItems ? (
            <div>
              <p style={termLabel}>Deliverables</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {items.map((item) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '0.9375rem', fontWeight: 500, color: '#111' }}>
                      {item.label} <span style={{ color: '#888', fontSize: '0.8125rem' }}>({item.platform} {item.handle.startsWith('@') ? item.handle : `@${item.handle}`})</span>
                    </span>
                    {item.price_paise != null && item.price_paise > 0 && (
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'monospace', color: '#111', whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>
                        {formatRupees(item.price_paise)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            deal.deliverables && <Term label="Deliverables" value={deal.deliverables} />
          )}
          {deal.price_paise != null && deal.price_paise > 0 && (() => {
            const feeMode = (deal.fee_mode as 'on_top' | 'deducted') ?? 'on_top'
            const fee = calculateFee(deal.price_paise, deal.fee_percent ?? 0, feeMode)
            const extra = Math.max(0, (deal.revisions_used ?? 0) - (deal.revision_limit ?? 0))
            const overage = extra * (deal.price_per_extra_revision_paise ?? 0)
            const creatorTotal = fee.creator_receives_paise + overage
            // Only show breakdown when something affects the creator's payout:
            // deducted fee or overage. on_top fee is invisible to creator (brand pays it).
            const isDeducted = feeMode === 'deducted' && fee.fee_paise > 0
            const hasBreakdown = isDeducted || overage > 0
            return hasBreakdown ? (
              <div>
                <p style={termLabel}>You receive</p>
                <p style={{ fontSize: '0.9375rem', fontWeight: 700, fontFamily: 'monospace', color: '#111', margin: 0 }}>
                  {formatRupees(creatorTotal)}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#888', margin: '0.15rem 0 0' }}>
                  {formatRupees(deal.price_paise)} base
                  {isDeducted && ` − ${formatRupees(fee.fee_paise)} platform fee (${fee.fee_percent}%)`}
                  {overage > 0 && ` + ${extra} extra rev × ${formatRupees(deal.price_per_extra_revision_paise)}`}
                </p>
              </div>
            ) : (
              <Term label="You receive" value={formatRupees(creatorTotal)} />
            )
          })()}
          {deal.timeline_date && (
            <Term
              label="Delivery by"
              value={new Date(deal.timeline_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            />
          )}
          <Term label="Revisions" value={`${deal.revisions_used} / ${deal.revision_limit}`} />
          {(deal.price_per_extra_revision_paise ?? 0) > 0 && (
            <Term label="Per extra revision" value={formatRupees(deal.price_per_extra_revision_paise)} />
          )}
          {(deal.revisions_used ?? 0) > (deal.revision_limit ?? 0) && (deal.price_per_extra_revision_paise ?? 0) > 0 && (() => {
            const extra = (deal.revisions_used ?? 0) - (deal.revision_limit ?? 0)
            const overage = extra * (deal.price_per_extra_revision_paise ?? 0)
            return (
              <div>
                <p style={termLabel}>Amount owed</p>
                <p style={{ fontSize: '0.9375rem', fontWeight: 700, fontFamily: 'monospace', color: '#111', margin: 0 }}>
                  Base {formatRupees(deal.price_paise)} + {extra} extra revision{extra !== 1 ? 's' : ''} × {formatRupees(deal.price_per_extra_revision_paise)} = {formatRupees(deal.price_paise + overage)}
                </p>
              </div>
            )
          })()}
          {deal.usage_rights && <Term label="Usage rights" value={deal.usage_rights} />}
          {deal.payment_terms && <Term label="Payment terms" value={deal.payment_terms} />}
        </div>
      </div>

      {/* Accept / Decline for negotiating deals */}
      {deal.status === 'negotiating' && (
        <div style={{ marginTop: '1.5rem' }}>
          <AcceptDecline dealId={deal.id} />
        </div>
      )}

      {/* Deliverable Items (structured) */}
      {hasStructuredItems && (
        <div style={{ marginTop: '1.5rem' }}>
          <h2 style={sectionTitle}>Deliverables</h2>
          <DeliverableItems dealId={deal.id} items={items} canSubmit={canSubmit} />
        </div>
      )}

      {/* Legacy deliverables (for deals created before structured items) */}
      {!hasStructuredItems && (
        <div style={{ marginTop: '1.5rem' }}>
          <h2 style={sectionTitle}>Deliverables</h2>

          {deliverables && deliverables.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {deliverables.map((d) => (
                <div key={d.id} style={deliverableRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#555' }}>v{d.version}</span>
                      {d.note && <span style={{ fontSize: '0.75rem', color: '#888' }}> — {d.note}</span>}
                    </div>
                    <span style={{ fontSize: '0.6875rem', color: '#aaa' }}>
                      {new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  {d.external_url && (
                    <a
                      href={d.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.8125rem', color: '#2563eb', wordBreak: 'break-all', marginTop: '0.25rem', display: 'block' }}
                    >
                      {d.external_url.length > 60 ? d.external_url.slice(0, 60) + '...' : d.external_url}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {(!deliverables || deliverables.length === 0) && !canSubmit && (
            <p style={{ fontSize: '0.8125rem', color: '#888' }}>No deliverables submitted yet.</p>
          )}

          {canSubmit && <SubmitDeliverable dealId={deal.id} />}
        </div>
      )}

      {/* Invoice — show when deal is approved (or later) */}
      {(deal.status === 'approved' || deal.status === 'paid' || deal.status === 'complete') && (
        <div style={{ marginTop: '1.5rem' }}>
          <InvoiceCard dealId={deal.id} invoice={invoice} />
        </div>
      )}

      {/* Chat thread */}
      <CreatorThread dealId={deal.id} dealStatus={deal.status} initialMessages={messages ?? []} />
    </main>
  )
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={termLabel}>{label}</p>
      <p style={termValue}>{value}</p>
    </div>
  )
}

/* ── Styles ─────────────────────────────────────────────────────── */

const wrapper: React.CSSProperties = {
  padding: '1.5rem 1rem',
  maxWidth: 900,
  margin: '0 auto',
}

const backLink: React.CSSProperties = {
  fontSize: '0.8125rem',
  color: '#888',
  textDecoration: 'none',
  display: 'inline-block',
  marginBottom: '1rem',
}

const heading: React.CSSProperties = {
  fontFamily: 'var(--font-heading, inherit)',
  fontSize: '1.25rem',
  fontWeight: 700,
  color: 'var(--color-heading, #111)',
  margin: 0,
}

const sectionTitle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#555',
  margin: '0 0 0.75rem',
}

const termsCard: React.CSSProperties = {
  padding: '1.25rem',
  border: '1px solid #e5e5e5',
  borderRadius: 12,
  background: '#fff',
}

const agreedDate: React.CSSProperties = {
  fontSize: '0.8125rem',
  color: '#16a34a',
  fontWeight: 600,
  margin: '0 0 1rem',
}

const termsGrid: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
}

const termLabel: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#888',
  margin: '0 0 0.1rem',
}

const termValue: React.CSSProperties = {
  fontSize: '0.9375rem',
  fontWeight: 500,
  color: '#111',
  margin: 0,
}

const deliverableRow: React.CSSProperties = {
  padding: '0.75rem',
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  background: '#fafafa',
}
