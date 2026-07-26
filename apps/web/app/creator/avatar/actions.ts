'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCreator } from '@/lib/creator-auth'
import { revalidatePath } from 'next/cache'

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

const BUCKET = 'storefronts'

export async function uploadAvatar(formData: FormData) {
  const { creatorId } = await verifyCreator()
  const supabase = createClient()

  const file = formData.get('file') as File | null
  if (!file) return { error: 'No file provided.' }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: 'Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.' }
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    return { error: 'File too large. Maximum size is 5 MB.' }
  }

  // Build storage path — scoped to avatars/{creatorId}/
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const storagePath = `avatars/${creatorId}/avatar.${ext}`

  // Validate path is inside expected prefix
  if (!storagePath.startsWith(`avatars/${creatorId}/`)) {
    return { error: 'Invalid upload path.' }
  }

  // Upload via admin client (no storage RLS policies on this bucket;
  // auth is already verified by verifyCreator above)
  const admin = createAdminClient()
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      upsert: true,
      contentType: file.type,
    })

  if (uploadErr) {
    console.error('[avatar] Upload failed:', uploadErr.message)
    return { error: 'Upload failed. Please try again.' }
  }

  // Get public URL
  const { data: urlData } = admin.storage
    .from(BUCKET)
    .getPublicUrl(storagePath)

  const publicUrl = urlData.publicUrl

  // Update creators.profile_photo_url
  const { error: updateErr } = await supabase
    .from('creators')
    .update({ profile_photo_url: publicUrl })
    .eq('id', creatorId)

  if (updateErr) {
    console.error('[avatar] DB update failed:', updateErr.message)
    return { error: 'Photo uploaded but profile update failed. Please try again.' }
  }

  revalidatePath('/creator', 'layout')
  return { url: publicUrl }
}

export async function removeAvatar() {
  const { creatorId } = await verifyCreator()
  const supabase = createClient()

  const { error } = await supabase
    .from('creators')
    .update({ profile_photo_url: null })
    .eq('id', creatorId)

  if (error) {
    console.error('[avatar] Remove failed:', error.message)
    return { error: 'Failed to remove photo.' }
  }

  revalidatePath('/creator', 'layout')
  return { success: true }
}
