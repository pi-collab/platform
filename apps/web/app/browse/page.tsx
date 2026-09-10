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
    .select('creator_id, slug, categories')
    .eq('is_published', true)

  const storefrontSlugs: Record<string, string> = {}
  // Niches are entered in the STOREFRONT editor, which writes
  // creator_storefronts.categories. This page filtered on creators.niches,
  // which nothing populates: on production every vetted creator had an empty
  // niches array while 24 had categories, so the niche filter had nothing to
  // offer and looked broken. Merged, with categories first, because that is the
  // field a creator actually fills in.
  const storefrontCategories: Record<string, string[]> = {}
  for (const s of storefronts ?? []) {
    storefrontSlugs[s.creator_id] = s.slug
    const cats = Array.isArray(s.categories) ? (s.categories as unknown[]).filter((c): c is string => typeof c === 'string') : []
    if (cats.length) storefrontCategories[s.creator_id] = cats
  }

  /* Starting rates, from the packages a creator actually publishes.
   *
   * This page read creators.rate_card, a jsonb map, while the storefront editor
   * writes creator_products rows. They are separate stores, and nothing keeps
   * them in step - so a creator with packages published and priced showed "-"
   * for Starting rate, and the rate FILTER dropped them entirely, because a
   * null rate fails every band.
   *
   * Exactly the shape of the niches bug above: the page read a column nothing
   * populates while the field the creator fills sat in another table.
   *
   * on_request lines are excluded rather than counted as zero: a starting rate
   * of zero is a quote, and it is one nobody gave. rate_card is kept as the
   * fallback for rows that predate the products table.
   */
  const { data: products } = await admin
    .from('creator_products')
    .select('creator_id, price_paise, price_mode, display_price, is_active')

  const startingRates: Record<string, number> = {}
  for (const p of products ?? []) {
    if (!p.is_active) continue
    if (p.display_price === false) continue
    if (p.price_mode === 'on_request') continue
    const paise = p.price_paise ?? 0
    if (!(paise > 0)) continue
    const cur = startingRates[p.creator_id]
    if (cur === undefined || paise < cur) startingRates[p.creator_id] = paise
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
      creators={((creators ?? []) as BrowseCreator[]).map((c) => ({
        ...c,
        niches: storefrontCategories[c.id] ?? c.niches ?? [],
      }))}
      storefrontSlugs={storefrontSlugs}
      verifiedFollowers={verifiedFollowers}
      startingRates={startingRates}
    />
  )
}
