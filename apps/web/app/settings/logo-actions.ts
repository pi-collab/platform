'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyBrand } from '@/lib/brand-auth'
import { revalidatePath } from 'next/cache'

/**
 * A brand's logo.
 *
 * brands.logo_url has existed for a while and nothing ever wrote it: the
 * settings page selected the column and rendered nothing, so a logo could only
 * be set by ops with database access.
 *
 * Deliberately the same shape as the creator's avatar action next door,
 * including the version stamp - the path upserts, so replacing a logo with
 * another of the same type writes the SAME public url, and both the browser and
 * the CDN go on serving the first one. That reads as "upload does nothing"
 * rather than as a failure, because the upload did work.
 */

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB, the limit everywhere but deliverables
const BUCKET = 'storefronts'

export async function uploadBrandLogo(formData: FormData) {
  const brand = await verifyBrand()

  const file = formData.get('file') as File | null
  if (!file) return { error: 'No file provided.' }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: 'That file type is not supported. Use a JPEG, PNG, WebP or SVG.' }
  }
  if (file.size > MAX_FILE_SIZE) {
    return { error: `That logo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 50 MB, so please pick a smaller one and try again.` }
  }

  const ext = file.type === 'image/svg+xml' ? 'svg' : (file.name.split('.').pop()?.toLowerCase() || 'png')
  const storagePath = `brand-logos/${brand.brandId}/logo.${ext}`
  if (!storagePath.startsWith(`brand-logos/${brand.brandId}/`)) {
    return { error: 'Invalid upload path.' }
  }

  const admin = createAdminClient()
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: true, contentType: file.type })

  if (uploadErr) {
    console.error('[brand-logo] Upload failed:', uploadErr.message)
    return { error: 'That upload did not go through. Please try again.' }
  }

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(storagePath)
  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`

  /* Admin client, matching updateProfile next door: every brands write on this
     page goes through the service role. There is no UPDATE policy on brands for
     a member, so the RLS client matches zero rows and reports success. */
  const { error: updateErr } = await admin
    .from('brands')
    .update({ logo_url: publicUrl })
    .eq('id', brand.brandId)

  if (updateErr) {
    console.error('[brand-logo] DB update failed:', updateErr.message)
    return { error: 'The logo uploaded but saving it failed. Please try again.' }
  }

  revalidatePath('/settings')
  revalidatePath('/dashboard', 'layout')
  return { url: publicUrl }
}

export async function removeBrandLogo() {
  const brand = await verifyBrand()

  const { error } = await createAdminClient()
    .from('brands')
    .update({ logo_url: null })
    .eq('id', brand.brandId)

  if (error) {
    console.error('[brand-logo] Remove failed:', error.message)
    return { error: 'Could not remove the logo. Please try again.' }
  }

  revalidatePath('/settings')
  revalidatePath('/dashboard', 'layout')
  return { success: true }
}
