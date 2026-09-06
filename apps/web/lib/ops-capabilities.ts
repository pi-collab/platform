import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

/**
 * A second, narrower ops role — for the outreach team.
 *
 * ── Why this is a PARALLEL gate and not a flag inside verifyOpsAccess ───────
 * `verifyOpsAccess()` is binary: pass it and you can do all ~20 ops actions,
 * including `deleteCreator`, which hard-deletes the creator, their products,
 * their user row and their Supabase auth account. Approving a brand and
 * destroying a creator are, today, the same permission.
 *
 * So the tempting change — add the outreach emails to OPS_ALLOWED_EMAILS and
 * check the role inside each action — is the dangerous one. It FAILS OPEN: the
 * moment those emails pass the existing gate they hold every capability, and
 * safety then depends on having correctly found and patched every call site.
 * One missed site is an outsider with a delete button.
 *
 * This module inverts that. `verifyOpsAccess()` is left exactly as it was and
 * still means full admin, so all existing actions keep their current gate and
 * cannot regress. Outreach lives in its own env var and holds NOTHING by
 * default. A surface is reachable by outreach only where someone deliberately
 * wrote `requireOps('some.capability')` and added that capability to the set
 * below — which means everything not listed here, including everything built
 * in future, stays admin-only by construction rather than by vigilance.
 *
 * ── The residual risk this does NOT solve ───────────────────────────────────
 * One of the outreach team works at an adjacent company. Scoping keeps them out
 * of commercials, deals, payments and anything destructive. It cannot stop a
 * person whose job is contacting our creators from copying the creator list —
 * that is the job. That risk is handled by contract and by `ops_events` making
 * activity reviewable after the fact, not by this file. Do not mistake the
 * capability set for a solution to it.
 */

export type OpsRole = 'admin' | 'outreach'

export interface OpsActor {
  user: User
  role: OpsRole
  /** Convenience: admins see commercials, outreach does not. */
  canSeeCommercials: boolean
}

export type OpsCapability =
  // Read-only views the outreach team works from.
  | 'brands.read'
  | 'creators.read'
  | 'insights.read'
  // The pipeline board — the ONLY thing this role writes to.
  | 'pipeline.read'
  | 'pipeline.write'
  // The playbook. Read-only for everyone; it is a document, not a control.
  | 'playbook.read'

/**
 * Everything the outreach role can do. Anything absent is admin-only.
 *
 * ── Read-only on the platform, read/write on their own pipeline ─────────────
 * An earlier version also granted `creators.add`, `creators.vet` and
 * `brands.approve`, on the reasoning that onboarding was their job. That is not
 * the shape you want: outreach LOOKS UP brands and creators to do their work and
 * records what happened in the pipeline, but every decision that changes a
 * creator's or brand's standing on the platform stays with a founder.
 *
 * It also removes the awkward middle ground. Vetting sends an approval or
 * rejection email to a real person; approving a brand releases its held deals to
 * creators. Those are consequences you cannot quietly undo, and they were the
 * only outward-facing effects this role could have triggered.
 *
 * So the boundary is now simple enough to hold in your head: THIS ROLE CANNOT
 * CHANGE ANYTHING OUTSIDE pipeline_leads AND pipeline_feedback. If you are
 * adding a capability that breaks that sentence, it probably belongs on the
 * admin gate instead.
 */
const OUTREACH_CAPABILITIES: ReadonlySet<OpsCapability> = new Set<OpsCapability>([
  'brands.read',
  'creators.read',
  'insights.read',
  'pipeline.read',
  'pipeline.write',
  'playbook.read',
])

function emailSet(raw: string | undefined): Set<string> {
  if (!raw) return new Set()
  return new Set(raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))
}

/**
 * Every address holding ANY ops role, as one comma-separated string.
 *
 * ── For ROUTING and the work-email bypass ONLY. Never for authorisation. ────
 * Seven places outside the ops gate read OPS_ALLOWED_EMAILS, and they do two
 * jobs: send an ops person to /ops after sign-in instead of the brand
 * onboarding flow, and let them past the "no free email providers" rule that
 * exists to stop consumer signups posing as brands.
 *
 * Without this the new role would not work at all in practice: an outreach
 * teammate on a gmail address would be REFUSED AT LOGIN by validateWorkEmail
 * long before any ops page could decide what they may do, and if they got in
 * they would land on brand onboarding rather than the console.
 *
 * Widening these two behaviours grants no capability whatsoever — what an ops
 * user may actually DO still comes only from `requireOps`. Keep it that way:
 * if you find yourself reaching for this function to decide whether an action
 * is permitted, you want `requireOps`.
 */
export function opsRoutingEmails(): string {
  return [process.env.OPS_ALLOWED_EMAILS, process.env.OPS_OUTREACH_EMAILS]
    .filter(Boolean)
    .join(',')
}

/** Set form of the above, for the "is this an ops person?" redirect checks. */
export function isOpsRoutingEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return emailSet(opsRoutingEmails()).has(email.trim().toLowerCase())
}

/**
 * Resolve the caller's ops role, or null if they have none.
 *
 * Admin is checked first and wins. Someone listed in both env vars is an
 * admin — the alternative, letting the narrower list downgrade a founder, would
 * silently strip access from whoever added themselves to test the outreach view.
 */
export async function resolveOpsActor(): Promise<OpsActor | null> {
  const admins = emailSet(process.env.OPS_ALLOWED_EMAILS)
  const outreach = emailSet(process.env.OPS_OUTREACH_EMAILS)
  // Both unset means no ops access at all, rather than open access.
  if (admins.size === 0 && outreach.size === 0) return null

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null

  const email = user.email.toLowerCase()
  if (admins.has(email)) return { user, role: 'admin', canSeeCommercials: true }
  if (outreach.has(email)) return { user, role: 'outreach', canSeeCommercials: false }
  return null
}

/**
 * Gate a page or action on one capability. Returns the actor, or null to deny.
 *
 * Admins pass everything. Outreach passes only what is in the set above. The
 * default for an unrecognised role is deny.
 */
export async function requireOps(capability: OpsCapability): Promise<OpsActor | null> {
  const actor = await resolveOpsActor()
  if (!actor) return null
  if (actor.role === 'admin') return actor
  if (actor.role === 'outreach' && OUTREACH_CAPABILITIES.has(capability)) return actor
  return null
}

/** True when the caller holds the capability. For hiding UI, never for gating. */
export function actorCan(actor: OpsActor | null, capability: OpsCapability): boolean {
  if (!actor) return false
  if (actor.role === 'admin') return true
  return OUTREACH_CAPABILITIES.has(capability)
}

/**
 * Strip commercial fields from a brand row for the outreach role.
 *
 * Our per-brand take rate is not something an outreach contractor needs to book
 * a demo, and one of them works at an adjacent company. Redacting at the
 * boundary — rather than hiding the column in JSX — means a future page that
 * renders the row cannot leak it by forgetting.
 */
export function redactBrandCommercials<T extends Record<string, unknown>>(
  row: T,
  actor: OpsActor | null,
): Omit<T, 'platform_fee_percent' | 'fee_mode'> & { platform_fee_percent?: unknown; fee_mode?: unknown } {
  if (actor?.canSeeCommercials) return row
  const { platform_fee_percent: _fee, fee_mode: _mode, ...rest } = row
  return rest
}
