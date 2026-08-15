'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { verifyBrand } from '@/lib/brand-auth'
import { createAdminClient } from '@/lib/supabase/admin'

const INVITE_EXPIRY_DAYS = 7
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

// ── Helpers ───────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function requireAdmin() {
  const brand = await verifyBrand()
  if (!brand.isAdmin) throw new Error('ADMIN_ONLY')
  return brand
}

// ── Create Invite ─────────────────────────────────────────────────

export async function createInvite(email: string): Promise<{ error?: string; inviteUrl?: string; email?: string }> {
  let brand
  try { brand = await requireAdmin() } catch {
    return { error: 'Only admins can invite team members.' }
  }

  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
    return { error: 'Please enter a valid email address.' }
  }

  const admin = createAdminClient()

  // Check if this email is already a member of this brand
  const { data: existingMember } = await admin
    .from('brand_members')
    .select('id, users!inner(email)')
    .eq('brand_id', brand.brandId)
    .limit(100)

  const alreadyMember = existingMember?.some(
    (m: any) => m.users?.email?.toLowerCase() === normalizedEmail
  )
  if (alreadyMember) {
    return { error: 'This person is already a member of your brand.' }
  }

  // Expire any stale pending invites for this email+brand (pending but past expiry)
  await admin
    .from('brand_invites')
    .update({ status: 'expired' })
    .eq('brand_id', brand.brandId)
    .eq('email', normalizedEmail)
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())

  // Check for an existing active invite (pending AND not expired)
  const { data: existingInvite } = await admin
    .from('brand_invites')
    .select('id, token')
    .eq('brand_id', brand.brandId)
    .eq('email', normalizedEmail)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existingInvite) {
    // Return the existing active invite link (idempotent)
    return {
      inviteUrl: `${SITE_URL}/invite/${existingInvite.token}`,
      email: normalizedEmail,
    }
  }

  // Generate crypto-random token
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { error: insertErr } = await admin
    .from('brand_invites')
    .insert({
      brand_id: brand.brandId,
      email: normalizedEmail,
      token,
      invited_by: brand.profileId,
      expires_at: expiresAt,
    })

  if (insertErr) {
    return { error: `Failed to create invite: ${insertErr.message}` }
  }

  revalidatePath('/settings/team')
  return {
    inviteUrl: `${SITE_URL}/invite/${token}`,
    email: normalizedEmail,
  }
}

// ── Revoke Invite ─────────────────────────────────────────────────

export async function revokeInvite(inviteId: string): Promise<{ error?: string }> {
  let brand
  try { brand = await requireAdmin() } catch {
    return { error: 'Only admins can revoke invites.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('brand_invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId)
    .eq('brand_id', brand.brandId)
    .eq('status', 'pending')

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return {}
}

// ── Remove Team Member ────────────────────────────────────────────

export async function removeTeamMember(memberId: string): Promise<{ error?: string }> {
  let brand
  try { brand = await requireAdmin() } catch {
    return { error: 'Only admins can remove team members.' }
  }

  const admin = createAdminClient()

  // Cannot remove yourself
  const { data: target } = await admin
    .from('brand_members')
    .select('id, user_id, is_admin')
    .eq('id', memberId)
    .eq('brand_id', brand.brandId)
    .single()

  if (!target) return { error: 'Member not found.' }

  // Last-admin check: if removing an admin, ensure at least one other admin remains
  if (target.is_admin) {
    const { count } = await admin
      .from('brand_members')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.brandId)
      .eq('is_admin', true)

    if ((count ?? 0) <= 1) {
      return { error: 'Cannot remove the last admin. Promote another member first.' }
    }
  }

  const { error } = await admin
    .from('brand_members')
    .delete()
    .eq('id', memberId)
    .eq('brand_id', brand.brandId)

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return {}
}

// ── Toggle Admin ──────────────────────────────────────────────────

export async function toggleAdmin(memberId: string): Promise<{ error?: string }> {
  let brand
  try { brand = await requireAdmin() } catch {
    return { error: 'Only admins can change roles.' }
  }

  const admin = createAdminClient()

  const { data: target } = await admin
    .from('brand_members')
    .select('id, user_id, is_admin')
    .eq('id', memberId)
    .eq('brand_id', brand.brandId)
    .single()

  if (!target) return { error: 'Member not found.' }

  const newIsAdmin = !target.is_admin

  // If demoting (admin → member), check last-admin
  if (!newIsAdmin) {
    const { count } = await admin
      .from('brand_members')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.brandId)
      .eq('is_admin', true)

    if ((count ?? 0) <= 1) {
      return { error: 'Cannot demote the last admin. Promote another member first.' }
    }
  }

  const { error } = await admin
    .from('brand_members')
    .update({ is_admin: newIsAdmin })
    .eq('id', memberId)
    .eq('brand_id', brand.brandId)

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return {}
}
