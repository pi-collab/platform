import 'server-only'
import type { User } from '@supabase/supabase-js'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { createClient } from '@/lib/supabase/server'

/**
 * The gate for every Experience ops screen. Two checks, both required:
 *
 *   1. Ops ADMIN (OPS_ALLOWED_EMAILS, verifyOpsAccess). Outreach, including the
 *      contractor, never passes this, whatever their staff_access says.
 *   2. Experience OPERATIONAL access in Postgres (staff_access, 0526), asked
 *      with the user's own session so the database decides, not this file.
 *      Opt-in per person; being an admin does not imply it.
 *
 * Financial access (the P&L) is a separate, later check made by the database
 * function itself (experience_pnl) and is not implied by passing this gate.
 */
export type ExperienceOpsGate =
  | { ok: true; user: User }
  | { ok: false; reason: 'not_ops' | 'no_operational_access'; user: User | null }

export async function experienceOpsGate(): Promise<ExperienceOpsGate> {
  const user = await verifyOpsAccess()
  if (!user) return { ok: false, reason: 'not_ops', user: null }
  const { data, error } = await createClient().rpc('has_experience_access', { p_kind: 'operational' })
  if (error || data !== true) return { ok: false, reason: 'no_operational_access', user }
  return { ok: true, user }
}
