import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { creatorLoginUrl } from '@/lib/safe-next'

/**
 * The path currently being rendered, from the `x-pathname` request header set
 * by middleware. Server components have no other way to read it.
 *
 * Returns null in contexts where the header is absent (e.g. a server action),
 * which callers should treat as "no specific destination".
 */
export function currentPath(): string | null {
  return headers().get('x-pathname')
}

interface CreatorContext {
  userId: string
  profileId: string
  creatorId: string
  creatorName: string
}

/**
 * Verify the current session belongs to a creator with a claimed profile.
 * Returns creator context if authorized; redirects otherwise.
 *
 * `next` is where the creator should land after signing in. It defaults to the
 * path being rendered, so creators arriving at a deal link from WhatsApp —
 * whose in-app browser has its own cookie jar, making "logged out on a deep
 * link" the norm rather than an edge case — return to the deal they tapped
 * instead of being dropped on the deals list.
 *
 * Note the `/creator` LAYOUT gates first and redirects on its own; this is the
 * fallback for any creator route rendered outside that layout.
 */
export async function verifyCreator(next?: string): Promise<CreatorContext> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(creatorLoginUrl(next ?? currentPath()))

  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (!profile) redirect('/')

  const { data: creator } = await supabase
    .from('creators')
    .select('id, full_name')
    .eq('user_id', profile.id)
    .maybeSingle()

  if (!creator) redirect('/')

  return {
    userId: user.id,
    profileId: profile.id,
    creatorId: creator.id,
    creatorName: creator.full_name,
  }
}
