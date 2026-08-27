import 'server-only'

/**
 * Merging edits into creators.social_accounts without destroying the rest.
 *
 * ── What this exists to stop ────────────────────────────────────────────────
 * social_accounts is a jsonb ARRAY whose entries accumulate keys owned by
 * different screens:
 *
 *   platform, handle        the profile screen
 *   follower_range          creator signup, and the ONLY source of
 *                           creators.follower_band via trg_creators_follower_band
 *   follower_count          the storefront editor
 *   avg_views, interactions the storefront editor (Instagram)
 *   views, watch_time       the storefront editor (YouTube)
 *   url, verified           ops
 *
 * Any screen that writes the array by rebuilding it from its OWN fields deletes
 * every key it does not know about. Creator settings did exactly that, keeping
 * only platform and handle, so editing a handle silently dropped follower_range
 * -- and the trigger then set follower_band to null, which removed the creator
 * from every band filter in ops. Nothing errors, nothing is logged, and the data
 * is gone.
 *
 * So: entries are matched on (platform, handle) and unknown keys are carried
 * across. A channel that is genuinely gone is dropped; a new one starts bare.
 */

/** Case-insensitive, @-insensitive identity for a channel. */
function key(platform: unknown, handle: unknown): string {
  return `${String(platform ?? '').trim().toLowerCase()}|${String(handle ?? '').trim().replace(/^@/, '').toLowerCase()}`
}

/**
 * The array to write: `incoming` decides which channels exist and what the
 * caller's own fields are, `existing` supplies everything else.
 *
 * Rename caveat, stated because it is a real limit rather than an oversight:
 * changing a handle produces a key that matches nothing, so that channel's
 * extras do not follow it. Preserving them would mean guessing which old entry a
 * renamed one used to be, and guessing wrong attaches one creator's follower
 * range to a different channel.
 */
export function mergeSocialAccounts(
  existing: unknown,
  incoming: Record<string, unknown>[],
): Record<string, unknown>[] {
  const prev = Array.isArray(existing) ? (existing as Record<string, unknown>[]) : []
  const byKey = new Map(prev.map(a => [key(a.platform, a.handle), a]))

  return incoming.map(next => {
    const old = byKey.get(key(next.platform, next.handle))
    if (!old) return next
    // Caller's fields win; everything else on the old entry survives. Explicit
    // undefined in `next` must not blank an existing value.
    const merged: Record<string, unknown> = { ...old }
    for (const [k, v] of Object.entries(next)) {
      if (v !== undefined) merged[k] = v
    }
    return merged
  })
}
