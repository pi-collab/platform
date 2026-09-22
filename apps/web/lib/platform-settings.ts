import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Global settings ops can change without a deploy.
 *
 * ── Every key has a default HERE ────────────────────────────────────────────
 * A missing row must never be a broken page. The table is seeded, but a fresh
 * environment, a failed migration or a deleted row would otherwise take the
 * campaign builder down — and the builder is not where you want to discover
 * that a settings row is missing.
 */

export type MinimumMetric = 'creators' | 'value'

export interface GrowthMinimum {
  /** Which of the two numbers is ENFORCED. The other is still stored. */
  metric: MinimumMetric
  minCreators: number
  minValuePaise: number
}

/** The starting guess. Expected to move once pilots show the right threshold. */
const GROWTH_MINIMUM_DEFAULT: GrowthMinimum = {
  metric: 'creators',
  minCreators: 5,
  minValuePaise: 2_000_000,
}

export async function getGrowthMinimum(): Promise<GrowthMinimum> {
  try {
    const { data } = await createAdminClient()
      .from('platform_settings')
      .select('value')
      .eq('key', 'growth_campaign_minimum')
      .maybeSingle()

    const v = data?.value as Partial<Record<string, unknown>> | undefined
    if (!v) return GROWTH_MINIMUM_DEFAULT

    const metric = v.metric === 'value' ? 'value' : 'creators'
    return {
      metric,
      minCreators: typeof v.min_creators === 'number' ? v.min_creators : GROWTH_MINIMUM_DEFAULT.minCreators,
      minValuePaise: typeof v.min_value_paise === 'number' ? v.min_value_paise : GROWTH_MINIMUM_DEFAULT.minValuePaise,
    }
  } catch (err) {
    console.error(`[platform-settings] growth minimum read failed: ${err instanceof Error ? err.message : String(err)}`)
    return GROWTH_MINIMUM_DEFAULT
  }
}

/**
 * Whether a roster clears the minimum, and what to say if it does not.
 *
 * Takes the SNAPSHOT from the campaign rather than reading the live setting, so
 * a brand mid-build is judged against the rule they started under. The live
 * value is only read when a campaign is created.
 */
export function checkMinimum(
  snapshot: { metric: MinimumMetric | null; minCreators: number | null; minValuePaise: number | null },
  roster: { creators: number; totalPaise: number },
): { ok: boolean; message?: string } {
  if (snapshot.metric === 'value') {
    const need = snapshot.minValuePaise ?? 0
    if (roster.totalPaise < need) {
      return { ok: false, message: `This campaign needs to reach ₹${(need / 100).toLocaleString('en-IN')} before it can be sent.` }
    }
    return { ok: true }
  }

  const need = snapshot.minCreators ?? 0
  if (roster.creators < need) {
    return { ok: false, message: `Add at least ${need} creators before sending. You have ${roster.creators}.` }
  }
  return { ok: true }
}
