'use client'

import AddCreatorsModal from '@/components/AddCreatorsModal'
import { addCreatorsToCampaign } from './draft-actions'

/** The campaign's use of the shared picker: adding means addCreatorsToCampaign. */
export default function CampaignAddCreators({ campaignId, creators, existingCreatorIds }: {
  campaignId: string
  creators: { id: string; full_name: string; handle: string | null; profile_photo_url: string | null; niches: string[] | null }[]
  existingCreatorIds: string[]
}) {
  return (
    <AddCreatorsModal
      creators={creators}
      existingCreatorIds={existingCreatorIds}
      title="Add creators to campaign"
      onAdd={async (ids) => {
        const r = await addCreatorsToCampaign(campaignId, ids)
        return { error: (r as { error?: string | null }).error ?? null }
      }}
    />
  )
}
