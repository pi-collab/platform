import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client.
 * Use in Client Components ('use client'). Reads the session from cookies
 * automatically — no manual token management needed.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
