import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { trackForCreator } from '@/lib/deal-track'
import { creatorLegTerms, type CreatorLegTerms } from '@/lib/experience-money'

/**
 * Server side of the two-leg money model. Service role, explicit columns,
 * never select('*') (the service role bypasses the column grants).
 *
 * Only Leg 2 is written here: lockCreatorLegTerms reads the creator and their
 * track and writes their terms. Brand invoices (Leg 1) are drafted and issued
 * only by the access-checked experience_console_invoice_* database functions
 * (0540), which never read creator terms, so a creator's rate cannot reach a
 * brand invoice and a brand price cannot reach a creator's pay.
 */

// ── Leg 2: freeze a creator's terms when sent/agreed ────────────────────────

export interface LockTermsInput {
  dealId: string
  experienceId: string
  creatorId: string
  dayRatePaise?: number
  days?: number
  grossPaise?: number
}

/**
 * Compute and LOCK a creator leg's terms. The platform % comes from the
 * creator's track as it is NOW (send time) and is snapshotted; a later change
 * of track or rate never moves a locked leg (DB trigger t_ect_freeze).
 */
export async function lockCreatorLegTerms(admin: SupabaseClient, input: LockTermsInput): Promise<CreatorLegTerms> {
  const track = await trackForCreator(admin, input.creatorId)
  const terms = creatorLegTerms({ dayRatePaise: input.dayRatePaise, days: input.days, grossPaise: input.grossPaise, track })

  const { data: existing } = await admin.from('experience_creator_terms')
    .select('deal_id, locked_at').eq('deal_id', input.dealId).maybeSingle()
  if ((existing as { locked_at: string | null } | null)?.locked_at) {
    throw new Error('These creator terms are already agreed and locked')
  }

  const row = {
    deal_id: input.dealId, experience_id: input.experienceId, creator_id: input.creatorId,
    day_rate_paise: input.dayRatePaise ?? null, days: input.days ?? null,
    creator_gross_paise: terms.creatorGrossPaise, platform_track: terms.platformTrack,
    platform_pct: terms.platformPct, creator_net_paise: terms.creatorNetPaise,
    locked_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  const { error } = existing
    ? await admin.from('experience_creator_terms').update(row).eq('deal_id', input.dealId)
    : await admin.from('experience_creator_terms').insert(row)
  if (error) throw new Error(`Could not lock creator terms: ${error.message}`)
  return terms
}

// ── P&L: NOT here ──────────────────────────────────────────────────────────
// The P&L is served ONLY by the database function experience_pnl() (migration
// 0526), called with the user's own session, which checks their financial
// access in Postgres. A service-role P&L read here would bypass that, so none
// exists. See lib/experience-pnl-server.ts and scripts/check-pnl-isolation.ts.
