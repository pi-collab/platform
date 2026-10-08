import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { creatorLegBrandLabel } from '@/lib/creator-leg-money'

/**
 * Creator lists (deals, dashboard, inbox, payments) read deals.price_paise and
 * the joined brand. On a Guapd Experience creator leg those are wrong by
 * design: price_paise is NULL (a leg's money lives in its own frozen terms)
 * and the brand is the Guapd house brand. This overlays, for leg rows only:
 *   price_paise → the leg's frozen NET: what the creator takes home. Lists
 *                 call this figure what they "receive" and sum it as
 *                 earnings, so the gross (before Guapd's fee) would overstate
 *                 it; the deal page shows the full gross → fee → net;
 *   brands      → "<Experience brand> · Managed by Guapd", no logo (a creator
 *                 cannot read the Experience brand's row, by design).
 * Read with the CREATOR's session: experience_creator_terms RLS returns only
 * their own rows, so nothing here can show another creator's figures.
 * Non-leg rows are returned untouched.
 */
type Row = { id: string; price_paise?: number | null; leg_role?: string | null; experience_brand_name?: string | null; brands?: unknown }

export async function overlayCreatorLegs<T extends Row>(supabase: SupabaseClient, rows: T[]): Promise<T[]> {
  const legIds = rows.filter((r) => r.leg_role === 'creator_leg').map((r) => r.id)
  if (legIds.length === 0) return rows
  const { data } = await supabase.from('experience_creator_terms').select('deal_id, creator_net_paise').in('deal_id', legIds)
  const net = new Map((data ?? []).map((t: { deal_id: string; creator_net_paise: number }) => [t.deal_id, Number(t.creator_net_paise)]))
  return rows.map((r) => r.leg_role !== 'creator_leg' ? r : {
    ...r,
    price_paise: net.get(r.id) ?? null,
    brands: { name: creatorLegBrandLabel(r.experience_brand_name), logo_url: null },
  })
}
