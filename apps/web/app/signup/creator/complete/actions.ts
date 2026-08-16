'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeE164 } from '@/lib/phone'

type Result = { status: 'ok' } | { status: 'error'; message: string }

/**
 * Save how this creator wants to be told about their vetting decision.
 *
 * Written against the CREATOR's own row, resolved from the session — never
 * from an id supplied by the caller. A server action is directly callable.
 *
 * Preferences live in users.preferences, the jsonb already holding language
 * and timezone, so this needs no migration. The WhatsApp number is stored
 * separately from creators.phone on purpose: that one is their login identity,
 * and WhatsApp is often on a different number.
 */
export async function saveNotifyPreferences(input: {
  notifyEmail: boolean
  notifyWhatsapp: boolean
  email?: string
  /** Dial code the number was entered under, e.g. "+91". */
  whatsappDialCode?: string
  whatsappPhone?: string
}): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Not signed in.' }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('users').select('id, preferences').eq('auth_id', user.id).maybeSingle()
  if (!profile) return { status: 'error', message: 'Profile not found.' }

  const { data: creator } = await admin
    .from('creators').select('id').eq('user_id', profile.id).maybeSingle()
  if (!creator) return { status: 'error', message: 'Creator profile not found.' }

  // Re-validate server-side; the form checks are convenience.
  let whatsappPhone: string | null = null
  if (input.whatsappPhone) {
    // E.164, not the Indian rule: this is a WhatsApp recipient, not a login
    // identity, and it only has to be somewhere WhatsApp reaches.
    whatsappPhone = normalizeE164(input.whatsappDialCode ?? '+91', input.whatsappPhone)
    if (!whatsappPhone) {
      return { status: 'error', message: 'Enter a valid WhatsApp number for the country code selected.' }
    }
  }

  let email: string | null = null
  if (input.email) {
    email = input.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return { status: 'error', message: 'Enter a valid email address.' }
    }
  }

  const prefs = { ...((profile.preferences ?? {}) as Record<string, unknown>) }
  prefs.notify_email = input.notifyEmail
  prefs.notify_whatsapp = input.notifyWhatsapp
  if (whatsappPhone) prefs.whatsapp_phone = whatsappPhone

  const { error: prefErr } = await admin
    .from('users').update({ preferences: prefs }).eq('id', profile.id)
  if (prefErr) return { status: 'error', message: 'Could not save preferences.' }

  // contact_email is the address we notify on, kept distinct from the auth
  // identity: a creator who signed in with Google may still want mail
  // elsewhere. Only set when they gave one, so this never clears an existing.
  if (email) {
    await admin.from('creators').update({ contact_email: email }).eq('id', creator.id)
    const { data: u } = await admin.from('users').select('email').eq('id', profile.id).maybeSingle()
    if (!u?.email) await admin.from('users').update({ email }).eq('id', profile.id)
  }

  await admin.from('events').insert({
    event_type: 'creator.notify_prefs_saved',
    detail: {
      creator_id: creator.id,
      notify_email: input.notifyEmail,
      notify_whatsapp: input.notifyWhatsapp,
      added_email: Boolean(email),
      added_whatsapp: Boolean(whatsappPhone),
    },
  })

  return { status: 'ok' }
}
