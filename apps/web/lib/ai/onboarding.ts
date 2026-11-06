import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Guapd AI onboarding state per brand USER (0590), so the sparkle-icon
 * highlight and the intro show once per person, on any device.
 */
export interface AiOnboarding { highlightDone: boolean; introSeen: boolean }

export async function getAiOnboarding(userId: string): Promise<AiOnboarding> {
  const { data } = await createAdminClient().from('brand_user_ai_onboarding').select('highlight_done_at, intro_seen_at').eq('user_id', userId).maybeSingle()
  return { highlightDone: !!data?.highlight_done_at, introSeen: !!data?.intro_seen_at }
}

/** Mark the highlight done and/or the intro seen. Never clears either. */
export async function markAiOnboarding(userId: string, what: { highlight?: boolean; intro?: boolean }): Promise<void> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data } = await admin.from('brand_user_ai_onboarding').select('highlight_done_at, intro_seen_at').eq('user_id', userId).maybeSingle()
  const row = {
    user_id: userId,
    highlight_done_at: data?.highlight_done_at ?? (what.highlight || what.intro ? now : null),
    intro_seen_at: data?.intro_seen_at ?? (what.intro ? now : null),
    updated_at: now,
  }
  const { error } = await admin.from('brand_user_ai_onboarding').upsert(row, { onConflict: 'user_id' })
  if (error) console.error(`[ai-onboarding] save failed user=${userId}: ${error.message}`)
}
