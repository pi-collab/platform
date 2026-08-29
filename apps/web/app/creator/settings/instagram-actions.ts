'use server'

import { revalidatePath } from 'next/cache'
import { verifyCreator } from '@/lib/creator-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { removeConnection, refreshAndSync } from '@/lib/instagram-sync'

export type IgActionResult = { ok: true } | { ok: false; message: string }

/**
 * Disconnect Instagram.
 *
 * Deletes the token and the snapshot. The creator's own typed figures are
 * untouched, and the storefront falls back to them automatically because it
 * reads the snapshot first and the typed values second — nothing has to be
 * restored, because nothing was overwritten.
 */
export async function disconnectInstagram(): Promise<IgActionResult> {
  const ctx = await verifyCreator()
  try {
    await removeConnection(ctx.creatorId)
    revalidatePath('/creator/settings')
    revalidatePath('/creator/storefront')
    return { ok: true }
  } catch (err) {
    console.error(`[instagram] disconnect failed creator=${ctx.creatorId}: ${err instanceof Error ? err.message : String(err)}`)
    return { ok: false, message: 'Could not disconnect. Please try again.' }
  }
}

/**
 * Sync now.
 *
 * The cron keeps this current on its own; this is for a creator who has just
 * changed something on Instagram and does not want to wait a day to see it, and
 * for anyone whose account_type changed and needs the status re-read.
 */
export async function resyncInstagram(): Promise<IgActionResult> {
  const ctx = await verifyCreator()
  const admin = createAdminClient()

  const { data } = await admin
    .from('creator_instagram_connections')
    .select('creator_id, token_ciphertext, token_iv, token_tag, key_version, token_expires_at, last_refreshed_at')
    .eq('creator_id', ctx.creatorId)
    .maybeSingle()

  if (!data) return { ok: false, message: 'Instagram is not connected.' }

  const result = await refreshAndSync(data)
  revalidatePath('/creator/settings')
  revalidatePath('/creator/storefront')

  if (!result.ok) {
    // The detail is deliberately shown. "Personal account" and "expired" are
    // things the creator can act on, and a generic failure would leave them
    // pressing the button again.
    return { ok: false, message: `Could not sync: ${result.detail}.` }
  }
  return { ok: true }
}
