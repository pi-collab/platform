import { createClient } from '@/lib/supabase/server'
import { verifyCreator } from '@/lib/creator-auth'
import type { Metadata } from 'next'
import CreatorDealsTable from './CreatorDealsTable'

export const metadata: Metadata = { title: 'My Deals — Guapd Creator' }

export default async function CreatorDealsPage() {
  const ctx = await verifyCreator()
  const supabase = createClient()

  const { data: deals, error } = await supabase
    .from('deals')
    .select('id, deal_ref, title, deliverables, price_paise, status, is_posted, created_at, brands(name)')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <main style={{ flex: 1, minWidth: 0, padding: 'clamp(18px,2.4vw,30px) clamp(22px,4vw,56px) clamp(48px,5vw,80px)' }}>
        <div style={{ maxWidth: 1220, margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 18px',
              borderRadius: 16,
              background: '#fff',
              border: '1px solid var(--frost-edge)',
              boxShadow: '0 12px 28px -20px rgba(40,52,70,.42), inset 0 1px 0 rgba(255,255,255,.95)',
              color: '#9B3030',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#D2545A', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-inter, Inter), system-ui, sans-serif', fontSize: 14, fontWeight: 500 }}>
              Error loading deals: {error.message}
            </span>
          </div>
        </div>
      </main>
    )
  }

  const all = (deals ?? []).map((d) => {
    const rawBrand = d.brands as unknown
    const brand = Array.isArray(rawBrand) ? rawBrand[0]?.name : (rawBrand as any)?.name ?? null
    return { ...d, brand }
  })

  return (
    <main style={{ flex: 1, minWidth: 0, padding: 'clamp(18px,2.4vw,30px) clamp(22px,4vw,56px) clamp(48px,5vw,80px)' }}>
      <div style={{ maxWidth: 1220, margin: '0 auto' }}>
        <div
          style={{
            borderRadius: 26,
            border: '1px solid var(--frost-edge)',
            background: 'rgba(255,255,255,.5)',
            backdropFilter: 'blur(26px) saturate(150%)',
            WebkitBackdropFilter: 'blur(26px) saturate(150%)',
            boxShadow: '0 34px 66px -34px rgba(40,52,70,.42), inset 0 1px 0 rgba(255,255,255,.9)',
            padding: 'clamp(18px, 2.6vw, 28px)',
          }}
        >
          <CreatorDealsTable deals={all} />
        </div>
      </div>
    </main>
  )
}
