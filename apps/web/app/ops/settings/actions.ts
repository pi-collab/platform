'use server'

import { revalidatePath } from 'next/cache'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { logOpsEvent } from '@/lib/ops-audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGrowthMinimum, type MinimumMetric } from '@/lib/platform-settings'

/**
 * Platform settings ops can change without a deploy, and who may grant what.
 *
 * Admin only. Both actions here change what brands can do and what they are
 * held to — the same class of decision as vetting a creator.
 */

/**
 * Set the Growth campaign minimum.
 *
 * Both numbers are stored whichever metric is active, so switching metric later
 * is one more edit rather than a migration. Existing campaigns are unaffected:
 * they carry a snapshot of the rule they were created under.
 */
export async function setGrowthMinimum(input: {
  metric: MinimumMetric
  minCreators: number
  minValuePaise: number
}): Promise<{ ok: boolean; message?: string }> {
  const user = await verifyOpsAccess()
  if (!user) return { ok: false, message: 'Not authorized' }

  if (!Number.isInteger(input.minCreators) || input.minCreators < 1) {
    return { ok: false, message: 'Minimum creators must be a whole number of at least 1' }
  }
  if (!Number.isInteger(input.minValuePaise) || input.minValuePaise < 0) {
    return { ok: false, message: 'Minimum value must be a whole number of paise' }
  }

  const before = await getGrowthMinimum()
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()

  const { error } = await admin
    .from('platform_settings')
    .upsert({
      key: 'growth_campaign_minimum',
      value: {
        metric: input.metric,
        min_creators: input.minCreators,
        min_value_paise: input.minValuePaise,
      },
      updated_by: profile?.id ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })

  if (error) return { ok: false, message: error.message }

  /* Before and after, per the ops-audit rule. This is a threshold that decides
     whether a brand can send a campaign, so "it used to be five" needs to be
     answerable. */
  await logOpsEvent(user, 'settings.growth_minimum_changed', 'platform_settings', 'growth_campaign_minimum', {
    before: { metric: before.metric, min_creators: before.minCreators, min_value_paise: before.minValuePaise },
    after: { metric: input.metric, min_creators: input.minCreators, min_value_paise: input.minValuePaise },
  })

  revalidatePath('/ops/settings')
  return { ok: true }
}

/**
 * Grant or revoke a brand entitlement.
 *
 * Written with source = 'ops'. Nothing in the app reads that column — it is
 * here so that when subscriptions start writing rows, a human can still tell
 * which grants were decisions and which were payments.
 */
export async function setBrandEntitlement(input: {
  brandId: string
  key: string
  granted: boolean
}): Promise<{ ok: boolean; message?: string }> {
  const user = await verifyOpsAccess()
  if (!user) return { ok: false, message: 'Not authorized' }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()

  const { data: before } = await admin
    .from('brand_entitlements')
    .select('value')
    .eq('brand_id', input.brandId)
    .eq('key', input.key)
    .maybeSingle()

  if (input.granted) {
    const { error } = await admin
      .from('brand_entitlements')
      .upsert({
        brand_id: input.brandId,
        key: input.key,
        value: true,
        source: 'ops',
        granted_by: profile?.id ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'brand_id,key' })
    if (error) return { ok: false, message: error.message }
  } else {
    /* Deleted rather than set to false. An absent row and a false row mean the
       same thing to hasEntitlement, and keeping both would mean two ways to
       spell "no" that a later query could disagree about. */
    const { error } = await admin
      .from('brand_entitlements')
      .delete()
      .eq('brand_id', input.brandId)
      .eq('key', input.key)
    if (error) return { ok: false, message: error.message }
  }

  await logOpsEvent(user, 'brand.entitlement_changed', 'brands', input.brandId, {
    key: input.key,
    before: { granted: before?.value === true },
    after: { granted: input.granted },
  })

  revalidatePath('/ops/settings')
  revalidatePath(`/ops/brands/${input.brandId}`)
  return { ok: true }
}
