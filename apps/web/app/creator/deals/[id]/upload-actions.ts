'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const ALLOWED_EXTENSIONS = new Set([
  'mp4', 'mov', 'webm', 'avi',
  'jpg', 'jpeg', 'png', 'webp', 'gif',
  'pdf',
  'mp3', 'wav', 'm4a',
  'zip',
])

type UploadResult =
  | { status: 'success'; path: string; version: number }
  | { status: 'error'; message: string }

type SignedUrlResult =
  | { status: 'success'; url: string }
  | { status: 'error'; message: string }

type SimpleResult =
  | { status: 'success' }
  | { status: 'error'; message: string }

/**
 * Validate deal ownership + return the storage path for client-side upload.
 * Called BEFORE upload starts so the client knows where to upload.
 */
export async function getUploadPath(dealId: string, itemId: string): Promise<UploadResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Not authenticated.' }

  // RLS restricts to creator's own deals
  const { data: deal } = await supabase
    .from('deals')
    .select('id, status')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (deal.status !== 'agreed' && deal.status !== 'revision') {
    return { status: 'error', message: `Cannot submit when deal status is "${deal.status}".` }
  }

  const { data: item } = await supabase
    .from('deal_deliverable_items')
    .select('id, item_status, version')
    .eq('id', itemId)
    .eq('deal_id', dealId)
    .maybeSingle()

  if (!item) return { status: 'error', message: 'Item not found.' }
  if (item.item_status !== 'pending' && item.item_status !== 'revision') {
    return { status: 'error', message: `Cannot submit an item that is "${item.item_status}".` }
  }

  const nextVersion = item.item_status === 'revision' ? item.version + 1 : item.version
  // Path: {deal_id}/{item_id}/v{version}/ — filename appended by client
  const path = `${dealId}/${itemId}/v${nextVersion}`

  return { status: 'success', path, version: nextVersion }
}

/**
 * After successful upload, write storage_path + file_name to the item.
 * Validates file extension server-side before writing.
 */
export async function submitItemWithUpload(
  dealId: string,
  itemId: string,
  storagePath: string,
  fileName: string,
  version: number,
): Promise<SimpleResult> {
  // Server-side file type check
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { status: 'error', message: `File type ".${ext}" is not allowed.` }
  }

  // Validate the storage path matches expected pattern
  if (!storagePath.startsWith(`${dealId}/${itemId}/`)) {
    return { status: 'error', message: 'Invalid storage path.' }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Not authenticated.' }

  // Verify deal is submittable (RLS scopes to creator's deals)
  const { data: deal } = await supabase
    .from('deals')
    .select('id, status')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (deal.status !== 'agreed' && deal.status !== 'revision') {
    return { status: 'error', message: `Cannot submit when deal status is "${deal.status}".` }
  }

  // Verify item is in a submittable state
  const { data: item } = await supabase
    .from('deal_deliverable_items')
    .select('id, item_status')
    .eq('id', itemId)
    .eq('deal_id', dealId)
    .maybeSingle()

  if (!item) return { status: 'error', message: 'Item not found.' }
  if (item.item_status !== 'pending' && item.item_status !== 'revision') {
    return { status: 'error', message: `Cannot submit an item that is "${item.item_status}".` }
  }

  // Write upload info to DB — clears external_url (item is one or the other)
  const { error: updateErr } = await supabase
    .from('deal_deliverable_items')
    .update({
      item_status: 'submitted',
      storage_path: storagePath,
      file_name: fileName,
      external_url: null,
      version,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      revision_note: null,
    })
    .eq('id', itemId)

  if (updateErr) {
    return { status: 'error', message: `Failed to update item: ${updateErr.message}` }
  }

  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}

/**
 * Generate a signed URL for viewing/downloading an uploaded file.
 * Validates deal access via RLS before minting the URL.
 */
export async function getSignedUrl(dealId: string, itemId: string): Promise<SignedUrlResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'Not authenticated.' }

  // RLS ensures only deal parties can read the item
  const { data: item } = await supabase
    .from('deal_deliverable_items')
    .select('storage_path')
    .eq('id', itemId)
    .eq('deal_id', dealId)
    .maybeSingle()

  if (!item) return { status: 'error', message: 'Item not found.' }
  if (!item.storage_path) return { status: 'error', message: 'No uploaded file for this item.' }

  // Use admin client to generate signed URL (bypasses storage policies — we already validated access)
  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from('deliverables')
    .createSignedUrl(item.storage_path, 3600) // 60 minutes

  if (error || !data?.signedUrl) {
    return { status: 'error', message: 'Failed to generate download URL.' }
  }

  return { status: 'success', url: data.signedUrl }
}

/**
 * Delete an orphaned upload if the DB write fails after successful storage upload.
 * Uses admin client (service-role) since there's no SELECT policy on the bucket.
 * If this itself fails, the file is a stray private file — not a data leak.
 */
export async function deleteOrphanedUpload(storagePath: string): Promise<SimpleResult> {
  const admin = createAdminClient()
  const { error } = await admin.storage
    .from('deliverables')
    .remove([storagePath])

  if (error) {
    console.error('[upload] Failed to clean up orphaned file:', storagePath, error.message)
    // Not a leak — file is in a private bucket with no read access
    return { status: 'error', message: 'Cleanup failed (file is private, not accessible).' }
  }

  return { status: 'success' }
}
