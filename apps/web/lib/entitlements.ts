import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * What a brand is allowed to do — and deliberately not how it was allowed.
 *
 * ── The one rule ────────────────────────────────────────────────────────────
 * NOTHING outside this file reads `source`. Growth access is granted by ops
 * today and by a subscription later; every caller asks the same question and
 * gets the same answer either way. The day subscriptions land, a webhook writes
 * rows with source = 'subscription' and not one check changes.
 *
 * A boolean column on `brands` would have been smaller today and a rewrite of
 * every call site later.
 *
 * ── Expiry is checked here, not by the caller ───────────────────────────────
 * An expired trial is not an entitlement, and leaving that to each caller is
 * how one of them forgets.
 */

export type EntitlementKey =
  /** May create Growth campaigns. */
  | 'growth_campaigns'

export interface Entitlement {
  key: string
  value: unknown
  source: 'ops' | 'subscription' | 'trial'
  expiresAt: string | null
}

/** Every entitlement a brand currently holds, expired ones removed. */
export async function listEntitlements(brandId: string): Promise<Entitlement[]> {
  const { data } = await createAdminClient()
    .from('brand_entitlements')
    .select('key, value, source, expires_at')
    .eq('brand_id', brandId)

  const now = Date.now()
  return (data ?? [])
    .filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now)
    .map((r) => ({ key: r.key, value: r.value, source: r.source, expiresAt: r.expires_at }))
}

/**
 * A flag.
 *
 * Absent means false. Deliberately: a brand with no row has not been granted
 * anything, and inventing a default here would put the product's access rules
 * in two places — this file and whatever seeded the rows.
 */
export async function hasEntitlement(brandId: string, key: EntitlementKey): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('brand_entitlements')
    .select('value, expires_at')
    .eq('brand_id', brandId)
    .eq('key', key)
    .maybeSingle()

  if (!data) return false
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return false
  return data.value === true
}

/**
 * A numeric limit, for when volume entitlements arrive.
 *
 * Returns null when unset, which callers should read as "no limit" rather than
 * "zero" — an unset limit has never meant a brand can do nothing.
 */
export async function entitlementLimit(brandId: string, key: string): Promise<number | null> {
  const { data } = await createAdminClient()
    .from('brand_entitlements')
    .select('value, expires_at')
    .eq('brand_id', brandId)
    .eq('key', key)
    .maybeSingle()

  if (!data) return null
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null
  return typeof data.value === 'number' ? data.value : null
}
