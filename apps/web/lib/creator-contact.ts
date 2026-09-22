import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPlausibleEmail } from '@/lib/email'

/**
 * Where a creator's email address comes from, and whether we have one at all.
 *
 * ── Why this is its own module ──────────────────────────────────────────────
 * Two callers need the SAME answer for opposite reasons: account-emails asks
 * "where do I send this", and the dashboard prompt asks "should I ask them for
 * one". A second copy of the resolution order would drift, and it would fail
 * silently in both directions — a creator nagged for an address we already
 * hold, or an email skipped for one we could have found.
 *
 * ── The resolution order ────────────────────────────────────────────────────
 * contact_email first: it is the address the creator gave us for exactly this.
 * users.email second, and only when it is real — a creator who signed up by
 * phone has a minted `@auth.guapd.internal` address that hard-bounces, so it
 * is not an address, it is a GoTrue requirement wearing one. Signing up with
 * Google is the case where users.email is genuinely theirs.
 *
 * ── Both candidates go through isPlausibleEmail ─────────────────────────────
 * Which is a change: contact_email used to be returned exactly as stored, so a
 * typo'd address was handed to Resend and bounced, and a bounce costs sending
 * reputation. Anything unusable now reads as "no address", which is both true
 * and the state the dashboard prompt knows how to fix.
 */
export interface CreatorEmail {
  /** A deliverable address, or null when we hold nothing worth sending to. */
  email: string | null
  /** First name, or 'there'. Callers greet with this. */
  name: string
}

export async function resolveCreatorEmail(creatorId: string): Promise<CreatorEmail> {
  const admin = createAdminClient()

  const { data: creator } = await admin
    .from('creators')
    .select('full_name, contact_email, user_id')
    .eq('id', creatorId)
    .maybeSingle()

  if (!creator) return { email: null, name: 'there' }

  let email = isPlausibleEmail(creator.contact_email) ? creator.contact_email : null

  if (!email && creator.user_id) {
    const { data: u } = await admin
      .from('users').select('email').eq('id', creator.user_id).maybeSingle()
    if (isPlausibleEmail(u?.email)) email = u.email
  }

  return { email, name: creator.full_name?.split(' ')[0] || 'there' }
}

/**
 * Whether we could email this creator today.
 *
 * Read on every creator dashboard load to decide if the prompt shows, so it is
 * deliberately the same question the sender asks — the prompt disappears
 * exactly when a send would start working, and never before.
 */
export async function hasCreatorEmail(creatorId: string): Promise<boolean> {
  const { email } = await resolveCreatorEmail(creatorId)
  return email !== null
}
