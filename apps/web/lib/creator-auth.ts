import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

interface CreatorContext {
  userId: string
  profileId: string
  creatorId: string
  creatorName: string
}

/**
 * Verify the current session belongs to a creator with a claimed profile.
 * Returns creator context if authorized; redirects otherwise.
 */
export async function verifyCreator(): Promise<CreatorContext> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

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
