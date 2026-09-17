import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The gate: whether to ask a brand the onboarding questions.
 *
 * The questions live in brand-onboarding-labels.ts, which is client-safe.
 * Re-exported here so server callers keep one import.
 */
export { BRAND_QUESTIONS, BRAND_VALID_CODES } from '@/lib/brand-onboarding-labels'
export type { BrandQuestionKey } from '@/lib/brand-onboarding-labels'

/**
 * Written when a brand profile is created. Its absence is what spares brands
 * that existed before the questionnaire, until ops backfills the ones to ask.
 *
 * Keyed to profile creation, NOT approval. Approval only gates a brand's first
 * send, and most brands never send, so an approval trigger would ask almost
 * nobody. See migration 0503.
 */
export const BRAND_QUESTIONS_DUE_EVENT = 'brand.onboarding_questions_due'

/**
 * Marks a brand as due. Never throws: it runs at the end of signup, after the
 * brand exists, and a failed marker must not fail a signup that succeeded.
 * The cost of a failure is one brand not being asked, which is logged.
 */
export async function markBrandQuestionsDue(brandId: string): Promise<void> {
  const { error } = await createAdminClient().from('events').insert({
    event_type: BRAND_QUESTIONS_DUE_EVENT,
    detail: { brand_id: brandId },
  })
  if (error) {
    console.error(`[brand-onboarding] could not mark questions due brand=${brandId}: ${error.message}`)
  }
}

/**
 * Whether to show the questionnaire.
 *
 * Due (the event exists) AND unanswered (no row for the brand). Per BRAND, not
 * per member: whichever teammate reaches the dashboard first answers for the
 * brand, and the rest are never asked.
 */
export async function shouldAskBrandOnboarding(brandId: string): Promise<boolean> {
  const admin = createAdminClient()

  const [dueRow, answerRow] = await Promise.all([
    admin.from('events').select('id')
      .eq('event_type', BRAND_QUESTIONS_DUE_EVENT)
      .contains('detail', { brand_id: brandId })
      .limit(1).maybeSingle(),
    admin.from('brand_onboarding_responses').select('id')
      .eq('brand_id', brandId)
      .limit(1).maybeSingle(),
  ])

  return Boolean(dueRow.data) && !answerRow.data
}
