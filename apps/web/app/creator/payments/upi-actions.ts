'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCreator } from '@/lib/creator-auth'

export type UpiResult = { ok: true; upiId: string } | { ok: false; message: string }

/**
 * A UPI ID is `handle@psp`.
 *
 * The handle allows letters, digits, dot, hyphen and underscore; the PSP
 * suffix is alphabetic (okhdfcbank, ybl, paytm, upi…). Deliberately not a list
 * of known PSPs — new ones appear, and rejecting a creator's real address
 * because our list is stale is worse than accepting an odd-looking one.
 *
 * The real check is that money arrives, and that cannot happen here.
 */
const UPI_PATTERN = /^[a-z0-9][a-z0-9._-]{1,80}@[a-z]{2,32}$/i

export async function saveUpiId(raw: string): Promise<UpiResult> {
  const ctx = await verifyCreator()

  // Lowercased: UPI handles are case-insensitive, and storing two casings of
  // the same address makes them look like different accounts in ops.
  const upiId = raw.trim().toLowerCase()

  if (!upiId) return { ok: false, message: 'Enter your UPI ID.' }
  if (upiId.length > 100) return { ok: false, message: 'That UPI ID is too long.' }
  if (!UPI_PATTERN.test(upiId)) {
    return { ok: false, message: 'That does not look like a UPI ID. It should look like yourname@bank.' }
  }

  // Service role: upi_id is withheld from the client roles as PII, so the
  // session client cannot write it either.
  const admin = createAdminClient()
  const { error } = await admin
    .from('creators')
    .update({ upi_id: upiId })
    .eq('id', ctx.creatorId)

  if (error) {
    console.error(`[upi] save failed creator=${ctx.creatorId}: ${error.message}`)
    return { ok: false, message: 'Could not save that. Please try again.' }
  }

  // Audited without the value. That a creator changed where their money goes is
  // worth a record; storing the address twice is not, and the events table is
  // readable in more places than the column is.
  await admin.from('events').insert({
    event_type: 'creator.upi_saved',
    detail: { creator_id: ctx.creatorId, has_upi: true },
  })

  revalidatePath('/creator/payments')
  return { ok: true, upiId }
}
