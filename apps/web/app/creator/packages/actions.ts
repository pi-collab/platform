'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCreator } from '@/lib/creator-auth'
import { PRODUCT_TYPES } from '@/lib/product-types'
import { PRICE_MODES, type PriceMode } from '@/lib/product-price'

export type PackageResult = { ok: true } | { ok: false; message: string }

export interface SavePackageInput {
  /** Absent when creating. */
  id?: string
  platform: string
  handle: string
  productType: string
  description: string
  priceMode: PriceMode
  /** Whole rupees as typed. Converted to paise here, never in the client. */
  priceRupees: number
  priceMaxRupees?: number | null
}
// A rate card is a shop window, not a ledger — a crore is already implausible
// for a single deliverable, and the cap is what stops a slipped decimal point
// from being published as a real number.
const MAX_RUPEES = 1_00_00_000

/**
 * Create or update one package.
 *
 * The channel is validated against the creator's OWN social accounts rather
 * than accepted as given. Products are keyed by platform + handle with no
 * foreign key (social_accounts is JSONB), so nothing at the database level
 * stops a package being filed under a handle its owner does not have — which
 * would show on their shopfront under someone else's name.
 */
export async function savePackage(input: SavePackageInput): Promise<PackageResult> {
  const ctx = await verifyCreator()
  const admin = createAdminClient()

  const { data: creator } = await admin
    .from('creators')
    .select('social_accounts')
    .eq('id', ctx.creatorId)
    .maybeSingle()

  const socials = (creator?.social_accounts ?? []) as Array<{ platform: string; handle: string }>
  const platform = input.platform.trim().toLowerCase()
  const handle = input.handle.trim().replace(/^@/, '')

  const owns = socials.some(
    (s) => s.platform?.trim().toLowerCase() === platform &&
           s.handle?.trim().replace(/^@/, '').toLowerCase() === handle.toLowerCase(),
  )
  if (!owns) {
    return { ok: false, message: 'Pick one of your own connected channels.' }
  }

  const productType = input.productType.trim()
  if (!(PRODUCT_TYPES as readonly string[]).includes(productType)) {
    return { ok: false, message: 'Choose a deliverable from the list.' }
  }

  if (!(PRICE_MODES as readonly string[]).includes(input.priceMode)) {
    return { ok: false, message: 'Choose how you want the price shown.' }
  }
  const mode = input.priceMode

  const description = input.description.trim().slice(0, 300)

  // ── Price, per mode ──────────────────────────────────────────────────────
  let pricePaise = 0
  let priceMaxPaise: number | null = null

  if (mode !== 'on_request') {
    const rupees = Number(input.priceRupees)
    if (!Number.isFinite(rupees) || !Number.isInteger(rupees) || rupees <= 0) {
      return { ok: false, message: 'Enter a price in whole rupees.' }
    }
    if (rupees > MAX_RUPEES) {
      return { ok: false, message: 'That price looks too high. Check the number.' }
    }
    pricePaise = rupees * 100

    if (mode === 'range') {
      const maxRupees = Number(input.priceMaxRupees)
      if (!Number.isFinite(maxRupees) || !Number.isInteger(maxRupees) || maxRupees <= 0) {
        return { ok: false, message: 'Enter the top of your range.' }
      }
      if (maxRupees > MAX_RUPEES) {
        return { ok: false, message: 'That price looks too high. Check the number.' }
      }
      if (maxRupees <= rupees) {
        return { ok: false, message: 'The top of the range has to be more than the bottom.' }
      }
      priceMaxPaise = maxRupees * 100
    }
  }

  const row = {
    creator_id: ctx.creatorId,
    platform,
    handle,
    product_type: productType,
    description: description || null,
    price_paise: pricePaise,
    price_mode: mode,
    price_max_paise: priceMaxPaise,
    // Derived, never set independently — see the column comment in 0477. Older
    // consumers read this flag and must keep agreeing with the mode.
    display_price: mode !== 'on_request',
    is_active: true,
  }

  // Service role, but every write is pinned to ctx.creatorId: on update the
  // creator_id is part of the match, so a guessed id belonging to someone else
  // matches no row rather than editing theirs.
  const { error } = input.id
    ? await admin.from('creator_products').update(row).eq('id', input.id).eq('creator_id', ctx.creatorId)
    : await admin.from('creator_products').insert(row)

  if (error) {
    console.error(`[packages] save failed creator=${ctx.creatorId}: ${error.message}`)
    return { ok: false, message: 'Could not save that. Please try again.' }
  }

  revalidateEverywhere()
  return { ok: true }
}

/**
 * Remove a package.
 *
 * Deactivated, not deleted: the table denies client deletes by policy, and past
 * deals reference what was offered at the time. A hard delete would rewrite
 * that history.
 */
export async function deletePackage(id: string): Promise<PackageResult> {
  const ctx = await verifyCreator()
  const admin = createAdminClient()

  const { error } = await admin
    .from('creator_products')
    .update({ is_active: false })
    .eq('id', id)
    .eq('creator_id', ctx.creatorId)

  if (error) {
    console.error(`[packages] delete failed creator=${ctx.creatorId}: ${error.message}`)
    return { ok: false, message: 'Could not remove that. Please try again.' }
  }

  revalidateEverywhere()
  return { ok: true }
}

/**
 * A package shows on the shopfront and gates a dashboard step, so a stale cache
 * on either reads as the save having failed.
 */
function revalidateEverywhere() {
  revalidatePath('/creator/packages')
  // The shopfront editor lists the same packages; without this it keeps
  // showing the set from before the save.
  revalidatePath('/creator/storefront')
  revalidatePath('/creator/storefront')
  revalidatePath('/creator/dashboard')
}

/* ── Add-on rates, per channel ────────────────────────────────────────────────
   Collab and Boosting are priced per (platform, handle), not per creator: a
   collab on Instagram is not a collab on YouTube, and boosting a Reel is not
   boosting a long-form video.

   Percent arrives as BASIS POINTS from the client and is validated as an
   integer here. The client does the "10.5" -> 1050 conversion because that is a
   display concern; this action refuses anything that is not already an integer,
   so a float cannot reach the column even if a caller is written by hand.
   ────────────────────────────────────────────────────────────────────────── */

export interface SaveAddonRatesInput {
  platform: string
  handle: string
  /** null clears the collab rate — the channel stops offering one. */
  collabRateType: 'fixed' | 'percent' | null
  /** Paise when fixed, basis points when percent. */
  collabRateValue: number | null
  /** The 30-DAY rate in paise. null clears it. */
  boostingThirtyDayPaise: number | null
}

export async function saveAddonRates(input: SaveAddonRatesInput): Promise<PackageResult> {
  const ctx = await verifyCreator()

  const platform = String(input.platform ?? '').trim().toLowerCase()
  const handle = String(input.handle ?? '').trim()
  if (!platform || !handle) return { ok: false, message: 'Pick a channel first.' }

  // Half-set is rejected rather than silently completed: a type with no value
  // is a control the brand would see and the calculator could not act on.
  const hasType = input.collabRateType != null
  const hasValue = input.collabRateValue != null
  if (hasType !== hasValue) {
    return { ok: false, message: 'Set both the collab type and its amount, or neither.' }
  }

  if (hasValue) {
    const v = input.collabRateValue as number
    if (!Number.isInteger(v) || v < 0) {
      return { ok: false, message: 'That collab rate is not a whole amount.' }
    }
    // 10000 basis points is 100%. Above that is a typo, not a rate.
    if (input.collabRateType === 'percent' && v > 10_000) {
      return { ok: false, message: 'A collab rate cannot be more than 100%.' }
    }
    if (input.collabRateType === 'fixed' && v > 100_000_000_00) {
      return { ok: false, message: 'That collab rate looks too large.' }
    }
  }

  const boost = input.boostingThirtyDayPaise
  if (boost != null) {
    if (!Number.isInteger(boost) || boost < 0) {
      return { ok: false, message: 'That boosting rate is not a whole amount.' }
    }
    if (boost > 100_000_000_00) return { ok: false, message: 'That boosting rate looks too large.' }
  }

  const admin = createAdminClient()

  // The channel has to be one the creator actually owns, or a rate could be
  // attached to a handle they do not have.
  const { data: creator } = await admin
    .from('creators').select('social_accounts').eq('id', ctx.creatorId).maybeSingle()
  const owns = ((creator?.social_accounts ?? []) as Array<{ platform?: string; handle?: string }>)
    .some(a => String(a?.platform ?? '').toLowerCase() === platform
      && String(a?.handle ?? '').replace(/^@/, '').toLowerCase() === handle.replace(/^@/, '').toLowerCase())
  if (!owns) return { ok: false, message: 'That channel is not on your profile.' }

  const row = {
    creator_id: ctx.creatorId,
    platform,
    handle,
    collab_rate_type: input.collabRateType,
    collab_rate_value: input.collabRateValue,
    boosting_30day_paise: boost,
    updated_at: new Date().toISOString(),
  }

  const { error } = await admin
    .from('creator_addon_rates')
    .upsert(row, { onConflict: 'creator_id,platform,handle' })

  if (error) {
    console.error('[addon-rates] save failed:', error.message)
    return { ok: false, message: 'Could not save those rates. Please try again.' }
  }

  revalidatePath('/creator/packages')
  // The shopfront editor lists the same packages; without this it keeps
  // showing the set from before the save.
  revalidatePath('/creator/storefront')
  revalidatePath('/creator/storefront')
  return { ok: true }
}

/* ── Revision policy, per creator ─────────────────────────────────────────────
   A revision is a ROUND of feedback on a delivery — review-actions increments
   the counter once per delivered -> revision transition, however many items
   that round touches. So the terms belong to the creator and the deal, not to
   an individual package: a Reel with "2 revisions" and a video with "1" in the
   same deal has no coherent answer.
   ────────────────────────────────────────────────────────────────────────── */

export interface SaveRevisionPolicyInput {
  enabled: boolean
  includedRevisions: number
  /** Whole rupees as typed. Converted to paise here, never in the client. */
  perExtraRupees: number
}

export async function saveRevisionPolicy(input: SaveRevisionPolicyInput): Promise<PackageResult> {
  const ctx = await verifyCreator()

  // Clamped rather than rejected: nudging a counter should not cost someone the
  // rest of the form. The DB CHECK is the real boundary.
  const included = input.enabled ? Math.max(0, Math.min(20, Math.trunc(input.includedRevisions || 0))) : 0
  const perExtraPaise = input.enabled ? Math.max(0, Math.trunc(input.perExtraRupees || 0)) * 100 : 0

  if (perExtraPaise > 100_000_000_00) {
    return { ok: false, message: 'That revision price looks too large.' }
  }

  const { error } = await createAdminClient()
    .from('creators')
    .update({
      revisions_enabled: input.enabled,
      included_revisions: included,
      price_per_extra_revision_paise: perExtraPaise,
    })
    .eq('id', ctx.creatorId)

  if (error) {
    console.error('[revision-policy] save failed:', error.message)
    return { ok: false, message: 'Could not save those terms. Please try again.' }
  }

  revalidatePath('/creator/packages')
  // The shopfront editor lists the same packages; without this it keeps
  // showing the set from before the save.
  revalidatePath('/creator/storefront')
  return { ok: true }
}
