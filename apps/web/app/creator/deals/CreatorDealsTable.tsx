'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

interface Deal {
  id: string
  title: string | null
  deliverables: string | null
  price_paise: number | null
  status: string
  is_posted: boolean | null
  created_at: string
  brand: string | null
}

const STATUSES = ['all', 'negotiating', 'agreed', 'delivered', 'revision', 'approved', 'paid', 'complete', 'declined', 'cancelled'] as const

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `\u20B9${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `\u20B9${(rupees / 1000).toFixed(0)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

const COMPLETED = new Set(['approved', 'paid', 'complete'])

export default function CreatorDealsTable({ deals }: { deals: Deal[] }) {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [brandFilter, setBrandFilter] = useState<string>('all')
  const [postedFilter, setPostedFilter] = useState<'all' | 'posted' | 'awaiting'>('all')

  // Unique brand names sorted alphabetically
  const brands = useMemo(() => {
    const set = new Set<string>()
    for (const d of deals) if (d.brand) set.add(d.brand)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [deals])

  const filtered = useMemo(() => {
    let result = deals
    if (brandFilter !== 'all') result = result.filter((d) => d.brand === brandFilter)
    if (statusFilter !== 'all') result = result.filter((d) => d.status === statusFilter)
    if (postedFilter !== 'all') {
      result = result.filter((d) => {
        if (!COMPLETED.has(d.status)) return true
        return postedFilter === 'posted' ? d.is_posted : !d.is_posted
      })
    }
    return result
  }, [deals, statusFilter, brandFilter, postedFilter])

  // Counts based on brand-filtered deals (so status counts update when brand is selected)
  const brandFiltered = useMemo(() => brandFilter === 'all' ? deals : deals.filter((d) => d.brand === brandFilter), [deals, brandFilter])

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: brandFiltered.length }
    for (const d of brandFiltered) m[d.status] = (m[d.status] ?? 0) + 1
    return m
  }, [brandFiltered])

  const completedDeals = brandFiltered.filter((d) => COMPLETED.has(d.status))
  const postedCount = completedDeals.filter((d) => d.is_posted).length
  const awaitingCount = completedDeals.length - postedCount
  const showPostedFilter = completedDeals.length > 0

  return (
    <>
      <style>{`
        .creator-deals-wrap table { display: table; }
        .creator-deals-wrap .mobile-cards { display: none; }
        @media (max-width: 768px) {
          .creator-deals-wrap table { display: none; }
          .creator-deals-wrap .mobile-cards { display: flex; }
        }
      `}</style>

      {/* Brand filter dropdown */}
      {brands.length > 1 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            style={{
              padding: '0.375rem 0.625rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
              border: '1px solid var(--color-border, #e5e5e5)',
              borderRadius: 6,
              background: 'var(--glass-bg, #fafafa)',
              color: 'var(--color-heading, #111)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="all">All brands ({deals.length})</option>
            {brands.map((b) => (
              <option key={b} value={b}>{b} ({deals.filter((d) => d.brand === b).length})</option>
            ))}
          </select>
        </div>
      )}

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
                border: active ? '1.5px solid var(--color-heading, #111)' : '1px solid var(--color-border, #e5e5e5)',
                background: active ? 'var(--color-heading, #111)' : 'var(--glass-bg, #fafafa)',
                color: active ? '#fff' : 'var(--color-muted, #888)',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {s === 'all' ? 'All' : s} {counts[s] != null ? `(${counts[s]})` : ''}
            </button>
          )
        })}
      </div>

      {/* Posted sub-filter */}
      {showPostedFilter && (
        <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1.25rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-muted, #888)', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: '0.25rem' }}>
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
                  border: active ? '1.5px solid #16a34a' : '1px solid var(--color-border, #e5e5e5)',
                  background: active ? '#dcfce7' : 'var(--glass-bg, #fafafa)',
                  color: active ? '#166534' : 'var(--color-muted, #888)',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      <div className="creator-deals-wrap">
        {/* Desktop table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr>
              {['Brand', 'Title', 'Deliverables', 'Price', 'Status', 'Created', ''].map((h, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: i === 3 ? 'right' : 'left',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-muted, #888)',
                    borderBottom: '1px solid var(--color-border, #e5e5e5)',
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
                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted, #888)', fontSize: '0.8125rem' }}>
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
            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted, #888)', fontSize: '0.8125rem' }}>
              No deals match this filter.
            </p>
          )}
        </div>
      </div>
    </>
  )
}

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

function DealRow({ deal: d }: { deal: Deal }) {
  const sc = STATUS_COLORS[d.status] ?? { bg: '#f3f4f6', color: '#6b7280' }

  return (
    <tr style={{ borderBottom: '1px solid var(--color-border, #e5e5e5)' }}>
      {/* Brand */}
      <td style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: 'var(--color-heading, #111)', whiteSpace: 'nowrap' }}>
        {d.brand || 'Unknown brand'}
      </td>

      {/* Title */}
      <td style={{ padding: '0.625rem 0.75rem', color: 'var(--color-heading, #111)', fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {d.title || 'Untitled deal'}
      </td>

      {/* Deliverables */}
      <td style={{ padding: '0.625rem 0.75rem', color: 'var(--color-muted, #888)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {d.deliverables || '\u2014'}
      </td>

      {/* Price */}
      <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-heading, #111)', whiteSpace: 'nowrap' }}>
        {d.price_paise != null && d.price_paise > 0 ? formatRupees(d.price_paise) : '\u2014'}
      </td>

      {/* Status */}
      <td style={{ padding: '0.625rem 0.75rem' }}>
        <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: sc.bg, color: sc.color, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
          {d.status}
        </span>
        {COMPLETED.has(d.status) && (
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
      <td style={{ padding: '0.625rem 0.75rem', color: 'var(--color-muted, #888)', whiteSpace: 'nowrap' }}>
        {new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
      </td>

      {/* Actions */}
      <td style={{ padding: '0.625rem 0.75rem', whiteSpace: 'nowrap' }}>
        <Link
          href={`/creator/deals/${d.id}`}
          style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-heading, #111)', textDecoration: 'none' }}
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
      href={`/creator/deals/${d.id}`}
      style={{
        display: 'block',
        padding: '0.875rem 1rem',
        background: 'var(--glass-bg, #fff)',
        border: '1px solid var(--color-border, #e5e5e5)',
        borderRadius: 'var(--radius-md, 12px)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.375rem' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-heading, #111)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.title || 'Untitled deal'}
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-muted, #888)', margin: 0 }}>
            {d.brand || 'Unknown brand'}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem', flexShrink: 0 }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>
            {d.status}
          </span>
          {COMPLETED.has(d.status) && (
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
        <p style={{ fontSize: '0.75rem', color: 'var(--color-muted, #888)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
          {d.deliverables || '\u2014'}
        </p>
        <div style={{ textAlign: 'right' }}>
          {d.price_paise != null && d.price_paise > 0 && (
            <p style={{ fontWeight: 700, fontSize: '0.8125rem', fontFamily: 'monospace', color: 'var(--color-heading, #111)', margin: 0 }}>
              {formatRupees(d.price_paise)}
            </p>
          )}
          <p style={{ fontSize: '0.6875rem', color: 'var(--color-muted, #888)', margin: 0 }}>
            {new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </p>
        </div>
      </div>
    </Link>
  )
}
