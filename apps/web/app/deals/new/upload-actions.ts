'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import { randomUUID } from 'crypto'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB
const BUCKET = 'deal-files'

export async function uploadBriefAttachment(formData: FormData) {
  const brand = await verifyApprovedBrand()

  const file = formData.get('file') as File | null
  if (!file) return { error: 'No file provided.' }

  if (file.size > MAX_FILE_SIZE) {
    return { error: 'File too large. Maximum size is 50 MB.' }
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `briefs/${brand.brandId}/${randomUUID()}.${ext}`

  const admin = createAdminClient()
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
    })

  if (uploadErr) {
    console.error('[brief-attachment] Upload failed:', uploadErr.message)
    return { error: 'Upload failed. Please try again.' }
  }

  return {
    attachment: {
      name: safeFileName,
      storage_path: storagePath,
      size_bytes: file.size,
      content_type: file.type,
    },
  }
}

export async function removeBriefAttachment(storagePath: string) {
  await verifyApprovedBrand()

  const admin = createAdminClient()
  await admin.storage.from(BUCKET).remove([storagePath])

  return { success: true }
}
