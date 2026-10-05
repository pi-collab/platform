'use server'

import { revalidatePath } from 'next/cache'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { setStaffAccess } from '@/lib/staff-access-server'

function adminEmails(): Set<string> {
  return new Set((process.env.OPS_ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))
}

/**
 * Grant or revoke a person's Guapd Experiences access. Admin only.
 *
 * Only someone on the ops ADMIN list can hold Experience access: the staff
 * console also requires it, so a grant to anyone else would do nothing today
 * and would quietly become live if they were ever added. Refusing it here means
 * outreach (including the contractor) can never be granted access, even by
 * mistake. setStaffAccess writes ops_events with before/after.
 *
 * Financial (the P&L) implies operational in has_experience_access, so it is
 * stored with operational on; turning operational off turns financial off.
 */
export async function setExperienceAccess(userId: string, level: 'none' | 'operational' | 'financial'): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await verifyOpsAccess()
  if (!actor) return { ok: false, error: 'Admin only' }

  const admin = createAdminClient()
  const { data: target } = await admin.from('users').select('id, email').eq('id', userId).maybeSingle()
  if (!target) return { ok: false, error: 'No such user' }
  if (level !== 'none' && !adminEmails().has(String(target.email ?? '').toLowerCase())) {
    return { ok: false, error: 'Only people on the ops admin list can be given Experiences access' }
  }

  try {
    await setStaffAccess(admin, actor, userId, {
      operational: level !== 'none',
      financial: level === 'financial',
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not set access' }
  }
  revalidatePath('/ops/access')
  return { ok: true }
}
