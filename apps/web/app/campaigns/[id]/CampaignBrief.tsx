'use client'

import BriefEditor, { type BriefEditorAttachment } from '@/components/BriefEditor'
import { removeCampaignBriefAttachment, updateCampaignBrief, uploadCampaignBriefAttachment } from './draft-actions'

/**
 * A campaign's brief: the shared BriefEditor (components/BriefEditor.tsx,
 * also used by the Experiences console since 0546) wired to the campaign's
 * own actions. Behaviour unchanged from before the lift.
 */
export default function CampaignBrief({ campaignId, initialPitch, initialGuidelines, initialAvoid, initialAttachments }: {
  campaignId: string
  initialPitch: string | null
  initialGuidelines: string | null
  initialAvoid: string | null
  initialAttachments: BriefEditorAttachment[]
}) {
  return (
    <BriefEditor
      initialPitch={initialPitch} initialGuidelines={initialGuidelines} initialAvoid={initialAvoid} initialAttachments={initialAttachments}
      actions={{
        save: async (pitch, guidelines, avoid, attachments) => {
          const r = await updateCampaignBrief(campaignId, pitch, guidelines, avoid, attachments)
          return { error: r.error ?? null }
        },
        upload: async (fd) => {
          const r = await uploadCampaignBriefAttachment(campaignId, fd)
          return { attachment: r.attachment ?? null, error: r.error ?? null }
        },
        remove: async (path) => {
          const r = await removeCampaignBriefAttachment(campaignId, path)
          return { error: 'error' in r ? r.error ?? null : null }
        },
      }}
    />
  )
}
