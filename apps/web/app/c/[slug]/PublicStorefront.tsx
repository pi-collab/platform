'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ShopfrontPreview from '@/app/creator/storefront/ShopfrontPreview'
import type { ShopfrontData } from '@/app/creator/storefront/ShopfrontPreview'
import { trackEvent } from '@/lib/analytics'

interface Props {
  data: ShopfrontData
  slug: string
  creatorId: string
  creatorName: string
}

export default function PublicStorefront({ data, slug, creatorId, creatorName }: Props) {
  const router = useRouter()

  useEffect(() => {
    trackEvent('storefront_viewed', { slug })
  }, [slug])

  const handleDealClick = useCallback((selectedQty: Record<string, number>) => {
    trackEvent('pitch_started', { slug })
    const params = new URLSearchParams({ creator: creatorId })
    const selected = Object.entries(selectedQty).filter(([, q]) => q > 0)
    if (selected.length > 0) {
      params.set('items', selected.map(([key, q]) => `${key}:${q}`).join(','))
    }
    router.push(`/deals/new?${params.toString()}`, { scroll: true })
  }, [slug, creatorId, router])

  return (
    <div className="creator-main" style={{ minHeight: 'auto' }}>
      <ShopfrontPreview data={data} onDealClick={handleDealClick} />

      {/* Creator CTA footer */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 clamp(16px,3vw,32px) 32px' }}>
        <div style={{
          padding: 'clamp(20px,2.5vw,32px)', borderRadius: 20,
          background: 'var(--card)', border: '1px solid #EAEAE3',
          textAlign: 'center', marginBottom: 24,
        }}>
          <p style={{ color: 'var(--ink-soft)', fontSize: 15, marginBottom: 12 }}>
            Are you a creator? Get your own page and let brands find you.
          </p>
          <a
            href="/creator/storefront"
            style={{
              display: 'inline-block', padding: '12px 28px', borderRadius: 999,
              background: 'var(--neon)', color: 'var(--ink)',
              fontWeight: 700, fontSize: 15, textDecoration: 'none',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Create your shopfront
          </a>
        </div>
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--ink-faint)', fontSize: 13 }}>
          Powered by <strong>Guapd</strong>
        </div>
      </div>
    </div>
  )
}
