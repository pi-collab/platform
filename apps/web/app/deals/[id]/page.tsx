import { createClient } from '@/lib/supabase/server'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import DealThread from './DealThread'

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(0)}K`
  return `₹${rupees.toLocaleString('en-IN')}`
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  negotiating: { bg: '#dbeafe', color: '#1e40af' },
  agreed: { bg: '#dcfce7', color: '#166534' },
  delivered: { bg: '#fef9c3', color: '#854d0e' },
  revision: { bg: '#ffedd5', color: '#9a3412' },
  approved: { bg: '#dcfce7', color: '#166534' },
  paid: { bg: '#d1fae5', color: '#065f46' },
  complete: { bg: '#f3f4f6', color: '#374151' },
  declined: { bg: '#fee2e2', color: '#991b1b' },
  cancelled: { bg: '#f3f4f6', color: '#6b7280' },
}

export default async function DealDetailPage({ params }: { params: { id: string } }) {
  await verifyApprovedBrand()

  const supabase = createClient()

  // Fetch deal + events in parallel. RLS deals_read restricts to brand's own deals.
  // If another brand guesses the URL, .maybeSingle() returns null → notFound().
  const [{ data: deal, error: dealError }, { data: events }, { data: messages }] = await Promise.all([
    supabase
      .from('deals')
      .select('id, title, deliverables, price_paise, status, timeline_date, revision_limit, revisions_used, usage_rights, payment_terms, last_offer_by, created_at, updated_at, agreed_at, completed_at, creators(id, full_name, handle, profile_photo_url)')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('events')
      .select('id, event_type, detail, created_at')
      .eq('deal_id', params.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('messages')
      .select('id, sender_party, body, created_at')
      .eq('deal_id', params.id)
      .order('created_at', { ascending: true }),
  ])

  if (dealError || !deal) notFound()

  const creatorArr = deal.creators as unknown as { id: string; full_name: string; handle: string | null; profile_photo_url: string | null }[] | null
  const creator = creatorArr?.[0] ?? null
  const sc = STATUS_COLORS[deal.status] ?? { bg: '#f3f4f6', color: '#6b7280' }

  return (
    <section style={{ padding: '2.5rem var(--container-pad)', maxWidth: 'var(--container-width)', margin: '0 auto' }}>
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
              {deal.status}
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
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {deal.price_paise != null && deal.price_paise > 0 && (
            <p style={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-heading)', margin: 0 }}>
              {formatRupees(deal.price_paise)}
            </p>
          )}
          <DealThread dealId={deal.id} initialMessages={(messages ?? []) as { id: string; sender_party: 'brand' | 'creator'; body: string | null; created_at: string }[]} />
        </div>
      </div>

      {/* Deal details grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginBottom: '2.5rem' }}>
        {/* Terms */}
        <div>
          <h2 style={sectionTitle}>Deal Terms</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <DetailField label="Deliverables" value={deal.deliverables} />
            <DetailField label="Delivery date" value={deal.timeline_date ? new Date(deal.timeline_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null} />
            <DetailField label="Revisions" value={`${deal.revisions_used} / ${deal.revision_limit} used`} />
            <DetailField label="Usage rights" value={deal.usage_rights} />
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
