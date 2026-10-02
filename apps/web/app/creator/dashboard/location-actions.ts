'use server'

import { revalidatePath } from 'next/cache'
import { verifyCreator } from '@/lib/creator-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateLocation, type LocationInput } from '@/lib/creator-location'

/**
 * Save city, state and age bracket from the dashboard prompt.
 *
 * Validated here, not only in the card: a server action is directly callable.
 * Also writes the legacy `location` as "City, State", which AI search and the
 * Growth pool filter read.
 */
export async function saveCreatorLocation(input: LocationInput): Promise<{ ok: boolean; message?: string }> {
  const { creatorId } = await verifyCreator()

  const place = validateLocation(input)
  if (!place.ok) return { ok: false, message: place.error }

  const admin = createAdminClient()
  const { error } = await admin.from('creators').update(place.row).eq('id', creatorId)
  if (error) {
    console.error(`[creator-location] save failed creator=${creatorId}: ${error.message}`)
    return { ok: false, message: 'Couldn’t save that. Try again in a moment.' }
  }

  // Same reasoning as contact-email-actions: so "is the prompt working?" is a
  // query, and logged-and-swallowed because the answer is already saved.
  try {
    await admin.from('events').insert({
      event_type: 'creator.location_added',
      detail: { creator_id: creatorId, source: 'dashboard_prompt' },
    })
  } catch (err) {
    console.error(`[creator-location] could not record event creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`)
  }

  revalidatePath('/creator/dashboard')
  revalidatePath('/creator/settings')
  return { ok: true }
}
