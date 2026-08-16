'use server'

import { verifyOpsAccess } from '@/lib/ops-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyBrandApproved, notifyCreatorApproved, notifyCreatorRejected } from '@/lib/account-emails'
import { CREATOR_APPROVAL_ACK } from '@/lib/creator-approval'
import { logOpsEvent } from '@/lib/ops-audit'
import { notifyDealParty } from '@/lib/notifications'
import { generateOfferToken } from '@/lib/offer-token'
import { calculateFee } from '@/lib/fee'
import { formatAmountForMessage } from '@/lib/money'
import { revalidatePath } from 'next/cache'

// ── Add creator ──────────────────────────────────────────────────────────────

interface SocialAccountEntry {
  platform: string
  handle: string
  url: string | null
  follower_count: number | null
  verified: boolean
}

interface AddCreatorInput {
  full_name: string
  phone?: string
  niches?: string[]
  handle?: string
  bio?: string
  profile_photo_url?: string
  social_accounts?: SocialAccountEntry[]
  worked_with?: string[]
  portfolio_links?: string[]
  rate_card?: Record<string, number> // values already in paise
}

const VALID_PLATFORMS = new Set(['instagram', 'youtube', 'twitter', 'linkedin', 'other'])

function isValidUrl(s: string): boolean {
  return s.startsWith('http://') || s.startsWith('https://')
}

export async function addCreator(input: AddCreatorInput) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const { full_name, phone, niches, handle, bio, profile_photo_url, social_accounts, worked_with, portfolio_links, rate_card } = input
  if (!full_name.trim()) return { error: 'Full name is required' }

  // Validate profile_photo_url
  if (profile_photo_url && !isValidUrl(profile_photo_url)) {
    return { error: 'Profile photo URL must start with http:// or https://' }
  }

  // Validate social_accounts
  if (social_accounts) {
    for (let i = 0; i < social_accounts.length; i++) {
      const sa = social_accounts[i]
      if (!VALID_PLATFORMS.has(sa.platform)) {
        return { error: `Social account ${i + 1}: invalid platform "${sa.platform}"` }
      }
      if (sa.follower_count !== null && (sa.follower_count < 0 || !Number.isInteger(sa.follower_count))) {
        return { error: `Social account ${i + 1}: follower count must be a non-negative integer` }
      }
      if (sa.url && !isValidUrl(sa.url)) {
        return { error: `Social account ${i + 1}: URL must start with http:// or https://` }
      }
    }
  }

  // Validate portfolio_links
  if (portfolio_links) {
    for (let i = 0; i < portfolio_links.length; i++) {
      if (!isValidUrl(portfolio_links[i])) {
        return { error: `Portfolio link ${i + 1}: must start with http:// or https://` }
      }
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.from('creators').insert({
    full_name: full_name.trim(),
    phone: phone?.trim() || null,
    niches: niches ?? [],
    handle: handle?.trim() || null,
    bio: bio?.trim() || null,
    profile_photo_url: profile_photo_url?.trim() || null,
    social_accounts: social_accounts ?? [],
    worked_with: worked_with ?? [],
    portfolio_links: portfolio_links ?? [],
    rate_card: rate_card ?? {},
    is_vetted: false,
  }).select('id').single()

  if (error) return { error: error.message }

  await logOpsEvent(user, 'creator.added', 'creators', data.id, {
    full_name: full_name.trim(),
    handle: handle?.trim() || null,
  })

  revalidatePath('/ops/creators')
  return { success: true }
}

// ── Vet (approve) creator ────────────────────────────────────────────────────

export async function vetCreator(creatorId: string) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const admin = createAdminClient()

  // Fetch before state
  const { data: before } = await admin
    .from('creators')
    .select('is_vetted, is_rejected')
    .eq('id', creatorId)
    .maybeSingle()

  const { error } = await admin
    .from('creators')
    .update({ is_vetted: true, is_rejected: false })
    .eq('id', creatorId)

  if (error) return { error: error.message }

  await logOpsEvent(user, 'creator.vetted', 'creators', creatorId, {
    before: { is_vetted: before?.is_vetted, is_rejected: before?.is_rejected },
    after: { is_vetted: true, is_rejected: false },
  })

  // Only on a real transition. Re-vetting an already-vetted creator is an ops
  // no-op and must not email them a second time about the same decision.
  if (!before?.is_vetted) await notifyCreatorApproved(creatorId)

  revalidatePath('/ops/creators')
  return { success: true }
}

// ── Reject creator (soft-reject — keeps the row) ────────────────────────────

export async function rejectCreator(creatorId: string) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const admin = createAdminClient()

  const { data: before } = await admin
    .from('creators')
    .select('is_vetted, is_rejected')
    .eq('id', creatorId)
    .maybeSingle()

  const { error } = await admin
    .from('creators')
    .update({ is_vetted: false, is_rejected: true })
    .eq('id', creatorId)

  if (error) return { error: error.message }

  await logOpsEvent(user, 'creator.rejected', 'creators', creatorId, {
    before: { is_vetted: before?.is_vetted, is_rejected: before?.is_rejected },
    after: { is_vetted: false, is_rejected: true },
  })

  // Only on a real transition, so re-rejecting does not send the same bad news
  // twice. This is the one email nobody wants to receive by accident.
  if (!before?.is_rejected) await notifyCreatorRejected(creatorId)

  // Clear any past acknowledgement of the approved screen. Without this a
  // creator who was approved, saw it, was later rejected, and is then approved
  // again would land straight on the dashboard — the acknowledgement is
  // permanent, but the approval it acknowledged is not. Rejection is the point
  // where that record stops being true.
  await admin
    .from('events')
    .delete()
    .eq('event_type', CREATOR_APPROVAL_ACK)
    .contains('detail', { creator_id: creatorId })

  revalidatePath('/ops/creators')
  return { success: true }
}

// ── Delete creator (hard delete — removes creator, products, and linked auth/users rows) ──

export async function deleteCreator(creatorId: string) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const admin = createAdminClient()

  // Check for active deals — block deletion if any non-terminal deals exist
  const { data: activeDeals } = await admin
    .from('deals')
    .select('id')
    .eq('creator_id', creatorId)
    .not('status', 'in', '("declined","cancelled")')
    .limit(1)

  if (activeDeals && activeDeals.length > 0) {
    return { error: 'Cannot delete a creator with active deals. Cancel or complete deals first.' }
  }

  // Get the creator to find user_id for cleanup + audit
  const { data: creator } = await admin
    .from('creators')
    .select('id, user_id, full_name, handle')
    .eq('id', creatorId)
    .maybeSingle()

  if (!creator) return { error: 'Creator not found.' }

  // Audit BEFORE delete (the row won't exist after)
  await logOpsEvent(user, 'creator.deleted', 'creators', creatorId, {
    full_name: creator.full_name,
    handle: creator.handle,
  })

  // Delete creator_products (CASCADE should handle this, but be explicit)
  await admin.from('creator_products').delete().eq('creator_id', creatorId)

  // Delete the creator row
  const { error: delErr } = await admin.from('creators').delete().eq('id', creatorId)
  if (delErr) return { error: delErr.message }

  // Clean up linked users row + auth user if they exist
  if (creator.user_id) {
    const { data: profile } = await admin
      .from('users')
      .select('auth_id')
      .eq('id', creator.user_id)
      .maybeSingle()

    await admin.from('users').delete().eq('id', creator.user_id)

    if (profile?.auth_id) {
      await admin.auth.admin.deleteUser(profile.auth_id)
    }
  }

  revalidatePath('/ops/creators')
  return { success: true }
}

// ── Edit creator ─────────────────────────────────────────────────────────────

interface EditCreatorInput {
  id: string
  full_name: string
  phone?: string
  niches?: string[]
  handle?: string
  bio?: string
  profile_photo_url?: string
  social_accounts?: SocialAccountEntry[]
  worked_with?: string[]
  portfolio_links?: string[]
  rate_card?: Record<string, number>
}

export async function editCreator(input: EditCreatorInput) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const { id, full_name, phone, niches, handle, bio, profile_photo_url, social_accounts, worked_with, portfolio_links, rate_card } = input
  if (!full_name.trim()) return { error: 'Full name is required' }

  if (profile_photo_url && !isValidUrl(profile_photo_url)) {
    return { error: 'Profile photo URL must start with http:// or https://' }
  }

  if (social_accounts) {
    for (let i = 0; i < social_accounts.length; i++) {
      const sa = social_accounts[i]
      if (!VALID_PLATFORMS.has(sa.platform)) {
        return { error: `Social account ${i + 1}: invalid platform "${sa.platform}"` }
      }
      if (sa.follower_count !== null && (sa.follower_count < 0 || !Number.isInteger(sa.follower_count))) {
        return { error: `Social account ${i + 1}: follower count must be a non-negative integer` }
      }
      if (sa.url && !isValidUrl(sa.url)) {
        return { error: `Social account ${i + 1}: URL must start with http:// or https://` }
      }
    }
  }

  if (portfolio_links) {
    for (let i = 0; i < portfolio_links.length; i++) {
      if (!isValidUrl(portfolio_links[i])) {
        return { error: `Portfolio link ${i + 1}: must start with http:// or https://` }
      }
    }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('creators')
    .update({
      full_name: full_name.trim(),
      phone: phone?.trim() || null,
      niches: niches ?? [],
      handle: handle?.trim() || null,
      bio: bio?.trim() || null,
      profile_photo_url: profile_photo_url?.trim() || null,
      social_accounts: social_accounts ?? [],
      worked_with: worked_with ?? [],
      portfolio_links: portfolio_links ?? [],
      rate_card: rate_card ?? {},
    })
    .eq('id', id)

  if (error) return { error: error.message }

  await logOpsEvent(user, 'creator.edited', 'creators', id, {
    full_name: full_name.trim(),
  })

  revalidatePath('/ops/creators')
  return { success: true }
}

// ── Generate offer token ─────────────────────────────────────────────────────

export async function generateOfferLink(dealId: string) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  if (!dealId?.trim()) return { error: 'Deal ID is required' }

  const admin = createAdminClient()
  const { data: deal } = await admin
    .from('deals')
    .select('id, status')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { error: 'Deal not found' }
  if (deal.status !== 'negotiating') return { error: `Deal status is "${deal.status}": can only generate links for negotiating deals` }

  const token = generateOfferToken(dealId)
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001'
  const link = `${baseUrl}/offer/${encodeURIComponent(token)}`

  await logOpsEvent(user, 'deal.offer_link_generated', 'deals', dealId, {})

  return { success: true, link, token }
}

// ── Approve brand ────────────────────────────────────────────────────────────

export async function approveBrand(brandId: string) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const admin = createAdminClient()

  const { data: before } = await admin
    .from('brands')
    .select('brand_status')
    .eq('id', brandId)
    .maybeSingle()

  const { error } = await admin
    .from('brands')
    .update({ brand_status: 'approved' })
    .eq('id', brandId)

  if (error) return { error: error.message }

  await logOpsEvent(user, 'brand.approved', 'brands', brandId, {
    before: { brand_status: before?.brand_status },
    after: { brand_status: 'approved' },
  })

  // Release every held deal for this brand — ONE action however many a bulk
  // send queued. The brand does not re-send; this is what makes the "everything
  // you've sent goes out automatically" promise true.
  const released = await releaseHeldDeals(brandId, user.email ?? 'ops')

  // Tell the brand. Until now approval was silent on their side: the held
  // notice simply vanished next time they happened to log in, and the promise
  // that we would "notify you as soon as you're cleared" went unkept.
  //
  // After the release, so the email's claim that queued deals have gone out is
  // true when it is read. Only on a real transition — re-approving an already
  // approved brand is an ops no-op and must not congratulate them again.
  if (before?.brand_status !== 'approved') await notifyBrandApproved(brandId)

  revalidatePath('/ops/brands')
  revalidatePath('/deals')
  revalidatePath('/dashboard')
  return { success: true, released }
}

/**
 * Clear the hold on a brand's deals and deliver them.
 *
 * Order matters: the hold is cleared FIRST, so the creator-facing RLS predicate
 * (held_at IS NULL) already passes by the time the notification lands and they
 * click through. Notifying before releasing would send them to a deal they
 * still cannot read.
 *
 * Each deal notifies exactly as it would have at send time, so a released deal
 * is indistinguishable from a normal one to the creator.
 */
async function releaseHeldDeals(brandId: string, actor: string): Promise<number> {
  const admin = createAdminClient()

  const { data: held } = await admin
    .from('deals')
    .select('id, price_paise, fee_percent, fee_mode')
    .eq('brand_id', brandId)
    .not('held_at', 'is', null)

  if (!held || held.length === 0) return 0

  let sent = 0
  for (const deal of held) {
    // Conditional clear: if a concurrent approval already released it, the
    // update affects no rows and we skip, so no deal notifies twice.
    const { data: cleared } = await admin
      .from('deals')
      .update({ held_at: null })
      .eq('id', deal.id)
      .not('held_at', 'is', null)
      .select('id')

    if (!cleared || cleared.length === 0) continue

    await admin.from('events').insert({
      deal_id: deal.id,
      event_type: 'deal.hold_released',
      detail: { brand_id: brandId, released_by: actor },
    })

    const { creator_receives_paise } = calculateFee(
      deal.price_paise ?? 0,
      deal.fee_percent ?? 0,
      (deal.fee_mode as 'on_top' | 'deducted') ?? 'on_top',
    )

    await notifyDealParty(deal.id, 'creator', 'offer_sent', (t) => `New offer: ${t}`, {
      whatsapp: (ctx) => ({
        template: 'new_offer_received',
        bodyVars: [ctx.creatorName, ctx.brandName, formatAmountForMessage(creator_receives_paise)],
        buttonValue: generateOfferToken(deal.id),
      }),
    })
    sent++
  }

  return sent
}

// ── Reject brand ─────────────────────────────────────────────────────────────

export async function rejectBrand(brandId: string, reason?: string) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }
  // Held deals are NOT deleted on rejection — the brand keeps seeing its work
  // alongside the reason. Silently vanishing someone's drafts is worse than a
  // clear refusal.

  const admin = createAdminClient()

  const { data: before } = await admin
    .from('brands')
    .select('brand_status')
    .eq('id', brandId)
    .maybeSingle()

  const { error } = await admin
    .from('brands')
    .update({ brand_status: 'rejected', rejection_reason: reason?.trim() || null })
    .eq('id', brandId)

  if (error) return { error: error.message }

  await logOpsEvent(user, 'brand.rejected', 'brands', brandId, {
    before: { brand_status: before?.brand_status },
    after: { brand_status: 'rejected' },
  })

  revalidatePath('/ops/brands')
  return { success: true }
}

// ── Add creator product ──────────────────────────────────────────────────────

interface AddProductInput {
  creator_id: string
  platform: string
  handle: string
  product_type: string
  description?: string
  price_paise: number
  display_price?: boolean
  included_revisions?: number
  price_per_extra_revision_paise?: number
}

export async function addProduct(input: AddProductInput) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const { creator_id, platform, handle, product_type, description, price_paise, display_price, included_revisions, price_per_extra_revision_paise } = input
  if (!platform.trim()) return { error: 'Platform is required' }
  if (!handle.trim()) return { error: 'Handle is required' }
  if (!product_type.trim()) return { error: 'Product type is required' }
  if (!Number.isInteger(price_paise) || price_paise < 0) return { error: 'Price must be a non-negative integer (paise)' }

  const admin = createAdminClient()
  const { data, error } = await admin.from('creator_products').insert({
    creator_id,
    platform: platform.trim(),
    handle: handle.trim(),
    product_type,
    description: description?.trim() || null,
    price_paise,
    display_price: display_price ?? true,
    included_revisions: included_revisions ?? 1,
    price_per_extra_revision_paise: price_per_extra_revision_paise ?? 0,
  }).select('id').single()

  if (error) return { error: error.message }

  await logOpsEvent(user, 'product.added', 'creator_products', data.id, {
    creator_id,
    product_type,
    price_paise,
  })

  revalidatePath(`/ops/creators/${creator_id}`)
  return { success: true }
}

// ── Edit creator product ─────────────────────────────────────────────────────

interface EditProductInput {
  id: string
  creator_id: string
  product_type: string
  description?: string
  price_paise: number
  display_price?: boolean
  is_active?: boolean
  included_revisions?: number
  price_per_extra_revision_paise?: number
}

export async function editProduct(input: EditProductInput) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const { id, creator_id, product_type, description, price_paise, display_price, is_active, included_revisions, price_per_extra_revision_paise } = input
  if (!product_type.trim()) return { error: 'Product type is required' }
  if (!Number.isInteger(price_paise) || price_paise < 0) return { error: 'Price must be a non-negative integer (paise)' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('creator_products')
    .update({
      product_type,
      description: description?.trim() || null,
      price_paise,
      display_price: display_price ?? true,
      is_active: is_active ?? true,
      included_revisions: included_revisions ?? 1,
      price_per_extra_revision_paise: price_per_extra_revision_paise ?? 0,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  await logOpsEvent(user, 'product.edited', 'creator_products', id, {
    creator_id,
    product_type,
    price_paise,
  })

  revalidatePath(`/ops/creators/${creator_id}`)
  return { success: true }
}

// ── Set per-deal fee override ─────────────────────────────────────────────────

export async function setDealFeeOverride(dealId: string, feePercent: number | null, reason: string) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  if (!reason?.trim()) return { error: 'A reason is required for fee overrides.' }

  if (feePercent != null && (feePercent < 0 || feePercent > 100)) {
    return { error: 'Fee percent must be between 0 and 100.' }
  }

  const admin = createAdminClient()

  const { data: deal } = await admin
    .from('deals')
    .select('id, status, brand_id, fee_percent, fee_pct_override, fee_mode')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { error: 'Deal not found.' }
  if (deal.status !== 'negotiating') {
    return { error: `Cannot change fee: deal is "${deal.status}". Fee is immutable once the creator has accepted.` }
  }

  // If clearing the override, restore to brand's current rate
  let resolvedFeePercent: number
  if (feePercent != null) {
    resolvedFeePercent = feePercent
  } else {
    const { data: brand } = await admin
      .from('brands')
      .select('platform_fee_percent')
      .eq('id', deal.brand_id)
      .single()
    resolvedFeePercent = brand?.platform_fee_percent ?? 0
  }

  const before = {
    fee_percent: deal.fee_percent,
    fee_pct_override: deal.fee_pct_override,
  }

  const { error } = await admin
    .from('deals')
    .update({
      fee_pct_override: feePercent,
      fee_percent: resolvedFeePercent,
    })
    .eq('id', dealId)

  if (error) return { error: error.message }

  // Audit: ops_events (full ops trail)
  await logOpsEvent(user, 'deal.fee_override_set', 'deals', dealId, {
    reason: reason.trim(),
    before,
    after: { fee_percent: resolvedFeePercent, fee_pct_override: feePercent },
  })

  // Audit: deal-scoped event (visible in deal timeline)
  const { error: eventErr } = await admin.from('events').insert({
    deal_id: dealId,
    actor_id: null,
    event_type: 'deal.fee_override',
    detail: {
      actor_email: user.email,
      reason: reason.trim(),
      before,
      after: { fee_percent: resolvedFeePercent, fee_pct_override: feePercent },
    },
  })

  if (eventErr) return { error: `Fee updated but timeline entry failed: ${eventErr.message}` }

  revalidatePath(`/ops/deals/${dealId}`)
  revalidatePath(`/deals/${dealId}`)
  return { success: true }
}

// ── Set brand-creator pair rate ──────────────────────────────────────────────

export async function setBrandCreatorRate(
  brandId: string,
  creatorId: string,
  feePct: number | null,
  reason: string,
) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  if (!reason?.trim()) return { error: 'A reason is required.' }

  if (feePct != null && (feePct < 0 || feePct > 100)) {
    return { error: 'Fee percent must be between 0 and 100.' }
  }

  const admin = createAdminClient()

  // Fetch existing pair rate (if any) for before-state
  const { data: existing } = await admin
    .from('brand_creator_rates')
    .select('id, fee_pct, reason')
    .eq('brand_id', brandId)
    .eq('creator_id', creatorId)
    .maybeSingle()

  if (feePct == null) {
    // Clear: delete the pair rate
    if (existing) {
      const { error } = await admin
        .from('brand_creator_rates')
        .delete()
        .eq('id', existing.id)
      if (error) return { error: error.message }
    }

    await logOpsEvent(user, 'brand_creator_rate.removed', 'brand_creator_rates', existing?.id ?? null, {
      brand_id: brandId,
      creator_id: creatorId,
      reason: reason.trim(),
      before: existing ? { fee_pct: existing.fee_pct } : null,
    })
  } else if (existing) {
    // Update existing pair rate
    const { error } = await admin
      .from('brand_creator_rates')
      .update({
        fee_pct: feePct,
        reason: reason.trim(),
        set_by: user.email!,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (error) return { error: error.message }

    await logOpsEvent(user, 'brand_creator_rate.updated', 'brand_creator_rates', existing.id, {
      brand_id: brandId,
      creator_id: creatorId,
      reason: reason.trim(),
      before: { fee_pct: existing.fee_pct },
      after: { fee_pct: feePct },
    })
  } else {
    // Insert new pair rate
    const { data, error } = await admin
      .from('brand_creator_rates')
      .insert({
        brand_id: brandId,
        creator_id: creatorId,
        fee_pct: feePct,
        reason: reason.trim(),
        set_by: user.email!,
      })
      .select('id')
      .single()
    if (error) return { error: error.message }

    await logOpsEvent(user, 'brand_creator_rate.set', 'brand_creator_rates', data.id, {
      brand_id: brandId,
      creator_id: creatorId,
      reason: reason.trim(),
      after: { fee_pct: feePct },
    })
  }

  revalidatePath(`/ops/creators/${creatorId}`)
  revalidatePath(`/ops/brands`)
  return { success: true }
}

// ── Edit brand ───────────────────────────────────────────────────────────────

interface EditBrandInput {
  id: string
  name: string
  category?: string
  company_size?: string
  website?: string
  contact_name?: string
  contact_email?: string
  social_accounts?: Record<string, string>
  platform_fee_percent?: number
  fee_mode?: 'on_top' | 'deducted'
}

export async function editBrand(input: EditBrandInput) {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const { id, name, category, company_size, website, contact_name, contact_email, social_accounts, platform_fee_percent, fee_mode } = input
  if (!name.trim()) return { error: 'Brand name is required' }

  const admin = createAdminClient()

  // Fetch before state for money/fee fields
  const { data: before } = await admin
    .from('brands')
    .select('platform_fee_percent, fee_mode')
    .eq('id', id)
    .maybeSingle()

  const update: Record<string, unknown> = {
    name: name.trim(),
    category: category?.trim() || null,
    company_size: company_size?.trim() || null,
    website: website?.trim() || null,
    contact_name: contact_name?.trim() || null,
    contact_email: contact_email?.trim() || null,
    social_accounts: social_accounts ?? {},
  }
  if (platform_fee_percent != null) update.platform_fee_percent = platform_fee_percent
  if (fee_mode) update.fee_mode = fee_mode

  const { error } = await admin
    .from('brands')
    .update(update)
    .eq('id', id)

  if (error) return { error: error.message }

  await logOpsEvent(user, 'brand.edited', 'brands', id, {
    name: name.trim(),
    before: { platform_fee_percent: before?.platform_fee_percent, fee_mode: before?.fee_mode },
    after: {
      platform_fee_percent: platform_fee_percent ?? before?.platform_fee_percent,
      fee_mode: fee_mode ?? before?.fee_mode,
    },
  })

  revalidatePath('/ops/brands')
  return { success: true }
}
