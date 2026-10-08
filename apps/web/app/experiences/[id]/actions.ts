'use server'

import { verifyBrand } from '@/lib/brand-auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Open a file Guapd shared with the brand. brand_experience_release_file
 * (0538) runs with the brand member's own session and returns the path only
 * for a LIVE release on their own brand's Experience; the service role then
 * signs a 10-minute link for exactly that path.
 */
export async function openReleasedFile(releaseId: string): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  await verifyBrand()
  if (typeof releaseId !== 'string' || !/^[0-9a-f-]{36}$/i.test(releaseId)) return { ok: false, message: 'Not found.' }
  const { data, error } = await createClient().rpc('brand_experience_release_file', { p_release_id: releaseId })
  if (error || !data) return { ok: false, message: 'This file is no longer shared.' }
  const path = (data as { storage_path: string }).storage_path
  const signed = await createAdminClient().storage.from('deliverables').createSignedUrl(path, 600)
  if (signed.error || !signed.data) return { ok: false, message: 'Could not open the file. Try again.' }
  return { ok: true, url: signed.data.signedUrl }
}
