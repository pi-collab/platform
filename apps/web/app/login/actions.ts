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

export async function signInWithEmail(email: string, password: string) {
  const supabase = createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    if (error.message.includes('Email not confirmed')) {
      return { status: 'error' as const, message: 'Please confirm your email first. Check your inbox.' }
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
