import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Store a delivered post's thumbnail as ours.
 *
 * Instagram serves thumbnails from a signed CDN URL that expires. A deal's
 * analytics screen is looked at weeks and months after delivery — when a brand
 * is deciding whether to book the same creator again — so a stored link would
 * be a broken image at exactly the moment the screen matters most.
 *
 * Keyed on media id, so re-resolving the same post overwrites rather than
 * accumulating, and one post costs one file however many times it is refreshed.
 */

const BUCKET = 'storefronts'
const MAX_BYTES = 3 * 1024 * 1024

export async function storePostThumbnail(
  creatorId: string,
  mediaId: string,
  sourceUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) return null

    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null

    const path = `deal-posts/${creatorId}/${mediaId}.jpg`
    const admin = createAdminClient()

    const { error } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { upsert: true, contentType })

    if (error) {
      console.error(`[deal-post] thumbnail upload failed media=${mediaId}: ${error.message}`)
      return null
    }

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
    return data.publicUrl
  } catch (err) {
    // A thumbnail is worth having, not worth failing a deliverable over.
    console.error(`[deal-post] thumbnail copy threw media=${mediaId}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}
