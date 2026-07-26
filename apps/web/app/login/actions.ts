'use server'

import { createClient } from '@/lib/supabase/server'
import { ensureBrandUserRow } from '@/lib/ensure-brand-user'

export async function signUpWithEmail(email: string, password: string) {
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

export async function resetPassword(email: string) {
  const supabase = createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
  })

  if (error) {
    return { status: 'error' as const, message: error.message }
  }

  // Always show success to prevent email enumeration
  return { status: 'ok' as const }
}
