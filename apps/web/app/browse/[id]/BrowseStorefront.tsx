'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import Link from 'next/link'
import ShopfrontPreview from '@/app/creator/storefront/ShopfrontPreview'
import type { ShopfrontData } from '@/app/creator/storefront/ShopfrontPreview'

interface Props {
  data: ShopfrontData
  creatorId: string
  creatorSlug?: string
  lastDealId?: string
}

export default function BrowseStorefront({ data, creatorId, creatorSlug, lastDealId }: Props) {
  const router = useRouter()

  const handleDealClick = useCallback((selectedQty: Record<string, number>) => {
    const params = new URLSearchParams({ creator: creatorId })

    // Encode selected items: key:qty pairs for items with qty > 0
    const selected = Object.entries(selectedQty).filter(([, q]) => q > 0)
    if (selected.length > 0) {
      // Find matching rate card items to pass product IDs + quantities
      const itemsParam = selected.map(([key, q]) => `${key}:${q}`).join(',')
      params.set('items', itemsParam)
    }

    router.push(`/deals/new?${params.toString()}`, { scroll: true })
  }, [creatorId, router])

  const dealUrl = `/deals/new?creator=${creatorId}`

  /* Same rule as the CTAs inside the shopfront: with no published packages
     there is nothing to build an offer from, so every path to the offer
     builder is a dead end. Re-engage goes too — it prefills from the last
     deal, and the prefill drops items the creator no longer offers, so with
     none offered it arrives empty. */
  const takesOffers = data.rateCardItems.length > 0

  return (
    <div style={{ position: 'relative' }}>
      {/* Floating top bar */}
      <div style={{
        position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--ink)', borderRadius: 999, padding: '8px 10px 8px 20px',
        boxShadow: '0 16px 40px -12px rgba(0,0,0,.4)',
      }}>
        <Link href="/browse" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
          color: 'rgba(255,255,255,.6)', textDecoration: 'none',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          Browse
        </Link>
        <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,.15)' }} />
        {creatorSlug && (
          <>
            <a href={`/c/${creatorSlug}`} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 999,
              background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)',
              fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
              color: '#fff', textDecoration: 'none',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
              Storefront
            </a>
            <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,.15)' }} />
          </>
        )}
        {lastDealId && takesOffers && (
          <Link href={`/deals/new?from=${lastDealId}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 999,
            background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)',
            fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
            color: '#fff', textDecoration: 'none',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /></svg>
            Re-engage
          </Link>
        )}
        {takesOffers ? (
          <button
            onClick={() => handleDealClick({})}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 999,
              background: 'var(--neon)', border: '1px solid transparent',
              fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700,
              color: 'var(--ink)', cursor: 'pointer',
              boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
            }}
          >
            Start a deal
          </button>
        ) : (
          /* Say why, rather than leaving a gap where the button was. A brand
             who came here to hire someone is owed the reason they cannot. */
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600,
            color: 'rgba(255,255,255,.55)', whiteSpace: 'nowrap',
          }}>
            No packages published yet
          </span>
        )}
      </div>

      <ShopfrontPreview data={data} dealUrl={dealUrl} onDealClick={handleDealClick} />
    </div>
  )
}
