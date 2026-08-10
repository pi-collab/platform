import { createClient } from '@/lib/supabase/server'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import { notFound } from 'next/navigation'
import DealAnalyticsClient, { generateMockAnalyticsData, generateMockCampaignBreakdowns } from '@/app/deals/[id]/analytics/DealAnalyticsClient'

export default async function CampaignAnalyticsPage({ params }: { params: { id: string } }) {
  const brand = await verifyApprovedBrand()
  const supabase = createClient()

  // Fetch campaign
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .select('id, name, description, status, budget_paise, created_at, updated_at')
    .eq('id', params.id)
    .maybeSingle()

  if (campErr || !campaign) notFound()

  // Fetch all deals belonging to this campaign, with creator info
  const { data: deals } = await supabase
    .from('deals')
    .select('id, deal_ref, title, deliverables, price_paise, status, is_posted, posted_url, posted_at, created_at, creators(id, full_name, handle, profile_photo_url)')
    .eq('campaign_id', params.id)
    .order('created_at', { ascending: false })

  const allDeals = deals ?? []

  // Use the first deal's creator as the primary display or pick a representative
  const firstDeal = allDeals[0]
  const rawCreator = firstDeal ? (firstDeal.creators as unknown) : null
  const creator = rawCreator
    ? (Array.isArray(rawCreator)
      ? (rawCreator[0] as { id: string; full_name: string; handle: string | null; profile_photo_url: string | null } | undefined) ?? null
      : (rawCreator as { id: string; full_name: string; handle: string | null; profile_photo_url: string | null } | null))
    : null

  // Gather deliverable items from all deals in this campaign
  const dealIds = allDeals.map((d) => d.id)
  let deliverableLabels: { label: string; platform: string }[] = []

  if (dealIds.length > 0) {
    const { data: items } = await supabase
      .from('deal_deliverable_items')
      .select('id, label, platform, deal_id')
      .in('deal_id', dealIds)
      .order('created_at', { ascending: true })

    deliverableLabels = (items ?? []).map((item) => ({
      label: item.label || 'Deliverable',
      platform: item.platform || 'instagram',
    }))
  }

  // Fallback: parse deliverables text from deals
  if (deliverableLabels.length === 0) {
    for (const d of allDeals) {
      if (d.deliverables) {
        const parts = d.deliverables.split(',').map((s: string) => s.trim()).filter(Boolean)
        for (const part of parts) {
          deliverableLabels.push({ label: part, platform: 'instagram' })
        }
      }
    }
  }

  if (deliverableLabels.length === 0) {
    deliverableLabels.push({ label: 'Instagram Reel', platform: 'instagram' })
    deliverableLabels.push({ label: 'Instagram Story', platform: 'instagram' })
  }

  // Deduplicate to keep at most one reel + one story for the summary view
  const seen = new Set<string>()
  const uniqueLabels = deliverableLabels.filter((d) => {
    const key = d.label.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 4) // cap at 4 for readability

  /*
   * PLACEHOLDER: Real analytics data will come from the Meta Graph API.
   * See docs/roadmap.md "Meta APP + REVIEW" section.
   * Campaign analytics aggregates across all deals in the campaign.
   */
  const mockData = generateMockAnalyticsData({
    dealId: firstDeal?.id ?? params.id,
    dealRef: firstDeal?.deal_ref ?? null,
    brandName: brand.brandName,
    creatorName: creator?.full_name ?? `${allDeals.length} creators`,
    creatorId: creator?.id ?? '',
    creatorAvatarUrl: creator?.profile_photo_url ?? null,
    postedDate: firstDeal?.posted_at ?? firstDeal?.created_at ?? campaign.created_at,
    postedUrl: firstDeal?.posted_url ?? null,
    deliverableLabels: uniqueLabels,
  })

  const mockBreakdowns = generateMockCampaignBreakdowns()

  return (
    <DealAnalyticsClient
      {...mockData}
      isCampaign={true}
      campaignId={campaign.id}
      creatorBreakdowns={mockBreakdowns}
    />
  )
}
