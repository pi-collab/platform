import type { Metadata } from 'next'
import { verifyCreator } from '@/lib/creator-auth'
import { getMyStorefront } from './actions'
import StorefrontEditor from './StorefrontEditor'

export const metadata: Metadata = { title: 'My Storefront — Guapd Creator' }

export default async function StorefrontPage() {
  const ctx = await verifyCreator()
  const storefront = await getMyStorefront()

  return (
    <main style={{ flex: 1, minWidth: 0, padding: 'clamp(18px,2.4vw,30px) clamp(22px,4vw,56px) clamp(48px,5vw,80px)' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <h1
          style={{
            fontFamily: 'var(--font-display, Sora, sans-serif)',
            fontWeight: 700,
            fontSize: 'clamp(24px,3vw,36px)',
            letterSpacing: '-0.02em',
            color: 'var(--ink, #181C24)',
            marginBottom: 8,
          }}
        >
          My Storefront
        </h1>
        <p style={{ color: 'var(--ink-soft, #555)', fontSize: 15, marginBottom: 32 }}>
          Your public profile page. Brands can discover your work and send you pitches.
        </p>

        <StorefrontEditor initial={storefront} creatorName={ctx.creatorName} />
      </div>
    </main>
  )
}
