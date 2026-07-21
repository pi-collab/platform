import { createClient } from '@/lib/supabase/server'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import Link from 'next/link'
import DealsTable from './DealsTable'

const PAGE_SIZE = 20

/** Whitelist search query to alphanumeric, space, hyphen only. */
function sanitizeQuery(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/[^a-zA-Z0-9 \-]/g, '').trim().slice(0, 100)
}

/** Validate that a string is one of the known deal statuses. */
function validStatus(s: string | null | undefined): string | null {
  const VALID = new Set(['negotiating', 'agreed', 'delivered', 'revision', 'approved', 'paid', 'complete', 'declined', 'cancelled'])
  return s && VALID.has(s) ? s : null
}

export default async function DealsListPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; page?: string }
}) {
  await verifyApprovedBrand()

  const q = sanitizeQuery(searchParams.q)
  const status = validStatus(searchParams.status)
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = createClient()

  // Build query — RLS scopes to brand's own deals
  let query = supabase
    .from('deals')
    .select('id, deal_ref, title, deliverables, price_paise, fee_percent, fee_mode, price_per_extra_revision_paise, revisions_used, revision_limit, status, is_posted, created_at, creators(id, full_name, profile_photo_url)', { count: 'exact' })

  // Status filter (server-side)
  if (status) {
    query = query.eq('status', status)
  }

  // Search — sanitized q is safe for ILIKE and .or() filter string
  if (q) {
    // Search deal_ref, title, or deliverables via ILIKE
    // q is already sanitized to [a-zA-Z0-9 -] so it's safe in the filter string
    query = query.or(`deal_ref.ilike.%${q}%,title.ilike.%${q}%,deliverables.ilike.%${q}%`)
  }

  // Order + paginate
  query = query.order('created_at', { ascending: false }).range(from, to)

  // Also fetch invoices for all deals (for display status)
  const [{ data: deals, error, count }, { data: invoices }] = await Promise.all([
    query,
    supabase.from('invoices').select('deal_id, status, due_date'),
  ])

  if (error) {
    return (
      <section style={container}>
        <p style={{ color: '#dc2626' }}>Error loading deals: {error.message}</p>
      </section>
    )
  }

  // Index invoices by deal_id
  const invoiceMap = new Map<string, { status: string; due_date: string | null }>()
  for (const inv of invoices ?? []) {
    invoiceMap.set(inv.deal_id, { status: inv.status, due_date: inv.due_date })
  }

  const all = (deals ?? []).map((d) => {
    const raw = d.creators as unknown
    const creator = Array.isArray(raw) ? raw[0] ?? null : (raw as { id: string; full_name: string; profile_photo_url: string | null } | null)
    const inv = invoiceMap.get(d.id) ?? null
    return { ...d, creator, invoiceStatus: inv?.status ?? null, invoiceDueDate: inv?.due_date ?? null }
  })

  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <section style={container}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-heading)', margin: '0 0 0.375rem' }}>
            Your Deals
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.9375rem', margin: 0 }}>
            {totalCount} deal{totalCount !== 1 ? 's' : ''}
            {q && <> matching &ldquo;{q}&rdquo;</>}
            {status && <> &middot; {status}</>}
          </p>
        </div>
        <Link
          href="/browse"
          style={{ padding: '0.5rem 1rem', background: '#111', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          + New Deal
        </Link>
      </div>

      {totalCount === 0 && !q && !status ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-heading)' }}>No deals yet</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0.25rem 0 1rem' }}>
            Browse creators and start your first deal.
          </p>
          <Link href="/browse" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-heading)', textDecoration: 'none' }}>
            Browse creators &rarr;
          </Link>
        </div>
      ) : (
        <DealsTable
          deals={all}
          currentStatus={status}
          currentQuery={q}
          currentPage={page}
          totalPages={totalPages}
          totalCount={totalCount}
        />
      )}
    </section>
  )
}

const container: React.CSSProperties = {
  padding: '2.5rem var(--container-pad)',
  maxWidth: 'var(--container-width)',
  margin: '0 auto',
}
