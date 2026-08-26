'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCreator } from '@/lib/creator-auth'
import { codesFor, type GrowthChoiceKey } from '@/lib/growth-quiz-labels'

export type GrowthQuizResult = { ok: true } | { ok: false; message: string }

/**
 * Store a creator's Growth quiz answers.
 *
 * Validated against the same option list the page renders from, so an answer
 * can never be stored that no question offered — a server action is directly
 * callable, and this data is meant to be aggregated later.
 *
 * INSERT only. The table denies UPDATE and DELETE, so this is a snapshot: a
 * creator answers once, and a later change of mind cannot quietly re-bucket
 * numbers someone has already reported on.
 */
export async function saveGrowthQuiz(input: {
  postingFrequency: string
  growthGoal: string
  niche: string
  nicheOther?: string
  anythingElse?: string
}): Promise<GrowthQuizResult> {
  const ctx = await verifyCreator()

  const checks: [GrowthChoiceKey, string][] = [
    ['posting_frequency', input.postingFrequency],
    ['growth_goal', input.growthGoal],
    ['niche', input.niche],
  ]
  for (const [key, value] of checks) {
    if (!codesFor(key).includes(value)) {
      return { ok: false, message: 'Please answer all three questions.' }
    }
  }

  const other = String(input.nicheOther ?? '').trim().slice(0, 120)
  // Optional and free-form, so it is only length-capped. Nothing reads it as a
  // code, so there is no option list to validate it against.
  const note = String(input.anythingElse ?? '').trim().slice(0, 500)

  const admin = createAdminClient()
  const { error } = await admin.from('creator_growth_quiz_responses').insert({
    creator_id: ctx.creatorId,
    posting_frequency: input.postingFrequency,
    growth_goal: input.growthGoal,
    niche: input.niche,
    anything_else: note || null,
    // Only meaningful alongside the 'other' code; stored null otherwise so the
    // column never holds a stray note against a named niche.
    niche_other: input.niche === 'other' && other ? other : null,
  })

  if (error) {
    // The unique index on creator_id is the show-once gate. A second submit is
    // a double-tap or a stale tab, not a failure worth alarming anyone about.
    if (error.code === '23505') {
      revalidatePath('/creator/growth')
      return { ok: true }
    }
    console.error('[growth-quiz] save failed:', error.message)
    return { ok: false, message: 'Could not save your answers. Please try again.' }
  }

  revalidatePath('/creator/growth')
  return { ok: true }
}
