import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client — bypasses ALL RLS.
 * The `import 'server-only'` above causes a hard build error if this file
 * is ever imported from a Client Component or any browser bundle.
 *
 * Import ONLY in Server Actions and Route Handlers.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
