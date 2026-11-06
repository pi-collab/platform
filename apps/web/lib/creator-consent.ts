import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * "Product updates on WhatsApp" (0590): optional, unticked by default, never
 * required. creators.whatsapp_updates_consent_at holds the current state (NULL
 * = no consent); every change is logged in creator_consent_log with its time
 * and source. NOTHING sends on it yet: no template, no job reads it.
 * Deal notifications and login codes are separate and unaffected.
 */
export async function setWhatsAppUpdatesConsent(creatorId: string, granted: boolean, source: 'signup' | 'settings'): Promise<{ error?: string }> {
  const admin = createAdminClient()
  const { data: row } = await admin.from('creators').select('whatsapp_updates_consent_at').eq('id', creatorId).maybeSingle()
  const already = !!row?.whatsapp_updates_consent_at
  if (already === granted) return {}
  const { error } = await admin.from('creators').update({ whatsapp_updates_consent_at: granted ? new Date().toISOString() : null }).eq('id', creatorId)
  if (error) return { error: 'Could not save that. Try again.' }
  const { error: logErr } = await admin.from('creator_consent_log').insert({ creator_id: creatorId, consent: 'whatsapp_product_updates', granted, source })
  if (logErr) console.error(`[consent] log failed creator=${creatorId}: ${logErr.message}`)
  return {}
}
