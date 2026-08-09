import { Suspense } from 'react'
import { verifyCreator } from '@/lib/creator-auth'
import { createClient } from '@/lib/supabase/server'
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
    .select('id, full_name, handle, bio, niche, social_accounts, profile_photo_url, location, primary_platform, contact_email')
    .eq('id', ctx.creatorId)
    .single()

  const socials = (creator?.social_accounts ?? []) as Array<{ platform: string; handle: string }>
  const prefs = (user?.preferences ?? {}) as Record<string, string>

  return (
    <Suspense><CreatorSettingsClient
      creatorName={creator?.full_name ?? ctx.creatorName}
      creatorHandle={(creator as Record<string, unknown>)?.handle as string ?? ''}
      creatorBio={(creator as Record<string, unknown>)?.bio as string ?? ''}
      creatorNiche={(creator as Record<string, unknown>)?.niche as string ?? ''}
      creatorLocation={(creator as Record<string, unknown>)?.location as string ?? ''}
      creatorPrimaryPlatform={(creator as Record<string, unknown>)?.primary_platform as string ?? 'Instagram'}
      creatorContactEmail={(creator as Record<string, unknown>)?.contact_email as string ?? user?.email ?? ''}
      creatorSocials={socials}
      userEmail={user?.email ?? ''}
      userPhone={user?.phone ?? ''}
      userLanguage={prefs.language ?? 'English'}
      userTimezone={prefs.timezone ?? 'IST (GMT+5:30)'}
      authProvider={authProvider}
      authEmail={authEmail}
    /></Suspense>
  )
}
