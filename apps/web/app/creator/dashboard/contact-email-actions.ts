'use server'

import { revalidatePath } from 'next/cache'
import { verifyCreator } from '@/lib/creator-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPlausibleEmail } from '@/lib/email'

/**
 * Save the address a creator typed into the dashboard prompt.
 *
 * ── Writes contact_email, never users.email ─────────────────────────────────
 * users.email is the auth identity. A creator who signs up by phone holds a
 * minted `@auth.guapd.internal` address there, and overwriting it to make
 * email work would quietly change what they log in as. contact_email is the
 * column that exists for precisely this, and the one the sender reads first.
 */
export async function saveContactEmail(raw: string): Promise<{ ok: boolean; message?: string }> {
  const { creatorId } = await verifyCreator()

  const email = raw.trim().toLowerCase()

  // isPlausibleEmail, not a looser check of our own: it is the same gate the
  // sender applies, so anything accepted here is something we can actually
  // send to. It also rejects our own synthetic domain, which is the one
  // address a confused creator could copy out of an older build's UI.
  if (!isPlausibleEmail(email)) {
    return { ok: false, message: 'That doesn’t look like an email address.' }
  }

  const admin = createAdminClient()

  const { error } = await admin
    .from('creators')
    .update({ contact_email: email })
    .eq('id', creatorId)

  if (error) {
    console.error(`[contact-email] save failed creator=${creatorId}: ${error.message}`)
    return { ok: false, message: 'Couldn’t save that. Try again in a moment.' }
  }

  // Recorded so "is the prompt working?" is a query rather than a hunch, and so
  // an address that appears without a creator remembering typing it has a
  // provenance. Logged and swallowed on failure, deliberately: the address is
  // already saved, and failing the action over its audit row would tell the
  // creator their email did not save when it did. (The must-fail-loudly rule in
  // CLAUDE.md covers ops_events on ops actions; this is neither.)
  try {
    await admin.from('events').insert({
      event_type: 'creator.contact_email_added',
      detail: { creator_id: creatorId, source: 'dashboard_prompt' },
    })
  } catch (err) {
    console.error(`[contact-email] could not record event creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`)
  }

  revalidatePath('/creator/dashboard')
  revalidatePath('/creator/settings')
  return { ok: true }
}
