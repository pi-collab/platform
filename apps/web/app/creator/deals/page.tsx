import { createClient } from '@/lib/supabase/server'
import { verifyCreator } from '@/lib/creator-auth'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'My Deals — Guapd Creator' }

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

export default async function CreatorDealsPage() {
  const ctx = await verifyCreator()
  const supabase = createClient()

  const { data: deals, error } = await supabase
    .from('deals')
    .select('id, title, deliverables, price_paise, status, created_at, brands(name)')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <main style={wrapper}>
        <p style={{ color: '#dc2626', fontSize: '0.875rem' }}>Error loading deals: {error.message}</p>
      </main>
    )
  }

  const all = deals ?? []

  return (
    <main style={wrapper}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={heading}>My Deals</h1>
        <p style={{ color: '#888', fontSize: '0.875rem', margin: 0 }}>
          {all.length} deal{all.length !== 1 ? 's' : ''}
        </p>
      </div>

      {all.length === 0 ? (
        <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📬</p>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#111' }}>No deals yet</p>
          <p style={{ fontSize: '0.875rem', color: '#888', margin: '0.5rem 0 0', lineHeight: 1.6 }}>
            When a brand sends you an offer, it will appear here. Make sure your profile is complete so brands can find you.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {all.map((d) => {
            const rawBrand = d.brands as unknown
            const brand = Array.isArray(rawBrand) ? rawBrand[0]?.name : (rawBrand as any)?.name ?? null
            const sc = STATUS_COLORS[d.status] ?? { bg: '#f3f4f6', color: '#6b7280' }
            return (
              <Link
                key={d.id}
                href={`/creator/deals/${d.id}`}
                style={card}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#111', margin: 0 }}>
                      {d.title || 'Untitled deal'}
                    </p>
                    <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555', margin: '0.15rem 0 0' }}>
                      {brand || 'Unknown brand'}
                    </p>
                  </div>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: sc.bg, color: sc.color, textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {d.status}
                  </span>
                </div>
                {d.deliverables && (
                  <p style={{ fontSize: '0.75rem', color: '#555', margin: '0 0 0.375rem' }}>{d.deliverables}</p>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {d.price_paise != null && d.price_paise > 0 && (
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'monospace', color: '#111' }}>
                      {formatRupees(d.price_paise)}
                    </span>
                  )}
                  <span style={{ fontSize: '0.6875rem', color: '#aaa' }}>
                    {new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}

const wrapper: React.CSSProperties = {
  padding: '2rem clamp(1rem, 3vw, 2.5rem)',
  maxWidth: 900,
  margin: '0 auto',
}

const heading: React.CSSProperties = {
  fontFamily: 'var(--font-heading, inherit)',
  fontSize: '1.375rem',
  fontWeight: 700,
  color: 'var(--color-heading, #111)',
  margin: '0 0 0.25rem',
}

const card: React.CSSProperties = {
  display: 'block',
  padding: '1rem',
  border: '1px solid #e5e5e5',
  borderRadius: 12,
  textDecoration: 'none',
  color: 'inherit',
  background: '#fff',
}
