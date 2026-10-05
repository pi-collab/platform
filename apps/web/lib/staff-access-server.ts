import 'server-only'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { logOpsEvent } from '@/lib/ops-audit'

/**
 * Grant or revoke a team member's Experience access. ADMIN ONLY: callers must
 * have passed verifyOpsAccess(). Writes ops_events with before/after; a failed
 * audit fails the change.
 *
 * Financial access (the P&L) is opt-in per person and never implied by being
 * an admin or an operational manager.
 */
export async function setStaffAccess(
  admin: SupabaseClient,
  actor: User,
  userId: string,
  next: { operational: boolean; financial: boolean },
): Promise<void> {
  const { data: before } = await admin.from('staff_access')
    .select('experiences_operational, experiences_financial').eq('user_id', userId).maybeSingle()
  const { data: grantor } = await admin.from('users').select('id').eq('auth_id', actor.id).maybeSingle()

  const { error } = await admin.from('staff_access').upsert({
    user_id: userId,
    experiences_operational: next.operational,
    experiences_financial: next.financial,
    granted_by: (grantor as { id: string } | null)?.id ?? null,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(`Could not set access: ${error.message}`)

  await logOpsEvent(actor, 'staff_access.set', 'staff_access', userId, {
    operational_before: (before as any)?.experiences_operational ?? false,
    financial_before: (before as any)?.experiences_financial ?? false,
    operational_after: next.operational,
    financial_after: next.financial,
  })
}
