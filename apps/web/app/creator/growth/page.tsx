import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCreator } from '@/lib/creator-auth'
import GrowthHome from './GrowthHome'

export const dynamic = 'force-dynamic'

/**
 * The Guapd Growth holding page.
 *
 * Reached only by a creator whose vetting_status is 'growth' — the creator
 * layout routes them here before it reaches the rejection branch, so a Growth
 * creator never meets the appeal box. Anyone else who types the URL is sent
 * back to their own screen rather than shown a page about a track they are not
 * on.
 */
export default async function GrowthPage() {
  const ctx = await verifyCreator()
  const admin = createAdminClient()

  const [{ data: creator }, { data: quiz }] = await Promise.all([
    admin.from('creators')
      .select('full_name, vetting_status, phone, handle, social_accounts, profile_photo_url')
      .eq('id', ctx.creatorId).maybeSingle(),
    // Row presence IS the show-once gate. No separate completion flag to fall
    // out of step with the answers it claims to describe.
    admin.from('creator_growth_quiz_responses').select('id').eq('creator_id', ctx.creatorId).maybeSingle(),
  ])

  if (creator?.vetting_status !== 'growth') redirect('/creator/dashboard')

  return (
    <GrowthHome
      quizDone={Boolean(quiz)}
      profile={{
        fullName: creator.full_name ?? '',
        phone: creator.phone ?? null,
        photoUrl: creator.profile_photo_url ?? null,
        channels: ((creator.social_accounts ?? []) as Array<{ platform?: string; handle?: string }>)
          .filter(a => a?.handle)
          .map(a => ({ platform: String(a.platform ?? ''), handle: String(a.handle ?? '') })),
      }}
    />
  )
}
