import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The billing ledger. One row per billable unit, written when it is incurred.
 *
 * ── Why a write and not a COUNT ─────────────────────────────────────────────
 * "How many units did this brand use in September" could be counted over deals
 * and campaigns. It should not be. Rows move — a deal is cancelled, a campaign
 * archived, a creator removed — and a count taken in October over rows that
 * have changed is not the number the brand was billed. A billing dispute is
 * precisely when that difference shows up.
 *
 * ── The asymmetry IS the commercial model ───────────────────────────────────
 *   deals track   one unit PER DEAL
 *   growth track  ONE unit PER CAMPAIGN, however many creators are in it
 *
 * ── "One unit" is counting, never one payment ───────────────────────────────
 * Invoices stay per deal and every creator is paid directly by the brand.
 * Guapd holds, pools and splits nothing — that is Razorpay Route / RBI
 * payment-aggregator territory, and the deferred item CLAUDE.md calls the #1
 * timeline killer.
 */

export type UsageUnit = 'deal' | 'growth_campaign'

/**
 * Record one unit.
 *
 * ── Never throws ────────────────────────────────────────────────────────────
 * Called after offers have already gone to creators. Failing the send because
 * the ledger write failed would leave creators holding offers for a campaign
 * the brand is told did not happen — a worse state than an unbilled unit, which
 * is recoverable from `deals` and `campaigns` by a human.
 *
 * The unique index on (unit_type, ref_id) makes a double-submitted send a
 * no-op rather than a double charge, so a duplicate is EXPECTED here and is
 * not logged as a failure.
 */
export async function recordUsage(
  brandId: string,
  unitType: UsageUnit,
  refId: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { error } = await createAdminClient()
      .from('usage_events')
      .insert({ brand_id: brandId, unit_type: unitType, ref_id: refId, detail })

    // 23505 = unique violation: this unit is already on the ledger. Correct.
    if (error && error.code !== '23505') {
      console.error(`[usage] could not record ${unitType} ${refId}: ${error.message}`)
    }
  } catch (err) {
    console.error(`[usage] threw recording ${unitType} ${refId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** What a brand has used in a window. Reads the ledger, never live rows. */
export async function usageInPeriod(
  brandId: string,
  fromISO: string,
  toISO: string,
): Promise<{ deals: number; growthCampaigns: number; total: number }> {
  const { data } = await createAdminClient()
    .from('usage_events')
    .select('unit_type')
    .eq('brand_id', brandId)
    .gte('occurred_at', fromISO)
    .lte('occurred_at', toISO)

  const rows = data ?? []
  const deals = rows.filter((r) => r.unit_type === 'deal').length
  const growthCampaigns = rows.filter((r) => r.unit_type === 'growth_campaign').length
  return { deals, growthCampaigns, total: deals + growthCampaigns }
}
