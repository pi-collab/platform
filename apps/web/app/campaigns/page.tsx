import { createClient } from '@/lib/supabase/server'
import { verifyBrand } from '@/lib/brand-auth'
import Link from 'next/link'
import CampaignsClient from './CampaignsClient'
import { hasEntitlement } from '@/lib/entitlements'
import type { Track } from '@/lib/track'

const PAID_STATUSES = new Set(['paid', 'complete'])

export default async function CampaignsPage() {
  const brand = await verifyBrand()
  const supabase = createClient()

  /* Whether to OFFER a Growth campaign. The server checks again in
     createCampaign — this only decides whether the choice is shown, because
     offering an option and then refusing it is worse than not offering it. */
  const canGrowth = await hasEntitlement(brand.brandId, 'growth_campaigns')

  const [{ data: campaigns }, { data: deals }, { data: invoices }] = await Promise.all([
    supabase
      .from('campaigns')
      .select('id, name, description, status, created_at, track, min_metric, min_creators, min_value_paise')
      .order('created_at', { ascending: false }),
    supabase
      .from('deals')
      .select('id, campaign_id, status, price_paise, is_posted')
      .not('campaign_id', 'is', null),
    supabase
      .from('invoices')
      .select('deal_id, status, brand_pays_paise'),
  ])

  // Index invoices by deal_id
  const invoiceMap = new Map<string, { status: string; brand_pays_paise: number }>()
  for (const inv of invoices ?? []) {
    invoiceMap.set(inv.deal_id, { status: inv.status, brand_pays_paise: inv.brand_pays_paise })
  }

  // Build rollup per campaign
  const rollupMap = new Map<string, { totalDeals: number; committedPaise: number; paidPaise: number }>()
  for (const d of deals ?? []) {
    if (!d.campaign_id) continue
    const r = rollupMap.get(d.campaign_id) ?? { totalDeals: 0, committedPaise: 0, paidPaise: 0 }
    r.totalDeals++
    if (!['declined', 'cancelled'].includes(d.status)) {
      r.committedPaise += d.price_paise ?? 0
    }
    const inv = invoiceMap.get(d.id)
    if (inv && inv.status === 'paid') {
      r.paidPaise += inv.brand_pays_paise ?? 0
    }
    rollupMap.set(d.campaign_id, r)
  }

  const all = (campaigns ?? []).map((c) => {
    const r = rollupMap.get(c.id) ?? { totalDeals: 0, committedPaise: 0, paidPaise: 0 }
    return {
      id: c.id,
      name: c.name,
      description: c.description || '',
      status: c.status as 'active' | 'completed' | 'archived',
      createdAt: c.created_at,
      track: (c.track as Track) ?? 'deals',
      totalDeals: r.totalDeals,
      committedPaise: r.committedPaise,
      paidPaise: r.paidPaise,
    }
  })

  return <CampaignsClient campaigns={all} canGrowth={canGrowth} />
}
