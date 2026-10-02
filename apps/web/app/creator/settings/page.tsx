import { creatorGrowthState } from '@/lib/creator-growth-state'
import { Suspense } from 'react'
import { readCreatorLocation } from '@/lib/creator-location-server'
import { getConnection } from '@/lib/instagram-sync'
import { verifyCreator } from '@/lib/creator-auth'
import { createClient } from '@/lib/supabase/server'
import { displayEmail } from '@/lib/synthetic-email'
import { createAdminClient } from '@/lib/supabase/admin'
import CreatorSettingsClient from './CreatorSettingsClient'

export default async function CreatorSettingsPage() {
  const ctx = await verifyCreator()
  const supabase = createClient()
  const admin = createAdminClient()

  // Fetch user profile + preferences
  const { data: user } = await supabase
    .from('users')
    .select('id, full_name, email, phone, preferences')
    .eq('id', ctx.profileId)
    .single()

  // Get auth provider info
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const authProvider = authUser?.app_metadata?.provider || 'phone'
  const authEmail = authUser?.email ?? user?.email ?? ''

  // Fetch creator details
  const { data: creator } = await admin
    .from('creators')
    .select('id, full_name, handle, bio, niche, niches, social_accounts, profile_photo_url, location, primary_platform, contact_email')
    .eq('id', ctx.creatorId)
    .single()

  const instagramConnection = await getConnection(ctx.creatorId)
  // Separate read: see lib/creator-location-server.
  const place = await readCreatorLocation(ctx.creatorId)
  const growth = await creatorGrowthState(ctx.creatorId)
  const socials = (creator?.social_accounts ?? []) as Array<{ platform: string; handle: string }>
  const prefs = (user?.preferences ?? {}) as Record<string, string>

  return (
    <Suspense><CreatorSettingsClient
      creatorName={creator?.full_name ?? ctx.creatorName}
      creatorHandle={(creator as Record<string, unknown>)?.handle as string ?? ''}
      creatorBio={(creator as Record<string, unknown>)?.bio as string ?? ''}
      creatorNiches={
        // niches is the list every other screen writes; niche is the legacy
        // single value this page used to write on its own. Fall back to it so
        // a creator who only ever set it here does not open to a blank field.
        ((creator as Record<string, unknown>)?.niches as string[] | null)?.length
          ? (creator as Record<string, unknown>).niches as string[]
          : ((creator as Record<string, unknown>)?.niche ? [(creator as Record<string, unknown>).niche as string] : [])
      }
      creatorPlace={place}
      creatorPrimaryPlatform={(creator as Record<string, unknown>)?.primary_platform as string ?? 'Instagram'}
      creatorContactEmail={(creator as Record<string, unknown>)?.contact_email as string ?? displayEmail(user?.email) ?? ''}
      creatorSocials={socials}
      instagramConnection={instagramConnection}
      isGrowth={growth.isGrowth}
      creatorPhotoUrl={(creator as Record<string, unknown>)?.profile_photo_url as string ?? null}
      userEmail={displayEmail(user?.email) ?? ''}
      userPhone={user?.phone ?? ''}
      userLanguage={prefs.language ?? 'English'}
      userTimezone={prefs.timezone ?? 'IST (GMT+5:30)'}
      authProvider={authProvider}
      authEmail={authEmail}
    /></Suspense>
  )
}
