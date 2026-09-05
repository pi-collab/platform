'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureBrandUserRow } from '@/lib/ensure-brand-user'
import { validateWorkEmail } from '@/lib/work-email'
import { opsRoutingEmails } from '@/lib/ops-capabilities'

/**
 * Shown when signup hits an address that already has an account and the
 * password given does not match it.
 *
 * DELIBERATE ENUMERATION TRADE-OFF (product decision, not an oversight):
 * this confirms to anyone who asks that a given address is registered with
 * Guapd. Supabase obfuscates it by default for exactly that reason. We reveal
 * it because the alternative strands a returning brand on a screen telling
 * them to check an inbox that will never receive anything, and because the
 * signup surface is work-email-only, which narrows the address space an
 * attacker can meaningfully probe. It does not eliminate it.
 */
const EXISTS_MESSAGE =
  'An account with this email already exists. Log in instead, or reset your password if you have forgotten it.'

/**
 * Where a signup confirmation link lands.
 *
 * /auth/confirm, NOT /auth/callback: the callback exchanges a PKCE code, which
 * needs the code_verifier cookie from the browser that started signup, so it
 * fails whenever the email is opened on another device. That failure still
 * marks the email confirmed upstream, stranding a confirmed account that has
 * never been signed in.
 *
 * signUp and resendConfirmation MUST use this same value. If they diverge, the
 * resent link behaves differently from the original for no visible reason.
 */
function authEmailOrigin(): string {
  // Derived from the REQUEST, not NEXT_PUBLIC_SITE_URL, because that variable
  // holds one value per environment and gets the answer wrong exactly where it
  // hurts: a staging build carrying the production URL sends a tester's
  // confirmation link to guapd.com, where the account does not exist. Deriving
  // it means localhost, staging and production are each self-consistent with
  // no per-environment configuration to keep in sync.
  //
  // Host headers are client-supplied, so this is not trusted on its own. The
  // security boundary is Supabase's redirect allowlist: a forged host produces
  // a redirect Supabase refuses, falling back to the configured Site URL. Any
  // origin used here must therefore be on that allowlist.
  const h = headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (host) {
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
}

function confirmRedirectUrl(): string {
  return `${authEmailOrigin()}/auth/confirm?next=${encodeURIComponent('/onboarding')}`
}

export async function signUpWithEmail(email: string, password: string) {
  // Brands must use a work address. Enforced HERE, not just in the form —
  // client validation is a convenience, a server action is the boundary.
  // Signup only: existing accounts on free providers keep working.
  const emailCheck = validateWorkEmail(email, opsRoutingEmails())
  if (!emailCheck.ok) {
    return { status: 'error' as const, message: emailCheck.message }
  }

  const supabase = createClient()

  // ── Try signing in FIRST ────────────────────────────────────────────────────
  // Someone submitting the signup form with credentials that already work is
  // a returning user who forgot they had an account, not an error. Sign them
  // in and let them through.
  //
  // Order matters: doing this before signUp avoids provoking a spurious
  // "someone tried to sign up with your email" mail for an existing account,
  // and means the common returning-user case never touches the mail system.
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

  if (!signInError) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await ensureBrandUserRow(supabase, user.id, user.email)
    return { status: 'signed_in' as const, message: '' }
  }

  // Right password, unconfirmed account: definitely theirs, so treat it as the
  // verification flow rather than a failed signup.
  if (signInError.code === 'email_not_confirmed' || signInError.message.includes('Email not confirmed')) {
    return {
      status: 'confirm' as const,
      message: 'Check your email for a confirmation link.',
    }
  }

  // Anything else is ambiguous — no account, or an account with a different
  // password. signUp below is what distinguishes them.

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: confirmRedirectUrl() },
  })

  if (error) {
    if (error.message.includes('already registered')) {
      return { status: 'exists' as const, message: EXISTS_MESSAGE }
    }
    return { status: 'error' as const, message: error.message }
  }

  // ── Detecting an existing account ───────────────────────────────────────────
  // With email confirmation on, Supabase does NOT error for an address that is
  // already registered. It returns a fabricated user id, a null session, and an
  // EMPTY identities array — deliberate anti-enumeration obfuscation. The empty
  // array is the documented signal, and the only one available without a
  // service-role lookup.
  //
  // Verified against the live project: signing up an existing confirmed address
  // returns error=none, a user id that matches no real row, and identities=[].
  //
  // Without this check the caller sees the success shape and tells the user to
  // check an inbox that will never receive anything, because Supabase sent no
  // mail. That silent dead-end is the whole reason for this branch.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    return { status: 'exists' as const, message: EXISTS_MESSAGE }
  }

  // With mailer_autoconfirm=false, user must confirm email before they can log in.
  return { status: 'confirm' as const, message: 'Check your email for a confirmation link.' }
}

/**
 * Resend the signup confirmation email.
 *
 * Without this, an unconfirmed account whose email never arrived (spam filter,
 * typo'd inbox, or the project-wide send rate limit) is stranded: login says
 * "confirm your email" about a message that does not exist, and signing up
 * again reports the address is already registered.
 *
 * NEVER reveals whether the address has an account. The response is identical
 * for a real unconfirmed user, an already-confirmed user, and an address that
 * was never registered — otherwise this becomes an account-enumeration oracle,
 * which is worse than the problem it solves. That is also why it cannot say
 * "no account found": the deliberate cost is that a typo'd address gets the
 * same reassuring message as a real one.
 *
 * Uses the same confirmRedirectUrl() as signUp, so a resent link behaves
 * identically to the original.
 */
export async function resendConfirmation(email: string) {
  const trimmed = email.trim()
  if (!trimmed) {
    return { status: 'error' as const, message: 'Enter your email address first.' }
  }

  const supabase = createClient()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: trimmed,
    options: { emailRedirectTo: confirmRedirectUrl() },
  })

  if (error) {
    // Surfaced honestly: the user just pressed a button and needs to know
    // whether to wait or keep trying. Silently claiming success here would
    // have them waiting on an email the server already refused to send.
    if (error.code === 'over_email_send_rate_limit') {
      return {
        status: 'error' as const,
        message: 'Too many emails sent just now. Wait a few minutes and try again.',
      }
    }
    // Any other failure is ours, not theirs. Log it; do not leak the detail,
    // since it can differ by whether the account exists.
    console.error(`[auth] resendConfirmation failed: ${error.code ?? ''} ${error.message}`)
    return {
      status: 'error' as const,
      message: 'Could not send the email right now. Try again in a moment.',
    }
  }

  return {
    status: 'sent' as const,
    message: 'Sent. Check your inbox, and your spam folder.',
  }
}

/**
 * Does an account exist for this address?
 *
 * Two sources, cheapest first:
 *   1. our `users` table — indexed, one row, covers every normal account
 *   2. auth.users — authoritative, and the only place an account shows up if it
 *      confirmed but never completed a sign-in. That state is not theoretical:
 *      social@guapd.com sat in it for an hour today, before signup confirmation
 *      started creating the row.
 *
 * The fallback only runs when step 1 finds nothing, which is precisely the case
 * we must not get wrong — telling a real user "no account" sends them to signup,
 * where they are told the account already exists, and the loop closes.
 *
 * The listUsers page cap is 1000. Beyond that this needs an indexed lookup
 * (a SECURITY DEFINER function over auth.users), so it warns rather than
 * silently starting to report real accounts as missing.
 */
async function brandAccountExists(email: string): Promise<boolean> {
  const admin = createAdminClient()

  const { data: row } = await admin
    .from('users').select('id').ilike('email', email).maybeSingle()
  if (row) return true

  const { data: list, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) {
    console.error(`[auth] brandAccountExists lookup failed: ${error.message}`)
    return false
  }
  if (list.users.length >= 1000) {
    console.warn('[auth] brandAccountExists hit the 1000-user page cap, needs an indexed lookup')
  }
  const target = email.trim().toLowerCase()
  return list.users.some((u: { email?: string }) => u.email?.toLowerCase() === target)
}

export async function signInWithEmail(email: string, password: string) {
  const supabase = createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    // Match on the stable error CODE, not the prose. Keep the message check as
    // a fallback for older GoTrue responses that predate codes: if this ever
    // stops matching, an unconfirmed user silently gets told "invalid email or
    // password" and has no idea the real problem is their inbox.
    if (error.code === 'email_not_confirmed' || error.message.includes('Email not confirmed')) {
      return {
        status: 'unconfirmed' as const,
        message: 'Confirm your email before logging in. Check your inbox for the link.',
      }
    }
    // Supabase returns invalid_credentials for BOTH a wrong password and an
    // address with no account, on purpose. We separate them.
    //
    // This reveals whether an account exists — but signup already does, by
    // explicit decision (see EXISTS_MESSAGE). Withholding it HERE would protect
    // nothing, since the same attacker can just ask the signup form; it would
    // only mean the honest user gets less help than the attacker.
    if (await brandAccountExists(email)) {
      return {
        status: 'wrong_password' as const,
        message: 'That password is not right. Try again, or reset it.',
      }
    }

    return {
      status: 'no_account' as const,
      message: 'No account found for this email. Check the address, or create an account.',
    }
  }

  // Session established — ensure users row exists (same logic as OAuth callback)
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await ensureBrandUserRow(supabase, user.id, user.email)
  }

  return { status: 'ok' as const }
}

/**
 * Send a password-reset link.
 *
 * Lands on /auth/confirm (token_hash + verifyOtp), NOT /auth/callback.
 * /auth/callback exchanges a PKCE code, which needs the code_verifier cookie
 * from the browser that requested the reset — so it fails whenever someone
 * requests on a laptop and opens the email on their phone. It also would only
 * sign them in, leaving the old password unchanged.
 *
 * Requires the Supabase "Reset Password" email template to send
 * {{ .TokenHash }}, and /auth/confirm to be on the redirect allowlist.
 */
export async function resetPassword(email: string) {
  const supabase = createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${authEmailOrigin()}/auth/confirm?next=${encodeURIComponent('/reset-password')}`,
  })

  if (error) {
    return { status: 'error' as const, message: error.message }
  }

  // Always show success to prevent email enumeration
  return { status: 'ok' as const }
}
