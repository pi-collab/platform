import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The gate: whether to ask a creator the post-approval questions.
 *
 * The questions themselves live in creator-onboarding-labels.ts, which is
 * client-safe. Re-exported here so server callers keep one import.
 */
export { QUESTIONS, VALID_CODES, labelFor } from '@/lib/creator-onboarding-labels'
export type { QuestionKey } from '@/lib/creator-onboarding-labels'

/** Written by vetCreator on approval. Its absence is what spares the existing roster. */
export const QUESTIONS_DUE_EVENT = 'creator.onboarding_questions_due'

export interface OnboardingState {
  /** They were approved after this shipped, so the questions apply to them. */
  due: boolean
  /** A response row exists. */
  answered: boolean
}

/**
 * Whether to show the questionnaire.
 *
 * Gated on an EVENT written at approval time, not merely on "no answers yet".
 * Every creator approved before this existed has no such event, so they go
 * straight to the dashboard rather than being ambushed mid-task by a form —
 * which would also make the answers noisier than they are worth.
 */
export async function onboardingState(creatorId: string): Promise<OnboardingState> {
  const admin = createAdminClient()

  const [dueRow, answerRow] = await Promise.all([
    admin.from('events').select('id')
      .eq('event_type', QUESTIONS_DUE_EVENT)
      .contains('detail', { creator_id: creatorId })
      .limit(1).maybeSingle(),
    admin.from('creator_onboarding_responses').select('id')
      .eq('creator_id', creatorId)
      .limit(1).maybeSingle(),
  ])

  return { due: Boolean(dueRow.data), answered: Boolean(answerRow.data) }
}

/** Shorthand for the two gates: the approval CTA and the dashboard. */
export async function shouldAskOnboarding(creatorId: string): Promise<boolean> {
  const { due, answered } = await onboardingState(creatorId)
  return due && !answered
}
