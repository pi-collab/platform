/**
 * What the Instagram OAuth callback reported, in words.
 *
 * The callback redirects back with `?ig=<reason>` for every outcome it has. For
 * a while nothing read it, so a creator whose connection failed saw only "Not
 * connected" with no reason, and the cause could be recovered only from the
 * server logs.
 *
 * Shared rather than duplicated because the connect action now starts from two
 * screens, settings and the storefront editor, and the same failure must not
 * get two different explanations depending on where it began.
 *
 * "cancelled" is deliberately not an error: the creator chose not to continue,
 * and colouring that red reads as though something broke.
 *
 * No `server-only` marker here on purpose. This is plain copy with no secrets
 * and no I/O, and both consumers are client components.
 */
export type OutcomeTone = 'ok' | 'info' | 'err'

export const IG_OUTCOME: Record<string, { tone: OutcomeTone; text: string }> = {
  connected: {
    tone: 'ok',
    text: 'Instagram connected. Your verified numbers are on your shopfront now.',
  },
  personal_account: {
    tone: 'err',
    text: 'That account is a personal one, so Instagram will not share audience data for it. Switch it to a Business or Creator account, then reconnect.',
  },
  cancelled: {
    tone: 'info',
    text: 'Instagram was not connected. Nothing has changed.',
  },
  state_mismatch: {
    tone: 'err',
    text: 'That attempt expired, or it was started in a different tab. Please try connecting again.',
  },
  no_code: {
    tone: 'err',
    text: 'Instagram did not send an authorisation back. Please try connecting again.',
  },
  save_failed: {
    tone: 'err',
    text: 'We reached Instagram but could not save the connection. Please try again, and email contact@guapd.com if it keeps happening.',
  },
  failed: {
    tone: 'err',
    text: 'We could not finish connecting to Instagram. Please try again, and email contact@guapd.com if it keeps happening.',
  },
}

/** An unrecognised reason still says something, rather than rendering nothing. */
export function igOutcome(reason: string): { tone: OutcomeTone; text: string } {
  return IG_OUTCOME[reason] ?? IG_OUTCOME.failed
}

/** "2 hours ago", for a last-synced timestamp. */
export function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} minutes ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`
  const days = Math.floor(hrs / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}
