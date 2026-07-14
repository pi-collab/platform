import { createClient } from '@/lib/supabase/server'
import { verifyCreator } from '@/lib/creator-auth'
import Link from 'next/link'
import type { Metadata } from 'next'
import CreatorDealsTable from './CreatorDealsTable'

export const metadata: Metadata = { title: 'My Deals — Guapd Creator' }

export default async function CreatorDealsPage() {
  const ctx = await verifyCreator()
  const supabase = createClient()

  const { data: deals, error } = await supabase
    .from('deals')
    .select('id, title, deliverables, price_paise, status, is_posted, created_at, brands(name)')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <main style={wrapper}>
        <p style={{ color: '#dc2626', fontSize: '0.875rem' }}>Error loading deals: {error.message}</p>
      </main>
    )
  }

  const all = (deals ?? []).map((d) => {
    const rawBrand = d.brands as unknown
    const brand = Array.isArray(rawBrand) ? rawBrand[0]?.name : (rawBrand as any)?.name ?? null
    return { ...d, brand }
  })

  return (
    <main style={wrapper}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={heading}>My Deals</h1>
          <p style={{ color: 'var(--color-muted, #888)', fontSize: '0.9375rem', margin: 0 }}>
            {all.length} deal{all.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {all.length === 0 ? (
        <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-heading, #111)' }}>No deals yet</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-muted, #888)', margin: '0.25rem 0 0', lineHeight: 1.6 }}>
            When a brand sends you an offer, it will appear here. Make sure your profile is complete so brands can find you.
          </p>
        </div>
      ) : (
        <CreatorDealsTable deals={all} />
      )}
    </main>
  )
}

const wrapper: React.CSSProperties = {
  padding: '2.5rem var(--container-pad, clamp(1rem, 3vw, 2.5rem))',
  maxWidth: 'var(--container-width, 1080px)',
  margin: '0 auto',
}

const heading: React.CSSProperties = {
  fontFamily: 'var(--font-heading, inherit)',
  fontSize: '1.75rem',
  fontWeight: 700,
  color: 'var(--color-heading, #111)',
  margin: '0 0 0.375rem',
}
