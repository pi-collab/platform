import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { User } from '@supabase/supabase-js'

/**
 * Log an ops action to the ops_events audit table.
 * Uses the admin client (service-role) since RLS denies all access to ops_events.
 *
 * Throws on failure — ops actions must not silently swallow audit failures.
 */
export async function logOpsEvent(
  actor: User,
  action: string,
  targetTable: string,
  targetId: string | null,
  detail: Record<string, unknown> = {},
) {
  const admin = createAdminClient()

  const { error } = await admin.from('ops_events').insert({
    actor_email: actor.email!,
    actor_auth_id: actor.id,
    action,
    target_table: targetTable,
    target_id: targetId,
    detail,
  })

  if (error) {
    throw new Error(`Ops audit write failed: ${error.message}`)
  }
}
