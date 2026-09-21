/**
 * The five Instagram connection states, and how they are shown.
 *
 * ── Why this is its own file ────────────────────────────────────────────────
 * The type lived in `lib/instagram-sync.ts`, which is `server-only` — so no
 * shared or client surface could import it, and any page wanting to render a
 * status would have had to re-spell the five strings. That is the shape that
 * produced the vetting-badge bug: a list of states written out in three places,
 * and a new state added to only one of them.
 *
 * So the list lives here, with no server imports, and `instagram-sync` takes
 * the type FROM this file rather than declaring its own.
 *
 * ── not_connected is not a stored value ─────────────────────────────────────
 * Four of these are `creator_instagram_connections.status`. The fifth,
 * `not_connected`, is the ABSENCE of a row — there is deliberately no
 * not_connected row to keep in sync with nothing (see `getConnection`). Any
 * query filtering on it is asking "which creators have no row", not "which
 * rows hold this value", and the two are not interchangeable.
 */

export type IgStatus =
  | 'connected'
  | 'not_connected'
  | 'expired'
  | 'needs_reconnect'
  | 'personal_account'

/** Filter and legend order: working, then never-started, then the three
 *  failures in the order ops would want to act on them. */
export const IG_STATUSES: IgStatus[] = [
  'connected', 'not_connected', 'expired', 'needs_reconnect', 'personal_account',
]

/** The four that are actually stored in the status column. `not_connected` is
 *  absent by design — see the note above. Use this to validate a value bound
 *  for the database; use IG_STATUSES for anything user-facing. */
export const IG_STORED_STATUSES: Exclude<IgStatus, 'not_connected'>[] = [
  'connected', 'expired', 'needs_reconnect', 'personal_account',
]

export const IG_STATUS_LABEL: Record<IgStatus, string> = {
  connected: 'Connected',
  not_connected: 'Not connected',
  expired: 'Expired',
  needs_reconnect: 'Needs reconnect',
  personal_account: 'Personal account',
}

/**
 * Badge colours, from the palette ops already uses for vetting.
 *
 * `not_connected` is GREY, not red: a creator who never connected has not
 * failed at anything, and colouring them like a fault makes the roster look
 * broken rather than un-activated. The two real faults are red and amber; a
 * personal account is indigo because it is a different problem with a
 * different instruction — reconnecting does not fix it.
 */
export const IG_STATUS_TONE: Record<IgStatus, { bg: string; fg: string; border: string }> = {
  connected:        { bg: '#dcfce7', fg: '#166534', border: '#bbf7d0' },
  not_connected:    { bg: '#f3f4f6', fg: '#4b5563', border: '#e5e7eb' },
  expired:          { bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5' },
  needs_reconnect:  { bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' },
  personal_account: { bg: '#eef2ff', fg: '#4338ca', border: '#c7d2fe' },
}

/**
 * The states where the creator must reconnect, and the generic reconnect
 * message is the right thing to say.
 *
 * `personal_account` is deliberately NOT here. The badge is gone in that case
 * too, but telling someone to reconnect is wrong instruction: reconnecting a
 * personal account produces a personal account again. They have to switch the
 * account type in Instagram first.
 */
export const IG_RECONNECT_STATUSES: IgStatus[] = ['expired', 'needs_reconnect']

/** Every state where the verified badge is gone, whatever the reason. */
export const IG_BROKEN_STATUSES: IgStatus[] = [...IG_RECONNECT_STATUSES, 'personal_account']

export function isIgStatus(v: string | null | undefined): v is IgStatus {
  return !!v && (IG_STATUSES as string[]).includes(v)
}

/** The status of a creator given their connection row, or lack of one. */
export function igStatusOf(row: { status?: string | null } | null | undefined): IgStatus {
  if (!row?.status) return 'not_connected'
  return isIgStatus(row.status) ? row.status : 'not_connected'
}
