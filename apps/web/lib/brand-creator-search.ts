import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Creators a brand can add to its Experience roster (0557): the same bookable,
 * non-house creators /browse lists to every brand. Service role with the
 * filters written out (as /browse), and only the fields the shared picker
 * (components/AddCreatorsModal) shows: never rates, contact details or
 * audience data.
 */
export interface BrandPickerCreator { id: string; full_name: string; handle: string | null; profile_photo_url: string | null; niches: string[] | null }

export async function listBookableCreators(): Promise<BrandPickerCreator[]> {
  const { data } = await createAdminClient()
    .from('creators')
    .select('id, full_name, handle, profile_photo_url, niches')
    .eq('is_bookable', true)
    .eq('is_guapd', false)
    .order('full_name', { ascending: true })
  return (data ?? []).map((c) => ({
    id: c.id as string, full_name: (c.full_name as string) ?? 'Creator',
    handle: (c.handle as string | null)?.replace(/^@/, '') || null,
    profile_photo_url: (c.profile_photo_url as string | null) ?? null,
    niches: Array.isArray(c.niches) ? (c.niches as string[]) : null,
  }))
}
