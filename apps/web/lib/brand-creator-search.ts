import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Creators a brand can name for its Experience roster (0557): the same
 * bookable, non-house creators /browse lists to every brand, by name or handle.
 * Service role with the filters written out (as /browse), and only the fields
 * a picker shows: never rates, contact details or audience data.
 */
export interface BrandCreatorHit { id: string; full_name: string; handle: string | null; photo_url: string | null }

export async function searchBookableCreators(query: string): Promise<BrandCreatorHit[]> {
  const q = query.trim().replace(/^@/, '').replace(/[%_,()*\\]/g, '').slice(0, 60)
  if (q.length < 2) return []
  const { data } = await createAdminClient()
    .from('creators')
    .select('id, full_name, handle, profile_photo_url')
    .eq('is_bookable', true)
    .eq('is_guapd', false)
    .or(`full_name.ilike.%${q}%,handle.ilike.%${q}%`)
    .order('full_name', { ascending: true })
    .limit(12)
  return (data ?? []).map((c) => ({
    id: c.id as string, full_name: (c.full_name as string) ?? 'Creator',
    handle: (c.handle as string | null)?.replace(/^@/, '') || null, photo_url: (c.profile_photo_url as string | null) ?? null,
  }))
}
