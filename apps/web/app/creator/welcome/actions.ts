'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCreator } from '@/lib/creator-auth'
import { VALID_CODES } from '@/lib/creator-onboarding'

export type SaveResult = { ok: true } | { ok: false; message: string }

export interface OnboardingAnswers {
  /** One or more codes — this question is multi-select. */
  biggest_pains: string[]
  deal_handling: string
  monthly_deals: string
  pain_other?: string
  anything_else?: string
}

// Long enough for a real answer, short enough that the column is not a place to
// paste an essay into.
const MAX_TEXT = 500

export async function saveOnboardingAnswers(input: OnboardingAnswers): Promise<SaveResult> {
  const ctx = await verifyCreator()

  // Validated against the same codes the DB CHECKs enforce. A bad code would be
  // rejected by Postgres anyway; catching it here turns a constraint violation
  // into a sentence the creator can act on.
  const pains = (input.biggest_pains ?? []).map(p => p.trim()).filter(Boolean)
  if (pains.length === 0) return { ok: false, message: 'Please answer all three questions.' }
  // Deduplicated before the length check, so a double-tap cannot push a valid
  // answer past the constraint and fail the whole save.
  const uniquePains = Array.from(new Set(pains))
  if (uniquePains.some(p => !VALID_CODES.biggest_pains.includes(p))) {
    return { ok: false, message: 'That answer was not one of the options. Please try again.' }
  }

  for (const key of ['deal_handling', 'monthly_deals'] as const) {
    const value = (input[key] ?? '').trim()
    if (!value) return { ok: false, message: 'Please answer all three questions.' }
    if (!VALID_CODES[key].includes(value)) {
      return { ok: false, message: 'That answer was not one of the options. Please try again.' }
    }
  }

  const painOther = (input.pain_other ?? '').trim().slice(0, MAX_TEXT)
  const anythingElse = (input.anything_else ?? '').trim().slice(0, MAX_TEXT)

  const admin = createAdminClient()
  const { error } = await admin.from('creator_onboarding_responses').insert({
    creator_id: ctx.creatorId,
    biggest_pains: uniquePains,
    // Only stored against the answer it belongs to. Kept otherwise, it would
    // sit there explaining a choice the creator no longer made.
    pain_other: uniquePains.includes('other') && painOther ? painOther : null,
    deal_handling: input.deal_handling,
    monthly_deals: input.monthly_deals,
    anything_else: anythingElse || null,
  })

  if (error) {
    // A unique violation means they already answered — in another tab, or by
    // double-clicking. That is the desired end state, so treat it as success
    // rather than blocking someone out of their own dashboard.
    if (error.code === '23505') {
      revalidatePath('/creator/dashboard')
      return { ok: true }
    }
    console.error(`[onboarding] save failed creator=${ctx.creatorId}: ${error.message}`)
    return { ok: false, message: 'Could not save that. Please try again.' }
  }

  revalidatePath('/creator/dashboard')
  return { ok: true }
}
