import { createClient } from '@/lib/supabase/server'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import BrowseGrid from './BrowseGrid'

interface SocialAccount {
  platform: string
  handle: string
  url: string | null
  follower_count: number | null
  verified: boolean
}

export interface BrowseCreator {
  id: string
  full_name: string
  niches: string[]
  handle: string | null
  bio: string | null
  profile_photo_url: string | null
  social_accounts: SocialAccount[]
  worked_with: string[]
  rate_card: Record<string, number> | null
}

export default async function BrowsePage() {
  const brand = await verifyApprovedBrand()

  // Uses the anon-key client — RLS creators_read policy enforces is_vetted=true
  const supabase = createClient()
  const { data: creators, error } = await supabase
    .from('creators')
    .select('id, full_name, niches, handle, bio, profile_photo_url, social_accounts, worked_with, rate_card')
    .order('full_name', { ascending: true })

  if (error) {
    return (
      <div style={{ padding: '4rem var(--container-pad)', textAlign: 'center' }}>
        <p style={{ color: '#dc2626' }}>Error loading creators: {error.message}</p>
      </div>
    )
  }

  return (
    <section style={{ padding: '2.5rem var(--container-pad)', maxWidth: 'var(--container-width)', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-heading)', margin: '0 0 0.375rem' }}>
          Browse Creators
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.9375rem', margin: 0 }}>
          Find a creator from our vetted roster to start a deal.
        </p>
      </div>
      <BrowseGrid creators={(creators ?? []) as BrowseCreator[]} />
    </section>
  )
}
