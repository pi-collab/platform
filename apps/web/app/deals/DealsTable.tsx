'use client'

import { useState, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { calculateFee } from '@/lib/fee'
import { deriveDisplayStatus, dueLabel } from '@/lib/deal-status'

interface Deal {
  id: string
  deal_ref: string | null
  title: string | null
  deliverables: string | null
  price_paise: number | null
  fee_percent: number | null
  fee_mode: string | null
  price_per_extra_revision_paise: number | null
  revisions_used: number | null
  revision_limit: number | null
  status: string
  is_posted: boolean | null
  created_at: string
  creator: { id: string; full_name: string; profile_photo_url: string | null } | null
  invoiceStatus: string | null
  invoiceDueDate: string | null
}

function brandTotal(d: Deal): number | null {
  if (d.price_paise == null || d.price_paise <= 0) return null
  const fee = calculateFee(d.price_paise, d.fee_percent ?? 0, (d.fee_mode as 'on_top' | 'deducted') ?? 'on_top')
  const extra = Math.max(0, (d.revisions_used ?? 0) - (d.revision_limit ?? 0))
  const overage = extra * (d.price_per_extra_revision_paise ?? 0)
  return fee.brand_pays_paise + overage
}

const STATUSES = ['all', 'negotiating', 'agreed', 'delivered', 'revision', 'approved', 'paid', 'complete', 'declined', 'cancelled'] as const

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `\u20B9${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `\u20B9${(rupees / 1000).toFixed(0)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

interface Props {
  deals: Deal[]
  currentStatus: string | null
  currentQuery: string
  currentPage: number
  totalPages: number
  totalCount: number
}

export default function DealsTable({ deals, currentStatus, currentQuery, currentPage, totalPages, totalCount }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = useState(currentQuery)
  const [postedFilter, setPostedFilter] = useState<'all' | 'posted' | 'awaiting'>('all')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Navigate with updated search params
  function navigate(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '' || v === 'all') {
        params.delete(k)
      } else {
        params.set(k, v)
      }
    }
    // Reset page when filters change (unless page itself is being set)
    if (!('page' in updates)) params.delete('page')
    router.push(`/deals?${params.toString()}`)
  }

  function handleSearchChange(value: string) {
    setSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      navigate({ q: value || null })
    }, 300)
  }

  // Posted sub-filter is client-side (within the page's results)
  const filtered = useMemo(() => {
    if (postedFilter === 'all') return deals
    const completedStatuses = new Set(['approved', 'paid', 'complete'])
    return deals.filter((d) => {
      if (!completedStatuses.has(d.status)) return true
      return postedFilter === 'posted' ? d.is_posted : !d.is_posted
    })
  }, [deals, postedFilter])

  // Posted counts (among current page's completed deals)
  const completedStatuses = new Set(['approved', 'paid', 'complete'])
  const completedDeals = deals.filter((d) => completedStatuses.has(d.status))
  const postedCount = completedDeals.filter((d) => d.is_posted).length
  const awaitingCount = completedDeals.length - postedCount
  const showPostedFilter = completedDeals.length > 0

  return (
    <>
      <style>{`
        .deals-table-wrap table { display: table; }
        .deals-table-wrap .mobile-cards { display: none; }
        @media (max-width: 768px) {
          .deals-table-wrap table { display: none; }
          .deals-table-wrap .mobile-cards { display: flex; }
        }
      `}</style>

      {/* Search bar — live search with 300ms debounce */}
      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search by ref, title, or deliverables..."
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            paddingRight: searchInput ? '2rem' : '0.75rem',
            fontSize: '0.8125rem',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            background: 'var(--glass-bg)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => handleSearchChange('')}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: '1rem', color: 'var(--color-muted)', cursor: 'pointer', lineHeight: 1, padding: '0.125rem' }}
            aria-label="Clear search"
          >
            &times;
          </button>
        )}
      </div>

      {/* Status filter pills — URL-param driven */}
      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {STATUSES.map((s) => {
          const active = s === 'all' ? !currentStatus : currentStatus === s
          return (
            <button
              key={s}
              onClick={() => navigate({ status: s === 'all' ? null : s })}
              style={{
                padding: '0.3rem 0.625rem',
                fontSize: '0.75rem',
                fontWeight: active ? 700 : 500,
                borderRadius: 9999,
                border: active ? '1.5px solid var(--color-heading)' : '1px solid var(--color-border)',
                background: active ? 'var(--color-heading)' : 'var(--glass-bg)',
                color: active ? 'var(--_white, #fff)' : 'var(--color-muted)',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {s === 'all' ? 'All' : s}
            </button>
          )
        })}
      </div>

      {/* Posted sub-filter — client-side, shown when completed deals exist */}
      {showPostedFilter && (
        <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1.25rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: '0.25rem' }}>
            Posted:
          </span>
          {([['all', `All (${completedDeals.length})`], ['posted', `Posted (${postedCount})`], ['awaiting', `Awaiting (${awaitingCount})`]] as const).map(([key, label]) => {
            const active = postedFilter === key
            return (
              <button
                key={key}
                onClick={() => setPostedFilter(key)}
                style={{
                  padding: '0.2rem 0.5rem',
                  fontSize: '0.6875rem',
                  fontWeight: active ? 700 : 500,
                  borderRadius: 9999,
                  border: active ? '1.5px solid #16a34a' : '1px solid var(--color-border)',
                  background: active ? '#dcfce7' : 'var(--glass-bg)',
                  color: active ? '#166534' : 'var(--color-muted)',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      <div className="deals-table-wrap">
        {/* Desktop table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr>
              {['Ref', 'Creator', 'Title', 'Deliverables', 'Price', 'Status', 'Created', ''].map((h, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: i === 4 ? 'right' : 'left',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-muted)',
                    borderBottom: '1px solid var(--color-border)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <DealRow key={d.id} deal={d} />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.8125rem' }}>
                  No deals match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Mobile cards */}
        <div className="mobile-cards" style={{ flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map((d) => (
            <MobileCard key={d.id} deal={d} />
          ))}
          {filtered.length === 0 && (
            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.8125rem' }}>
              No deals match this filter.
            </p>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button
            disabled={currentPage <= 1}
            onClick={() => navigate({ page: String(currentPage - 1) })}
            style={{ ...paginationBtn, opacity: currentPage <= 1 ? 0.4 : 1 }}
          >
            &larr; Prev
          </button>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => navigate({ page: String(currentPage + 1) })}
            style={{ ...paginationBtn, opacity: currentPage >= totalPages ? 0.4 : 1 }}
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* Footer count */}
      <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '0.75rem' }}>
        Showing {filtered.length} of {totalCount} deals
      </p>
    </>
  )
}

function DealRow({ deal: d }: { deal: Deal }) {
  const derived = deriveDisplayStatus(d.status, d.invoiceStatus, d.invoiceDueDate)
  const sc = derived.color
  const due = dueLabel(d.status, d.invoiceStatus, d.invoiceDueDate)

  return (
    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
      {/* Ref */}
      <td style={{ padding: '0.625rem 0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
        {d.deal_ref ?? '\u2014'}
      </td>

      {/* Creator */}
      <td style={{ padding: '0.625rem 0.75rem', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {d.creator?.profile_photo_url ? (
            <img
              src={d.creator.profile_photo_url}
              alt={d.creator.full_name}
              style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', objectFit: 'cover', border: '1px solid var(--color-border)', flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'var(--section-bg-alt)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.625rem', color: 'var(--color-muted)', flexShrink: 0 }}>
              {d.creator?.full_name?.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) ?? '?'}
            </div>
          )}
          <span style={{ fontWeight: 600, color: 'var(--color-heading)' }}>{d.creator?.full_name ?? 'Unknown'}</span>
        </div>
      </td>

      {/* Title */}
      <td style={{ padding: '0.625rem 0.75rem', color: 'var(--color-heading)', fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {d.title || 'Untitled deal'}
      </td>

      {/* Deliverables */}
      <td style={{ padding: '0.625rem 0.75rem', color: 'var(--color-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {d.deliverables || '\u2014'}
      </td>

      {/* Price */}
      <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-heading)', whiteSpace: 'nowrap' }}>
        {(() => {
          const total = brandTotal(d)
          return total != null ? formatRupees(total) : '\u2014'
        })()}
      </td>

      {/* Status */}
      <td style={{ padding: '0.625rem 0.75rem' }}>
        <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: sc.bg, color: sc.color, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
          {derived.label}
        </span>
        {due && (
          <span style={{ fontSize: '0.625rem', fontWeight: 600, color: derived.label === 'overdue' ? '#991b1b' : '#854d0e', marginLeft: '0.375rem' }}>
            {due}
          </span>
        )}
        {new Set(['approved', 'paid', 'complete']).has(d.status) && (
          <span style={{
            fontSize: '0.5625rem', fontWeight: 600, padding: '0.1rem 0.375rem', borderRadius: 9999, marginLeft: '0.375rem',
            background: d.is_posted ? '#dcfce7' : '#fef9c3',
            color: d.is_posted ? '#166534' : '#854d0e',
          }}>
            {d.is_posted ? 'Posted' : 'Awaiting post'}
          </span>
        )}
      </td>

      {/* Created */}
      <td style={{ padding: '0.625rem 0.75rem', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
        {new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
      </td>

      {/* Actions */}
      <td style={{ padding: '0.625rem 0.75rem', whiteSpace: 'nowrap' }}>
        <Link
          href={`/deals/${d.id}`}
          style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-heading)', textDecoration: 'none' }}
        >
          View details
        </Link>
      </td>
    </tr>
  )
}

function MobileCard({ deal: d }: { deal: Deal }) {
  const derived = deriveDisplayStatus(d.status, d.invoiceStatus, d.invoiceDueDate)
  const sc = derived.color

  return (
    <Link
      href={`/deals/${d.id}`}
      style={{
        display: 'block',
        padding: '0.875rem 1rem',
        background: 'var(--glass-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.375rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
          {d.creator?.profile_photo_url ? (
            <img src={d.creator.profile_photo_url} alt={d.creator.full_name} style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', objectFit: 'cover', border: '1px solid var(--color-border)', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'var(--section-bg-alt)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.625rem', color: 'var(--color-muted)', flexShrink: 0 }}>
              {d.creator?.full_name?.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) ?? '?'}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-heading)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.title || 'Untitled deal'}
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', margin: 0 }}>
              {d.deal_ref && <span style={{ fontFamily: 'monospace', marginRight: '0.375rem' }}>{d.deal_ref}</span>}
              {d.creator?.full_name ?? 'Unknown'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem', flexShrink: 0 }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>
            {derived.label}
          </span>
          {new Set(['approved', 'paid', 'complete']).has(d.status) && (
            <span style={{
              fontSize: '0.5625rem', fontWeight: 600, padding: '0.1rem 0.375rem', borderRadius: 9999,
              background: d.is_posted ? '#dcfce7' : '#fef9c3',
              color: d.is_posted ? '#166534' : '#854d0e',
            }}>
              {d.is_posted ? 'Posted' : 'Awaiting post'}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
          {d.deliverables || '\u2014'}
        </p>
        <div style={{ textAlign: 'right' }}>
          {(() => {
            const total = brandTotal(d)
            return total != null ? (
              <p style={{ fontWeight: 700, fontSize: '0.8125rem', fontFamily: 'monospace', color: 'var(--color-heading)', margin: 0 }}>
                {formatRupees(total)}
              </p>
            ) : null
          })()}
          <p style={{ fontSize: '0.6875rem', color: 'var(--color-muted)', margin: 0 }}>
            {new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </p>
        </div>
      </div>
    </Link>
  )
}

const paginationBtn: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  fontSize: '0.8125rem',
  fontWeight: 600,
  background: 'var(--glass-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  cursor: 'pointer',
  color: 'var(--color-heading)',
}
