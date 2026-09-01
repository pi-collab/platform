import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyBrand } from '@/lib/brand-auth'
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
  const brand = await verifyBrand()

  // Service role, and the is_vetted filter is now WRITTEN OUT rather than left
  // to RLS. rate_card is no longer readable by the anon key — migration 0470
  // withholds it, along with phone and contact_email, because creators_read
  // hands every authenticated user the whole row and RLS cannot restrict
  // columns. This page is server-rendered behind verifyBrand(), so the service
  // role is the right client for it.
  //
  // The .eq('is_vetted', true) is load bearing: RLS was enforcing it, and the
  // service role bypasses RLS. Without it this page would list unvetted
  // creators to every brand.
  const admin = createAdminClient()
  const { data: creators, error } = await admin
    .from('creators')
    .select('id, full_name, niches, handle, bio, profile_photo_url, social_accounts, worked_with, rate_card')
    .eq('is_vetted', true)
    .order('full_name', { ascending: true })

  if (error) {
    return (
      <div style={{ padding: '4rem var(--container-pad)', textAlign: 'center' }}>
        <p style={{ color: '#dc2626' }}>Error loading creators: {error.message}</p>
      </div>
    )
  }

  // Fetch which creators have published storefronts (RLS blocks brand reads)
  const { data: storefronts } = await admin
    .from('creator_storefronts')
    .select('creator_id, slug')
    .eq('is_published', true)

  const storefrontSlugs: Record<string, string> = {}
  for (const s of storefronts ?? []) {
    storefrontSlugs[s.creator_id] = s.slug
  }

  // Verified follower counts, for creators who have connected Instagram.
  //
  // This card read social_accounts.follower_count only, which is the figure a
  // creator TYPES. A connected creator's real count lives on the snapshot, and
  // the two are independent: connecting does not write into social_accounts. So
  // a creator with 535 verified followers showed 0 here, and sorting by
  // followers put them last. Snapshot-first, the same rule the storefront and
  // the editor already follow.
  //
  // Server-side and via the admin client: creator_instagram_connections denies
  // all client access, and only the follower count leaves this function.
  const { data: connections } = await admin
    .from('creator_instagram_connections')
    .select('creator_id, snapshot')
    .eq('status', 'connected')

  const verifiedFollowers: Record<string, number> = {}
  for (const c of connections ?? []) {
    const n = (c.snapshot as { followersCount?: number } | null)?.followersCount
    if (typeof n === 'number') verifiedFollowers[c.creator_id] = n
  }

  return (
    <BrowseGrid
      creators={(creators ?? []) as BrowseCreator[]}
      storefrontSlugs={storefrontSlugs}
      verifiedFollowers={verifiedFollowers}
    />
  )
}
