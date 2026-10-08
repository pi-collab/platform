import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * The ONLY way app code reads an Experience's P&L or payout list.
 *
 * Both go through database functions called with the SIGNED-IN USER'S session
 * (createClient, never createAdminClient). The functions check that user's
 * staff_access flag in Postgres:
 *   experience_pnl      → experiences_financial  (opt-in per person)
 *   experience_payouts  → experiences_operational (or financial)
 * A refused caller gets an error, not an empty P&L. Called with the service
 * role there is no user, so the database refuses: no admin-client code path
 * can fetch margin for display. scripts/check-pnl-isolation.ts enforces that
 * nothing else in the app reads these figures.
 */

export interface ExperiencePnlLeg {
  deal_id: string; creator_id: string; full_name: string | null; deal_status: string
  platform_track: string | null; platform_pct: number; day_rate_paise: number | null; days: number | null
  creator_gross_paise: number; platform_fee_paise: number; creator_net_paise: number
}

/** What experience_pnl() returns (0537). Accepted legs only; revenue = invoiced. */
export interface ExperiencePnl {
  experience_id: string
  source: 'live' | 'snapshot'
  captured_at?: string
  stored_at?: string | null
  stored_margin_paise?: number | null
  brand_revenue_paise: number
  revenue_basis: 'invoiced'
  /** No issued invoice yet: revenue is an honest ₹0 until Phase 4 invoicing. */
  revenue_pending_invoice: boolean
  invoices_counted: number
  brand_received_paise: number
  /** Context only, never revenue. */
  brand_agreed_paise: number | null
  creator_gross_total_paise: number
  creator_net_total_paise: number
  guapd_costs_total_paise: number
  costs_by_category: { category: string; total_paise: number }[]
  subtotal_paise: number
  platform_fee_kept_paise: number
  guapd_margin_paise: number
  legs_counted: number
  legs_awaiting: number
  awaiting_net_paise: number
  legs_declined: number
  legs_pending: number
  per_leg: ExperiencePnlLeg[]
}

export async function getExperiencePnl(experienceId: string): Promise<{ ok: true; pnl: ExperiencePnl } | { ok: false; error: string }> {
  const { data, error } = await createClient().rpc('experience_pnl', { p_experience_id: experienceId })
  if (error) return { ok: false, error: error.code === '42501' ? 'You do not have financial access to this Experience.' : error.message }
  return { ok: true, pnl: data as ExperiencePnl }
}

export interface ExperiencePayoutRow {
  id: string; vendor_name: string; deal_id: string | null; reason: string
  amount_paise: number; tds_paise: number; net_amount_paise: number
  status: string; external_ref: string | null; approved_at: string | null; paid_at: string | null
}

export async function getExperiencePayouts(experienceId: string): Promise<{ ok: true; payouts: ExperiencePayoutRow[] } | { ok: false; error: string }> {
  const { data, error } = await createClient().rpc('experience_payouts', { p_experience_id: experienceId })
  if (error) return { ok: false, error: error.code === '42501' ? 'You do not have operational access to this Experience.' : error.message }
  return { ok: true, payouts: (data ?? []) as ExperiencePayoutRow[] }
}

/**
 * Whether to RENDER the P&L section for this user. The database decides, with
 * the user's own session. Rendering only: the figures still come solely from
 * experience_pnl(), which checks again.
 */
export async function canSeePnl(): Promise<boolean> {
  const { data, error } = await createClient().rpc('has_experience_access', { p_kind: 'financial' })
  return !error && data === true
}

