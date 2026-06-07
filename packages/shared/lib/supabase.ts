import { createClient } from '@supabase/supabase-js'

// Reads NEXT_PUBLIC_* (web) or EXPO_PUBLIC_* (creator app).
// Same Supabase URL and anon key values — different prefixes required by each framework.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  ''

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  ''

// Anon client — safe for both web (browser) and Expo (app).
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Service-role client — server-side ONLY (Next.js API routes / server components).
// The service-role key bypasses all RLS. NEVER import this in the Expo app or any client bundle.
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. This client is server-side only.'
    )
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}
