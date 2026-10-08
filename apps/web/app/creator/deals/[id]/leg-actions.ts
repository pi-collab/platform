'use server'

import { revalidatePath } from 'next/cache'
import { verifyCreator } from '@/lib/creator-auth'
import { createClient } from '@/lib/supabase/server'
import { notifyStaffLegAnswer } from '@/lib/experience-leg-notify'

/**
 * The creator's one action on a Guapd Experience creator leg: accept or
 * decline. creator_leg_respond (0534) runs with the creator's own session and
 * checks in Postgres that the leg is theirs and still open; every other write
 * to a leg is refused. The house brand has no members, so the Experiences
 * staff are told instead (in-app).
 */
export async function respondToLeg(dealId: string, accept: boolean, reason?: string): Promise<{ ok: true } | { ok: false; message: string }> {
  await verifyCreator(`/creator/deals/${dealId}`)
  if (typeof dealId !== 'string' || !/^[0-9a-f-]{36}$/i.test(dealId) || typeof accept !== 'boolean') {
    return { ok: false, message: 'Something went wrong. Reload and try again.' }
  }
  const { error } = await createClient().rpc('creator_leg_respond', {
    p_deal_id: dealId, p_accept: accept, p_reason: typeof reason === 'string' ? reason.slice(0, 500) : null,
  })
  if (error) {
    return { ok: false, message: /already answered/i.test(error.message) ? 'You have already answered this offer.' : 'Could not save your answer. Please try again.' }
  }
  await notifyStaffLegAnswer(dealId, accept)
  revalidatePath(`/creator/deals/${dealId}`)
  revalidatePath('/creator/deals')
  revalidatePath('/creator/dashboard')
  return { ok: true }
}
