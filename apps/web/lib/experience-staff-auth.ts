import 'server-only'
import type { User } from '@supabase/supabase-js'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { createClient } from '@/lib/supabase/server'

/**
 * The gate for the Guapd Experiences staff console (/experiences-admin) and
 * every action behind it. Two checks, both required:
 *
 *   1. Ops ADMIN (OPS_ALLOWED_EMAILS, verifyOpsAccess). Outreach, including the
 *      contractor, never passes this, whatever their staff_access says.
 *   2. Experience OPERATIONAL access in Postgres (staff_access, 0526), asked
 *      with the user's own session so the database decides, not this file.
 *      Opt-in per person; being an admin does not imply it.
 *
 * Financial access (the P&L) is a separate, later check made by the database
 * function itself (experience_pnl) and is not implied by passing this gate.
 * The console's reads also go through database functions that repeat the
 * operational check (experience_console_list, 0529), so passing this gate in
 * app code is never the only thing standing between a caller and the data.
 *
 * This is the STAFF face only. The future brand-facing view (/experiences)
 * uses verifyBrand and the brand's own RLS, never this gate.
 */
export type ExperienceStaffGate =
  | { ok: true; user: User }
  | { ok: false; reason: 'not_ops' | 'no_operational_access'; user: User | null }

export async function experienceStaffGate(): Promise<ExperienceStaffGate> {
  const user = await verifyOpsAccess()
  if (!user) return { ok: false, reason: 'not_ops', user: null }
  const { data, error } = await createClient().rpc('has_experience_access', { p_kind: 'operational' })
  if (error || data !== true) return { ok: false, reason: 'no_operational_access', user }
  return { ok: true, user }
}
