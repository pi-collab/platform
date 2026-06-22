'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

interface Deal {
  id: string
  title: string | null
  deliverables: string | null
  price_paise: number | null
  status: string
  created_at: string
  creator: { id: string; full_name: string; profile_photo_url: string | null } | null
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  negotiating: { bg: '#fef3c7', color: '#92400e' },
  agreed:      { bg: '#dbeafe', color: '#1e40af' },
  delivered:   { bg: '#e0e7ff', color: '#3730a3' },
  revision:    { bg: '#ffedd5', color: '#9a3412' },
  approved:    { bg: '#dcfce7', color: '#166534' },
  paid:        { bg: '#d1fae5', color: '#065f46' },
  complete:    { bg: '#f3f4f6', color: '#374151' },
  declined:    { bg: '#fee2e2', color: '#991b1b' },
  cancelled:   { bg: '#f3f4f6', color: '#6b7280' },
}

const STATUSES = ['all', 'negotiating', 'agreed', 'delivered', 'revision', 'approved', 'paid', 'complete', 'declined', 'cancelled'] as const

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `\u20B9${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `\u20B9${(rupees / 1000).toFixed(0)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

export default function DealsTable({ deals }: { deals: Deal[] }) {
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = useMemo(
    () => statusFilter === 'all' ? deals : deals.filter((d) => d.status === statusFilter),
    [deals, statusFilter],
  )

  // Count per status for filter pills
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: deals.length }
    for (const d of deals) m[d.status] = (m[d.status] ?? 0) + 1
    return m
  }, [deals])

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

      {/* Status filter pills */}
      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {STATUSES.map((s) => {
          if (s !== 'all' && !counts[s]) return null
          const active = statusFilter === s
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
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
              {s === 'all' ? 'All' : s} {counts[s] != null ? `(${counts[s]})` : ''}
            </button>
          )
        })}
      </div>

      <div className="deals-table-wrap">
        {/* Desktop table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr>
              {['Creator', 'Title', 'Deliverables', 'Price', 'Status', 'Created', ''].map((h, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: i === 3 ? 'right' : 'left',
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
                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.8125rem' }}>
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
    </>
  )
}

function DealRow({ deal: d }: { deal: Deal }) {
  const sc = STATUS_COLORS[d.status] ?? { bg: '#f3f4f6', color: '#6b7280' }

  return (
    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
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
        {d.price_paise != null && d.price_paise > 0 ? formatRupees(d.price_paise) : '\u2014'}
      </td>

      {/* Status */}
      <td style={{ padding: '0.625rem 0.75rem' }}>
        <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: sc.bg, color: sc.color, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
          {d.status}
        </span>
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
  const sc = STATUS_COLORS[d.status] ?? { bg: '#f3f4f6', color: '#6b7280' }

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
              {d.creator?.full_name ?? 'Unknown'}
            </p>
          </div>
        </div>
        <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: sc.bg, color: sc.color, textTransform: 'capitalize', flexShrink: 0 }}>
          {d.status}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
          {d.deliverables || '\u2014'}
        </p>
        <div style={{ textAlign: 'right' }}>
          {d.price_paise != null && d.price_paise > 0 && (
            <p style={{ fontWeight: 700, fontSize: '0.8125rem', fontFamily: 'monospace', color: 'var(--color-heading)', margin: 0 }}>
              {formatRupees(d.price_paise)}
            </p>
          )}
          <p style={{ fontSize: '0.6875rem', color: 'var(--color-muted)', margin: 0 }}>
            {new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </p>
        </div>
      </div>
    </Link>
  )
}
