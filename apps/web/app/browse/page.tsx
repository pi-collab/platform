import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

  // Fetch which creators have published storefronts (RLS blocks brand reads, use admin)
  const admin = createAdminClient()
  const { data: storefronts } = await admin
    .from('creator_storefronts')
    .select('creator_id, slug')
    .eq('is_published', true)

  const storefrontSlugs: Record<string, string> = {}
  for (const s of storefronts ?? []) {
    storefrontSlugs[s.creator_id] = s.slug
  }

  return <BrowseGrid creators={(creators ?? []) as BrowseCreator[]} storefrontSlugs={storefrontSlugs} />
}
