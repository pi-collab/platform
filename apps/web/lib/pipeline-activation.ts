import 'server-only'

/**
 * The queries behind the activation checklist.
 *
 * Split from lib/pipeline.ts because that file holds the stage vocabulary the
 * client board renders, and a server-only marker there would have meant keeping
 * a second copy of the stage list for the client. These functions take the admin
 * client as an ARGUMENT rather than importing it, so this module never reaches
 * for the service key itself.
 */

import type { Activation } from './pipeline'

type AdminClient = {
  from: (table: string) => {
    select: (cols: string, opts?: Record<string, unknown>) => any
  }
}

/**
 * Batch-compute activation for every linked creator lead.
 *
 * Four queries total regardless of how many leads there are — the board shows
 * a page of rows and a per-row query would be a request storm on a table the
 * outreach team refreshes all day.
 */
export async function activationForCreators(
  admin: AdminClient,
  creatorIds: string[],
): Promise<Map<string, Activation>> {
  const out = new Map<string, Activation>()
  if (creatorIds.length === 0) return out

  const [creators, storefronts, deals] = await Promise.all([
    admin.from('creators')
      .select('id, vetting_status, social_accounts')
      .in('id', creatorIds),
    admin.from('creator_storefronts')
      .select('creator_id, is_published')
      .in('creator_id', creatorIds),
    admin.from('deals')
      .select('creator_id')
      .in('creator_id', creatorIds),
  ])

  const published = new Set(
    ((storefronts.data ?? []) as { creator_id: string; is_published: boolean }[])
      .filter((s) => s.is_published)
      .map((s) => s.creator_id),
  )
  const hasDeal = new Set(
    ((deals.data ?? []) as { creator_id: string }[]).map((d) => d.creator_id),
  )

  for (const c of (creators.data ?? []) as { id: string; vetting_status: string; social_accounts: unknown }[]) {
    out.set(c.id, {
      vetted: c.vetting_status === 'deals_approved',
      storefrontLive: published.has(c.id),
      // "Bio link" means they have pointed their audience at us. The closest
      // thing we hold is a social account with a profile URL recorded.
      bioLink: Array.isArray(c.social_accounts) && c.social_accounts.length > 0,
      firstDeal: hasDeal.has(c.id),
    })
  }
  return out
}

/** Same idea for brands: approved, and whether they have sent a deal. */
export interface BrandActivation {
  approved: boolean
  firstDeal: boolean
}

export const BRAND_ACTIVATION_STEPS: { key: keyof BrandActivation; label: string }[] = [
  { key: 'approved', label: 'Approved' },
  { key: 'firstDeal', label: 'First deal' },
]

export async function activationForBrands(
  admin: AdminClient,
  brandIds: string[],
): Promise<Map<string, BrandActivation>> {
  const out = new Map<string, BrandActivation>()
  if (brandIds.length === 0) return out

  const [brands, deals] = await Promise.all([
    admin.from('brands').select('id, brand_status').in('id', brandIds),
    admin.from('deals').select('brand_id').in('brand_id', brandIds),
  ])

  const hasDeal = new Set(((deals.data ?? []) as { brand_id: string }[]).map((d) => d.brand_id))
  for (const b of (brands.data ?? []) as { id: string; brand_status: string }[]) {
    out.set(b.id, { approved: b.brand_status === 'approved', firstDeal: hasDeal.has(b.id) })
  }
  return out
}

