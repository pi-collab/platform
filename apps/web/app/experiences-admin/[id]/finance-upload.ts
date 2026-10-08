import { createClient as createBrowserClient } from '@/lib/supabase/client'
import type { FinanceUploadKind } from '@/lib/experience-console-server'
import { openFinanceFile, startFinanceUpload } from '../actions'

/**
 * Upload a proof or certificate to the private finance bucket: the database
 * names the path (experience_finance_upload_slot, 0540), the server signs an
 * upload for exactly that path, and the browser sends the file there. The
 * record call that follows checks the file is really at a path of that kind
 * for that invoice / payout / brand.
 */
export async function uploadFinanceFile(kind: FinanceUploadKind, targetId: string, file: File): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: 'The file is over 20 MB.' }
  const slot = await startFinanceUpload(kind, targetId, file.name)
  if (!slot.ok) return slot
  const { error } = await createBrowserClient().storage.from('finance-docs')
    .uploadToSignedUrl(slot.data.path, slot.data.token, file, { contentType: file.type || undefined })
  if (error) return { ok: false, error: error.message || 'Upload failed. Try again.' }
  return { ok: true, path: slot.data.path }
}

/** Open a finance file in a new tab through a 10-minute link. */
export async function openFinanceFileInTab(kind: Parameters<typeof openFinanceFile>[0], id: string): Promise<string | null> {
  const w = window.open('', '_blank')
  const r = await openFinanceFile(kind, id)
  if (!r.ok) { w?.close(); return r.error }
  if (w) w.location.href = r.data; else window.location.href = r.data
  return null
}
