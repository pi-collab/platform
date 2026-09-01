import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken, encryptToken } from '@/lib/instagram-token'
import { buildSnapshot, refreshLongLivedToken, fetchReelCandidates, fetchReelById, type IgSnapshot, type IgMediaItem } from '@/lib/instagram'
import { mergeSocialAccounts } from '@/lib/social-accounts'

/**
 * Reading, refreshing and syncing Instagram connections.
 *
 * Everything here uses the service role. creator_instagram_connections denies
 * all client access, so this file is the only way in, and nothing it returns
 * to a caller includes the token.
 */

export type IgStatus = 'not_connected' | 'connected' | 'expired' | 'needs_reconnect' | 'personal_account'

/** What the UI is allowed to see. Note the absence of any token field: this
 *  shape is what makes "no client ever reads the token" true by construction
 *  rather than by remembering. */
export interface IgConnectionView {
  status: IgStatus
  username?: string
  accountType?: string
  lastSyncedAt?: string
  tokenExpiresAt?: string
  syncError?: string
  snapshot?: IgSnapshot
}

const SAFE_COLUMNS = 'status, username, account_type, last_synced_at, token_expires_at, sync_error, snapshot'

/** The connection as the creator's own settings page sees it. */
export async function getConnection(creatorId: string): Promise<IgConnectionView> {
  const { data } = await createAdminClient()
    .from('creator_instagram_connections')
    .select(SAFE_COLUMNS)
    .eq('creator_id', creatorId)
    .maybeSingle()

  // No row means not connected. That is the whole representation of the state;
  // there is deliberately no 'not_connected' row to keep in sync with nothing.
  if (!data) return { status: 'not_connected' }

  return {
    status: data.status as IgStatus,
    username: data.username ?? undefined,
    accountType: data.account_type ?? undefined,
    lastSyncedAt: data.last_synced_at ?? undefined,
    tokenExpiresAt: data.token_expires_at ?? undefined,
    syncError: data.sync_error ?? undefined,
    snapshot: (data.snapshot ?? undefined) as IgSnapshot | undefined,
  }
}

/**
 * The verified snapshot for a PUBLIC storefront.
 *
 * Only returns anything when the connection is healthy. A stale or broken
 * connection shows the creator's typed figures rather than numbers we can no
 * longer stand behind.
 */
export async function getPublicSnapshot(creatorId: string): Promise<IgSnapshot | null> {
  const { data } = await createAdminClient()
    .from('creator_instagram_connections')
    .select('status, snapshot')
    .eq('creator_id', creatorId)
    .maybeSingle()
  if (!data || data.status !== 'connected' || !data.snapshot) return null
  return data.snapshot as IgSnapshot
}

/**
 * Flag the Instagram entry in social_accounts as connected.
 *
 * MERGED, never assigned. That array carries keys owned by four different
 * screens, and rebuilding it from one screen's fields deletes the rest — the
 * bug that silently wiped follower ranges and only surfaced when a creator went
 * missing from an ops filter.
 */
export async function markChannelConnected(creatorId: string, username: string): Promise<void> {
  const admin = createAdminClient()
  const { data } = await admin.from('creators').select('social_accounts').eq('id', creatorId).maybeSingle()
  const existing = (data?.social_accounts ?? []) as Record<string, unknown>[]

  const incoming = existing.map(a =>
    String(a.platform ?? '').toLowerCase() === 'instagram'
      ? { platform: a.platform, handle: a.handle, connected: true, connected_username: username }
      : { platform: a.platform, handle: a.handle },
  )

  await admin.from('creators')
    .update({ social_accounts: mergeSocialAccounts(existing, incoming) })
    .eq('id', creatorId)
}

async function clearChannelConnected(creatorId: string): Promise<void> {
  const admin = createAdminClient()
  const { data } = await admin.from('creators').select('social_accounts').eq('id', creatorId).maybeSingle()
  const existing = (data?.social_accounts ?? []) as Record<string, unknown>[]
  const incoming = existing.map(a => ({ platform: a.platform, handle: a.handle, connected: null, connected_username: null }))
  await admin.from('creators')
    .update({ social_accounts: mergeSocialAccounts(existing, incoming) })
    .eq('id', creatorId)
}

/** Remove a connection entirely: deauthorization, data deletion, or the
 *  creator disconnecting. The token row goes; typed figures are untouched and
 *  the storefront falls back to them on its own. */
export async function removeConnection(creatorId: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from('creator_instagram_connections').delete().eq('creator_id', creatorId)
  await clearChannelConnected(creatorId)
}

interface ConnectionRow {
  creator_id: string
  token_ciphertext: string
  token_iv: string
  token_tag: string
  key_version: number
  token_expires_at: string
  last_refreshed_at: string | null
}

/**
 * Refresh a token and re-sync one connection.
 *
 * Refresh first, because a token within days of expiry may not survive until
 * the next run. Meta requires it to be at least 24 hours old, so a just-issued
 * token is synced without refreshing rather than being refused.
 */
export async function refreshAndSync(row: ConnectionRow): Promise<{ ok: boolean; detail: string }> {
  const admin = createAdminClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  let token: string
  try {
    token = decryptToken({
      ciphertext: row.token_ciphertext, iv: row.token_iv, tag: row.token_tag, keyVersion: row.key_version,
    })
  } catch (err) {
    // Undecryptable means the key changed or the row was tampered with. Either
    // way the token is unusable and the creator must reconnect; it is not a
    // transient failure worth retrying daily.
    await admin.from('creator_instagram_connections')
      .update({ status: 'needs_reconnect', sync_error: 'token could not be decrypted', ...patch })
      .eq('creator_id', row.creator_id)
    return { ok: false, detail: `decrypt failed: ${err instanceof Error ? err.message : String(err)}` }
  }

  const ageMs = row.last_refreshed_at ? Date.now() - new Date(row.last_refreshed_at).getTime() : Infinity
  const expiresInDays = (new Date(row.token_expires_at).getTime() - Date.now()) / 86_400_000

  if (expiresInDays <= 0) {
    await admin.from('creator_instagram_connections')
      .update({ status: 'expired', sync_error: 'token expired before it could be refreshed', ...patch })
      .eq('creator_id', row.creator_id)
    await clearChannelConnected(row.creator_id)
    return { ok: false, detail: 'expired' }
  }

  // Refresh when the token is inside the window AND old enough for Meta to
  // accept it. 24h is Meta's rule, not ours.
  if (expiresInDays < 14 && ageMs > 24 * 3600 * 1000) {
    try {
      const refreshed = await refreshLongLivedToken(token)
      token = refreshed.token
      const enc = encryptToken(token)
      Object.assign(patch, {
        token_ciphertext: enc.ciphertext, token_iv: enc.iv, token_tag: enc.tag, key_version: enc.keyVersion,
        token_expires_at: new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString(),
        last_refreshed_at: new Date().toISOString(),
      })
    } catch (err) {
      await admin.from('creator_instagram_connections')
        .update({ status: 'needs_reconnect', sync_error: `refresh failed: ${err instanceof Error ? err.message : String(err)}`, ...patch })
        .eq('creator_id', row.creator_id)
      return { ok: false, detail: 'refresh failed' }
    }
  }

  try {
    const snapshot = await buildSnapshot(token)


    // Re-read every sync: a creator can switch back to a personal account at
    // any time, and the storefront must stop showing verified figures the
    // moment we can no longer verify them.
    if (snapshot.accountType === 'PERSONAL') {
      await admin.from('creator_instagram_connections')
        .update({ status: 'personal_account', account_type: 'PERSONAL', sync_error: null, ...patch })
        .eq('creator_id', row.creator_id)
      await clearChannelConnected(row.creator_id)
      return { ok: false, detail: 'personal account' }
    }

    await admin.from('creator_instagram_connections').update({
      status: 'connected',
      username: snapshot.username,
      account_type: snapshot.accountType,
      snapshot,
      last_synced_at: new Date().toISOString(),
      sync_error: null,
      ...patch,
    }).eq('creator_id', row.creator_id)

    await markChannelConnected(row.creator_id, snapshot.username)

    // Prefill runs on EVERY sync, not only on connect. It fills empty fields and
    // never touches a filled one, so repeating it is a no-op the moment the
    // creator has written anything. Running it only at connect meant everyone who
    // connected before it existed had a bio, a name and a photo sitting in their
    // snapshot that nothing ever used.
    await prefillFromInstagram(row.creator_id, snapshot).catch(() => {})

    // The featured set is refreshed with everything else, so a brand sees
    // current numbers on the reels a creator chose.
    await syncFeaturedReels(row.creator_id).catch(() => {})

    return { ok: true, detail: 'synced' }
  } catch (err) {
    // The token may still be good; a sync can fail for rate limits or an
    // Instagram outage. Record it and keep the LAST GOOD snapshot rather than
    // blanking a storefront over a transient error.
    await admin.from('creator_instagram_connections')
      .update({ sync_error: err instanceof Error ? err.message : String(err), ...patch })
      .eq('creator_id', row.creator_id)
    return { ok: false, detail: 'sync failed' }
  }
}

/** Every connection the cron should touch. */
export async function connectionsDueForSync(): Promise<ConnectionRow[]> {
  const { data } = await createAdminClient()
    .from('creator_instagram_connections')
    .select('creator_id, token_ciphertext, token_iv, token_tag, key_version, token_expires_at, last_refreshed_at')
    .in('status', ['connected'])
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(200)
  return (data ?? []) as ConnectionRow[]
}

/* ── Prefill: presentation, not proof ───────────────────────────────────────── */

const AVATAR_BUCKET = 'storefronts'
const MAX_AVATAR_BYTES = 5 * 1024 * 1024

/**
 * Fill in bio and profile photo from Instagram, ONCE, and only where empty.
 *
 * These are not verified stats and they never lock. A creator's Guapd bio is
 * their pitch to brands and can reasonably differ from the one on their
 * Instagram; the photo is their storefront branding. So this is a starting
 * point, not a source of truth: anything the creator has already written is
 * left exactly as it is, and reconnecting later will not overwrite what they
 * have since edited.
 *
 * The photo is COPIED into our own storage rather than linked. Instagram serves
 * profile pictures from a signed CDN URL that expires, so storing the URL would
 * give every prefilled storefront a broken image some days later — a failure
 * that would appear long after the connect that caused it.
 *
 * NON-FATAL by design. This runs after the connection is already saved, and a
 * creator whose bio could not be copied still has a working, verified
 * connection. Nothing here is allowed to fail the connect.
 */
export async function prefillFromInstagram(creatorId: string, snapshot: IgSnapshot): Promise<void> {
  const admin = createAdminClient()

  const { data: creator } = await admin
    .from('creators')
    .select('bio, profile_photo_url')
    .eq('id', creatorId)
    .maybeSingle()

  if (!creator) return

  const update: Record<string, string> = {}

  // Only when there is nothing there. A creator who has written their own bio
  // must never find it replaced by their Instagram one.
  const hasBio = typeof creator.bio === 'string' && creator.bio.trim() !== ''
  if (!hasBio && snapshot.biography?.trim()) {
    update.bio = snapshot.biography.trim()
  }

  const hasPhoto = typeof creator.profile_photo_url === 'string' && creator.profile_photo_url.trim() !== ''
  if (!hasPhoto && snapshot.profilePictureUrl) {
    const stored = await copyAvatar(creatorId, snapshot.profilePictureUrl)
    if (stored) update.profile_photo_url = stored
  }

  if (Object.keys(update).length > 0) {
    const { error } = await admin.from('creators').update(update).eq('id', creatorId)
    if (error) {
      console.error(`[instagram] prefill failed creator=${creatorId}: ${error.message}`)
    }
  }

  await prefillStorefront(creatorId, snapshot)
}

/**
 * The storefront's own display name and bio, where the creator has left them
 * blank.
 *
 * A SEPARATE row from creators, and separately optional: a creator who has not
 * started a storefront has nothing to prefill, and one who has written their own
 * headline keeps it. Instagram's `name` is a display name ("Palak Jain") where
 * the creators row often holds only a first name, so this is the field where it
 * is worth something.
 */
async function prefillStorefront(creatorId: string, snapshot: IgSnapshot): Promise<void> {
  const admin = createAdminClient()

  const { data: sf } = await admin
    .from('creator_storefronts')
    .select('display_name, bio')
    .eq('creator_id', creatorId)
    .maybeSingle()

  // No storefront yet. Nothing to fill, and creating one here would publish a
  // page the creator never chose to make.
  if (!sf) return

  const update: Record<string, string> = {}

  const hasName = typeof sf.display_name === 'string' && sf.display_name.trim() !== ''
  if (!hasName && snapshot.name?.trim()) update.display_name = snapshot.name.trim()

  const hasBio = typeof sf.bio === 'string' && sf.bio.trim() !== ''
  if (!hasBio && snapshot.biography?.trim()) update.bio = snapshot.biography.trim()

  if (Object.keys(update).length === 0) return

  const { error } = await admin
    .from('creator_storefronts')
    .update(update)
    .eq('creator_id', creatorId)

  if (error) {
    console.error(`[instagram] storefront prefill failed creator=${creatorId}: ${error.message}`)
  }
}

/** Downloads Instagram's profile picture and stores it as ours. Returns the
 *  public URL, or null if anything at all went wrong. */
async function copyAvatar(creatorId: string, sourceUrl: string): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl)
    if (!res.ok) return null

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) return null

    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_AVATAR_BYTES) return null

    // Same path convention the manual upload uses, so a creator replacing the
    // photo later overwrites this rather than leaving two files behind.
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
    const path = `avatars/${creatorId}/avatar.${ext}`

    const admin = createAdminClient()
    const { error } = await admin.storage
      .from(AVATAR_BUCKET)
      .upload(path, bytes, { upsert: true, contentType })

    if (error) {
      console.error(`[instagram] avatar copy failed creator=${creatorId}: ${error.message}`)
      return null
    }

    const { data } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(path)
    // The version stamp exists because the path is stable across replacements,
    // so without it a later photo change serves the old bytes from cache.
    return `${data.publicUrl}?v=${Date.now()}`
  } catch (err) {
    console.error(`[instagram] avatar copy threw creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/**
 * Re-sync one creator, on demand.
 *
 * Lifted out of the settings action so the storefront editor can offer the same
 * thing without importing a server action across routes, which this codebase has
 * been bitten by before. Both screens call THIS, so there is one path that
 * refreshes a connection and no second one to drift from it.
 */
export async function resyncForCreator(creatorId: string): Promise<{ ok: boolean; detail: string }> {
  const { data } = await createAdminClient()
    .from('creator_instagram_connections')
    .select('creator_id, token_ciphertext, token_iv, token_tag, key_version, token_expires_at, last_refreshed_at')
    .eq('creator_id', creatorId)
    .maybeSingle()

  if (!data) return { ok: false, detail: 'not connected' }
  return refreshAndSync(data)
}

/* ── Reel thumbnails ───────────────────────────────────────────────────────── */

const MEDIA_BUCKET = 'storefronts'
const MAX_THUMB_BYTES = 3 * 1024 * 1024

/**
 * Copy reel thumbnails into our bucket, and clean up the ones we no longer need.
 *
 * Instagram serves thumbnails from a SIGNED CDN URL that expires, so storing
 * the link would give every storefront a grid of broken images some days after
 * the sync that created it — a failure that appears long after its cause.
 *
 * Copied ONLY for media ids we do not already hold. This runs nightly for every
 * connected creator, and re-downloading six images each time is bandwidth spent
 * to produce bytes we already have.
 *
 * Files for posts that have dropped out of the recent six are deleted in the
 * same pass. Without that the bucket only ever grows, one file per reel per
 * creator, forever.
 *
 * Mutates the snapshot in place: each item gets thumbnailUrl pointing at our
 * copy, and thumbnailSourceUrl is dropped so an expiring link is never stored.
 */
export async function syncMediaThumbnails(
  creatorId: string,
  snapshot: IgSnapshot,
  previous?: IgSnapshot,
): Promise<void> {
  const media = snapshot.media ?? []
  if (media.length === 0) return

  const admin = createAdminClient()
  const prefix = `reels/${creatorId}`

  // What we already stored, from the last snapshot. Keyed by media id, which is
  // stable for the life of a post.
  const held = new Map(
    (previous?.media ?? [])
      .filter((m) => m.thumbnailUrl)
      .map((m) => [m.id, m.thumbnailUrl as string]),
  )

  for (const item of media) {
    const existing = held.get(item.id)
    if (existing) {
      item.thumbnailUrl = existing
      delete item.thumbnailSourceUrl
      continue
    }

    if (!item.thumbnailSourceUrl) continue

    try {
      const res = await fetch(item.thumbnailSourceUrl, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) { delete item.thumbnailSourceUrl; continue }

      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.startsWith('image/')) { delete item.thumbnailSourceUrl; continue }

      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_THUMB_BYTES) {
        delete item.thumbnailSourceUrl
        continue
      }

      const path = `${prefix}/${item.id}.jpg`
      const { error } = await admin.storage
        .from(MEDIA_BUCKET)
        .upload(path, bytes, { upsert: true, contentType })

      if (!error) {
        const { data } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path)
        item.thumbnailUrl = data.publicUrl
      }
    } catch (err) {
      console.error(`[instagram] thumbnail copy failed creator=${creatorId} media=${item.id}: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      // Never stored, whatever happened. It expires, so keeping it would only
      // preserve a link that is guaranteed to stop working.
      delete item.thumbnailSourceUrl
    }
  }

  // Anything we hold for a post that is no longer in the recent set.
  const keep = new Set(media.map((m) => `${m.id}.jpg`))
  try {
    const { data: files } = await admin.storage.from(MEDIA_BUCKET).list(prefix, { limit: 100 })
    const stale = (files ?? []).map((f) => f.name).filter((n) => !keep.has(n))
    if (stale.length > 0) {
      await admin.storage.from(MEDIA_BUCKET).remove(stale.map((n) => `${prefix}/${n}`))
    }
  } catch (err) {
    // A failed cleanup leaves files behind. That is a cost, not a fault, and it
    // must not fail a sync that otherwise worked.
    console.error(`[instagram] thumbnail cleanup failed creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/* ── Featured reels on the storefront ──────────────────────────────────────── */

/** How many reels a creator may feature. Six fills the row at desktop and keeps
 *  the section a highlight rather than an archive. */
export const MAX_FEATURED_REELS = 6

/**
 * The creator's reels, fetched LIVE for the picker.
 *
 * Not from the snapshot, and deliberately not persisted. Instagram's thumbnail
 * URLs are signed and expire, so a stored candidate list would show broken
 * images in the editor within days. The picker is a private, authenticated
 * screen showing the creator their OWN account, so hotlinking Instagram's CDN
 * there leaks nothing and costs no bandwidth — unlike the public storefront,
 * where every thumbnail is copied into our bucket.
 */
export async function listReelCandidates(creatorId: string): Promise<IgMediaItem[]> {
  const { data } = await createAdminClient()
    .from('creator_instagram_connections')
    .select('status, token_ciphertext, token_iv, token_tag, key_version')
    .eq('creator_id', creatorId)
    .maybeSingle()

  if (!data || data.status !== 'connected') return []

  let token: string
  try {
    token = decryptToken({
      ciphertext: data.token_ciphertext, iv: data.token_iv, tag: data.token_tag, keyVersion: data.key_version,
    })
  } catch {
    return []
  }

  return fetchReelCandidates(token)
}

/**
 * Resolve the reels a creator has chosen, and store them on the snapshot.
 *
 * Resolved BY ID, one call each, rather than filtered out of a recent list. A
 * creator can feature a reel from two years ago; verified live that a 2022 post
 * still returns its thumbnail, likes and permalink. Filtering a paginated window
 * would silently drop that pick the moment it fell off the end.
 *
 * Thumbnails are copied here because this is the set that reaches a public page.
 * Only new ids are downloaded, and files for reels no longer featured are
 * removed, so the bucket tracks the selection rather than growing forever.
 */
export async function syncFeaturedReels(creatorId: string): Promise<void> {
  const admin = createAdminClient()

  const [{ data: sf }, { data: conn }] = await Promise.all([
    admin.from('creator_storefronts').select('stats').eq('creator_id', creatorId).maybeSingle(),
    admin.from('creator_instagram_connections')
      .select('status, snapshot, token_ciphertext, token_iv, token_tag, key_version')
      .eq('creator_id', creatorId).maybeSingle(),
  ])

  const stats = (sf?.stats ?? {}) as Record<string, unknown>
  const ids = Array.isArray(stats.featured_reel_ids)
    ? (stats.featured_reel_ids as string[]).slice(0, MAX_FEATURED_REELS)
    : []

  if (!conn || conn.status !== 'connected') return

  let token: string
  try {
    token = decryptToken({
      ciphertext: conn.token_ciphertext, iv: conn.token_iv, tag: conn.token_tag, keyVersion: conn.key_version,
    })
  } catch {
    return
  }

  const snapshot = (conn.snapshot ?? {}) as IgSnapshot
  const held = new Map((snapshot.media ?? []).filter(m => m.thumbnailUrl).map(m => [m.id, m.thumbnailUrl as string]))

  const resolved: IgMediaItem[] = []
  for (const id of ids) {
    const item = await fetchReelById(token, id)
    if (!item) continue

    const existing = held.get(id)
    if (existing) {
      item.thumbnailUrl = existing
    } else if (item.thumbnailSourceUrl) {
      const stored = await copyReelThumbnail(creatorId, id, item.thumbnailSourceUrl)
      if (stored) item.thumbnailUrl = stored
    }
    // Never persisted: it expires, so keeping it would preserve a link that is
    // guaranteed to stop working.
    delete item.thumbnailSourceUrl
    resolved.push(item)
  }

  await admin
    .from('creator_instagram_connections')
    .update({ snapshot: { ...snapshot, media: resolved }, updated_at: new Date().toISOString() })
    .eq('creator_id', creatorId)

  await pruneReelThumbnails(creatorId, new Set(resolved.map(r => `${r.id}.jpg`)))
}

async function copyReelThumbnail(creatorId: string, mediaId: string, sourceUrl: string): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) return null

    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > 3 * 1024 * 1024) return null

    const admin = createAdminClient()
    const path = `reels/${creatorId}/${mediaId}.jpg`
    const { error } = await admin.storage.from('storefronts').upload(path, bytes, { upsert: true, contentType })
    if (error) return null

    const { data } = admin.storage.from('storefronts').getPublicUrl(path)
    return data.publicUrl
  } catch {
    return null
  }
}

/** Files for reels no longer featured. Without this the bucket only grows, one
 *  file per reel a creator ever tried. */
async function pruneReelThumbnails(creatorId: string, keep: Set<string>): Promise<void> {
  try {
    const admin = createAdminClient()
    const prefix = `reels/${creatorId}`
    const { data: files } = await admin.storage.from('storefronts').list(prefix, { limit: 100 })
    const stale = (files ?? []).map(f => f.name).filter(n => !keep.has(n))
    if (stale.length) await admin.storage.from('storefronts').remove(stale.map(n => `${prefix}/${n}`))
  } catch (err) {
    console.error(`[instagram] reel thumbnail prune failed creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
