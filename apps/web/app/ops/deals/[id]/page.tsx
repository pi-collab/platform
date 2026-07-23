import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import FeeOverrideForm from './FeeOverrideForm'

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

export default async function OpsDealDetailPage({ params }: { params: { id: string } }) {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: deal }, { data: events }, { data: messages }] = await Promise.all([
    admin
      .from('deals')
      .select('id, title, deliverables, price_paise, price_per_extra_revision_paise, fee_percent, fee_mode, fee_pct_override, brand_id, currency, status, timeline_date, revision_limit, revisions_used, usage_rights, payment_terms, last_offer_by, created_at, updated_at, agreed_at, completed_at, brands(name, platform_fee_percent), creators(id, full_name, handle)')
      .eq('id', params.id)
      .single(),
    admin
      .from('events')
      .select('id, event_type, detail, created_at')
      .eq('deal_id', params.id)
      .order('created_at', { ascending: true }),
    admin
      .from('messages')
      .select('id, sender_party, body, created_at')
      .eq('deal_id', params.id)
      .order('created_at', { ascending: true }),
  ])

  if (!deal) notFound()

  const brand = (deal.brands as any)?.name ?? '—'
  const creator = (deal.creators as any) ?? null
  const sc = STATUS_COLORS[deal.status] ?? { bg: '#f3f4f6', color: '#6b7280' }
  const extraRevisions = Math.max(0, (deal.revisions_used ?? 0) - (deal.revision_limit ?? 0))
  const overage = extraRevisions * (deal.price_per_extra_revision_paise ?? 0)
  const feePercent = deal.fee_percent ?? 0
  const feeMode = (deal.fee_mode ?? 'on_top') as string
  const feePaise = deal.price_paise ? Math.round(deal.price_paise * feePercent / 100) : 0
  const brandPays = deal.price_paise ? (feeMode === 'on_top' ? deal.price_paise + feePaise : deal.price_paise) + overage : 0
  const creatorReceives = deal.price_paise ? (feeMode === 'deducted' ? deal.price_paise - feePaise : deal.price_paise) + overage : 0
  const price = deal.price_paise ? `\u20B9${(brandPays / 100).toLocaleString('en-IN')}` : '—'

  return (
    <div>
      <Link href="/ops/deals" style={{ fontSize: '0.8125rem', color: '#888', textDecoration: 'none', display: 'inline-block', marginBottom: '1rem' }}>
        &larr; All deals
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{deal.title || 'Untitled deal'}</h1>
            <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>
              {deal.status}
            </span>
          </div>
          <p style={{ fontSize: '0.8125rem', color: '#666', margin: 0 }}>
            {brand} &rarr; {creator?.full_name ?? '—'}{creator?.handle ? ` (${creator.handle})` : ''}
          </p>
        </div>
        <p style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{price}</p>
      </div>

      {/* Terms + Timeline side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Terms */}
        <div>
          <h2 style={sectionTitle}>Deal Terms</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Field label="Deliverables" value={deal.deliverables} />
            <Field label="Timeline" value={deal.timeline_date ? new Date(deal.timeline_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null} />
            <Field label="Revisions" value={`${deal.revisions_used} / ${deal.revision_limit}`} />
            {feePercent > 0 && (
              <>
                <Field label={`Platform fee (${feePercent}%, ${feeMode === 'on_top' ? 'on top' : 'deducted'})`} value={`\u20B9${(feePaise / 100).toLocaleString('en-IN')}`} />
                <Field label="Brand pays" value={`\u20B9${(brandPays / 100).toLocaleString('en-IN')}`} />
                <Field label="Creator receives" value={`\u20B9${(creatorReceives / 100).toLocaleString('en-IN')}`} />
              </>
            )}
            {(deal.price_per_extra_revision_paise ?? 0) > 0 && (
              <Field label="Per extra revision" value={`\u20B9${((deal.price_per_extra_revision_paise ?? 0) / 100).toLocaleString('en-IN')}`} />
            )}
            {overage > 0 && (
              <div>
                <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888', margin: '0 0 0.1rem' }}>Revision overage</p>
                <p style={{ fontSize: '0.8125rem', fontWeight: 700, fontFamily: 'monospace', color: '#111', margin: 0 }}>
                  {extraRevisions} extra rev × \u20B9{((deal.price_per_extra_revision_paise ?? 0) / 100).toLocaleString('en-IN')} = \u20B9{(overage / 100).toLocaleString('en-IN')}
                </p>
              </div>
            )}
            <Field label="Usage rights" value={deal.usage_rights} />
            <Field label="Payment terms" value={deal.payment_terms} />
            <Field label="Last offer by" value={deal.last_offer_by} />
            <Field label="Currency" value={deal.currency} />
          </div>
        </div>

        {/* Events timeline */}
        <div>
          <h2 style={sectionTitle}>Events</h2>
          {(!events || events.length === 0) ? (
            <p style={{ fontSize: '0.8125rem', color: '#888' }}>No events yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {events.map((ev) => {
                const detail = ev.detail as Record<string, any> | null
                const desc = detail?.from && detail?.to
                  ? `${detail.from} \u2192 ${detail.to}`
                  : ev.event_type
                return (
                  <div key={ev.id} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8125rem' }}>
                    <span style={{ color: '#888', fontSize: '0.75rem', whiteSpace: 'nowrap', minWidth: 100 }}>
                      {new Date(ev.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{' '}
                      {new Date(ev.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span>
                      <strong>{ev.event_type.replace(/[._]/g, ' ')}</strong>
                      {detail?.from && <span style={{ color: '#666' }}> ({desc})</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div>
        <h2 style={sectionTitle}>Messages ({messages?.length ?? 0})</h2>
        {(!messages || messages.length === 0) ? (
          <p style={{ fontSize: '0.8125rem', color: '#888' }}>No messages.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: 400, overflowY: 'auto', border: '1px solid #e5e5e5', borderRadius: 8, padding: '0.75rem' }}>
            {messages.map((msg) => (
              <div key={msg.id} style={{ fontSize: '0.8125rem', padding: '0.375rem 0', borderBottom: '1px solid #f5f5f5' }}>
                <span style={{ fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', color: msg.sender_party === 'brand' ? '#1e40af' : '#166534' }}>
                  {msg.sender_party}
                </span>
                <span style={{ color: '#888', fontSize: '0.6875rem', marginLeft: '0.5rem' }}>
                  {new Date(msg.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <p style={{ margin: '0.15rem 0 0', color: '#333' }}>{msg.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fee Override */}
      <div style={{ marginTop: '1.5rem' }}>
        <FeeOverrideForm
          dealId={deal.id}
          dealStatus={deal.status}
          pricePaise={deal.price_paise ?? 0}
          feePercent={feePercent}
          feeMode={feeMode}
          feePctOverride={(deal as Record<string, unknown>).fee_pct_override as number | null}
          brandFeePercent={(deal.brands as any)?.platform_fee_percent ?? 0}
        />
      </div>

      {/* Metadata */}
      <div style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#888' }}>
        <p style={{ margin: '0.15rem 0' }}>Deal ID: <span style={{ fontFamily: 'monospace' }}>{deal.id}</span></p>
        <p style={{ margin: '0.15rem 0' }}>Created: {new Date(deal.created_at).toLocaleString('en-IN')}</p>
        <p style={{ margin: '0.15rem 0' }}>Updated: {new Date(deal.updated_at).toLocaleString('en-IN')}</p>
        {deal.agreed_at && <p style={{ margin: '0.15rem 0' }}>Agreed: {new Date(deal.agreed_at).toLocaleString('en-IN')}</p>}
        {deal.completed_at && <p style={{ margin: '0.15rem 0' }}>Completed: {new Date(deal.completed_at).toLocaleString('en-IN')}</p>}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888', margin: '0 0 0.1rem' }}>{label}</p>
      <p style={{ fontSize: '0.8125rem', color: value ? '#111' : '#ccc', margin: 0 }}>{value || '\u2014'}</p>
    </div>
  )
}

const sectionTitle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#555',
  margin: '0 0 0.75rem',
}
