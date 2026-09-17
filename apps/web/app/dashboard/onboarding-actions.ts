'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyBrand } from '@/lib/brand-auth'
import { BRAND_VALID_CODES } from '@/lib/brand-onboarding'

export type SaveResult = { ok: true } | { ok: false; message: string }

export interface BrandOnboardingAnswers {
  /** One or more codes: this question is multi-select. */
  challenges: string[]
  current_approach: string
  monthly_campaigns: string
  challenge_other?: string
  anything_else?: string
}

// Long enough for a real answer, short enough that the column is not a place to
// paste an essay into.
const MAX_TEXT = 500

export async function saveBrandOnboardingAnswers(input: BrandOnboardingAnswers): Promise<SaveResult> {
  const ctx = await verifyBrand()

  // Validated against the same codes the DB CHECKs enforce. A bad code would be
  // rejected by Postgres anyway; catching it here turns a constraint violation
  // into a sentence someone can act on.
  const challenges = Array.from(new Set((input.challenges ?? []).map(c => c.trim()).filter(Boolean)))
  if (challenges.length === 0) return { ok: false, message: 'Please answer all three questions.' }
  if (challenges.some(c => !BRAND_VALID_CODES.challenges.includes(c))) {
    return { ok: false, message: 'That answer was not one of the options. Please try again.' }
  }

  for (const key of ['current_approach', 'monthly_campaigns'] as const) {
    const value = (input[key] ?? '').trim()
    if (!value) return { ok: false, message: 'Please answer all three questions.' }
    if (!BRAND_VALID_CODES[key].includes(value)) {
      return { ok: false, message: 'That answer was not one of the options. Please try again.' }
    }
  }

  const challengeOther = (input.challenge_other ?? '').trim().slice(0, MAX_TEXT)
  const anythingElse = (input.anything_else ?? '').trim().slice(0, MAX_TEXT)

  // Service role, scoped by hand to the brand verifyBrand resolved from the
  // session. The brand id never comes from the client.
  const admin = createAdminClient()
  const { error } = await admin.from('brand_onboarding_responses').insert({
    brand_id: ctx.brandId,
    answered_by: ctx.profileId,
    challenges,
    // Only stored against the answer it belongs to. Kept otherwise, it would
    // sit there explaining a choice the brand no longer made.
    challenge_other: challenges.includes('other') && challengeOther ? challengeOther : null,
    current_approach: input.current_approach.trim(),
    monthly_campaigns: input.monthly_campaigns.trim(),
    anything_else: anythingElse || null,
  })

  if (error) {
    // A unique violation means the brand already answered: a teammate got there
    // first, or a second tab did. That is the desired end state, so it counts as
    // success rather than blocking someone out of their own dashboard.
    if (error.code === '23505') {
      revalidatePath('/dashboard')
      return { ok: true }
    }
    console.error(`[brand-onboarding] save failed brand=${ctx.brandId}: ${error.message}`)
    return { ok: false, message: 'Could not save that. Please try again.' }
  }

  revalidatePath('/dashboard')
  return { ok: true }
}
