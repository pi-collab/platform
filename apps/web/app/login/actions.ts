'use server'

import { createClient } from '@/lib/supabase/server'
import { ensureBrandUserRow } from '@/lib/ensure-brand-user'
import { validateWorkEmail } from '@/lib/work-email'

export async function signUpWithEmail(email: string, password: string) {
  // Brands must use a work address. Enforced HERE, not just in the form —
  // client validation is a convenience, a server action is the boundary.
  // Signup only: existing accounts on free providers keep working.
  const emailCheck = validateWorkEmail(email, process.env.OPS_ALLOWED_EMAILS)
  if (!emailCheck.ok) {
    return { status: 'error' as const, message: emailCheck.message }
  }

  const supabase = createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) {
    if (error.message.includes('already registered')) {
      return { status: 'error' as const, message: 'This email is already registered. Try logging in.' }
    }
    return { status: 'error' as const, message: error.message }
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
 * No emailRedirectTo, matching signUp above, so both links land on the same
 * configured Site URL. If one gains a redirect, the other must too.
 */
export async function resendConfirmation(email: string) {
  const trimmed = email.trim()
  if (!trimmed) {
    return { status: 'error' as const, message: 'Enter your email address first.' }
  }

  const supabase = createClient()
  const { error } = await supabase.auth.resend({ type: 'signup', email: trimmed })

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
    return { status: 'error' as const, message: 'Invalid email or password.' }
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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent('/reset-password')}`,
  })

  if (error) {
    return { status: 'error' as const, message: error.message }
  }

  // Always show success to prevent email enumeration
  return { status: 'ok' as const }
}
