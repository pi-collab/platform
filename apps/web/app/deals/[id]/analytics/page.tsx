import { createClient } from '@/lib/supabase/server'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import { notFound } from 'next/navigation'
import DealAnalyticsClient, { generateMockAnalyticsData } from './DealAnalyticsClient'

export default async function DealAnalyticsPage({ params }: { params: { id: string } }) {
  const brand = await verifyApprovedBrand()
  const supabase = createClient()

  // Fetch deal with creator info
  const { data: deal, error } = await supabase
    .from('deals')
    .select('id, deal_ref, title, deliverables, price_paise, status, is_posted, posted_url, posted_at, created_at, campaign_id, creators(id, full_name, handle, profile_photo_url)')
    .eq('id', params.id)
    .maybeSingle()

  if (error || !deal) notFound()

  // Extract creator from the join (can be array or object depending on relationship)
  const rawCreator = deal.creators as unknown
  const creator = Array.isArray(rawCreator)
    ? (rawCreator[0] as { id: string; full_name: string; handle: string | null; profile_photo_url: string | null } | undefined) ?? null
    : (rawCreator as { id: string; full_name: string; handle: string | null; profile_photo_url: string | null } | null)

  // Fetch deliverable items for this deal
  const { data: items } = await supabase
    .from('deal_deliverable_items')
    .select('id, label, platform, item_status, external_url, submitted_at, approved_at')
    .eq('deal_id', params.id)
    .order('created_at', { ascending: true })

  // Build deliverable labels from items (or fall back to deal.deliverables text)
  const deliverableLabels = (items ?? []).map((item) => ({
    label: item.label || 'Deliverable',
    platform: item.platform || 'instagram',
  }))

  if (deliverableLabels.length === 0 && deal.deliverables) {
    // Parse the deliverables text field as a fallback
    const parts = deal.deliverables.split(',').map((s: string) => s.trim()).filter(Boolean)
    for (const part of parts) {
      deliverableLabels.push({ label: part, platform: 'instagram' })
    }
  }

  // Ensure we have at least one item for the mock
  if (deliverableLabels.length === 0) {
    deliverableLabels.push({ label: 'Instagram Reel', platform: 'instagram' })
    deliverableLabels.push({ label: 'Instagram Story', platform: 'instagram' })
  }

  /*
   * PLACEHOLDER: Real analytics data will come from the Meta Graph API
   * (instagram_basic + instagram_manage_insights permissions) once:
   *   1. Meta app review is approved
   *   2. Creators/brands connect their IG accounts via OAuth
   * See roadmap: docs/roadmap.md "Meta APP + REVIEW" section.
   *
   * For now, generate mock data so the page structure is visible.
   */
  const mockData = generateMockAnalyticsData({
    dealId: deal.id,
    dealRef: deal.deal_ref,
    brandName: brand.brandName,
    creatorName: creator?.full_name ?? 'Creator',
    creatorId: creator?.id ?? '',
    creatorAvatarUrl: creator?.profile_photo_url ?? null,
    postedDate: deal.posted_at ?? deal.created_at,
    postedUrl: deal.posted_url ?? null,
    deliverableLabels,
  })

  return (
    <DealAnalyticsClient
      {...mockData}
      isCampaign={false}
    />
  )
}
