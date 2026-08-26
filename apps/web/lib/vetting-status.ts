/**
 * The four vetting states, and how they are shown.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Ops derived its badge from the two booleans, in three separate places:
 *
 *   is_vetted ? 'Vetted' : is_rejected ? 'Rejected' : 'Pending'
 *
 * That was complete when there were three states. Guapd Growth is a fourth, and
 * a Growth creator is is_vetted false and is_rejected false by construction
 * (0487) -- which is exactly what keeps them invisible to brands. So every one
 * of those ternaries fell through to "Pending" and ops reported an approved
 * Growth creator as un-reviewed.
 *
 * The booleans are DERIVED from vetting_status by trigger. Reading them to
 * decide what to display re-derives a value that already exists, and loses
 * information doing it. Read vetting_status.
 *
 * Any surface showing a creator's vetting state uses this. A fifth state should
 * mean editing one file, not finding three ternaries.
 */

export type VettingStatus = 'pending' | 'deals_approved' | 'growth' | 'rejected'

export const VETTING_STATUSES: VettingStatus[] = [
  'deals_approved', 'growth', 'pending', 'rejected',
]

export const VETTING_LABEL: Record<VettingStatus, string> = {
  deals_approved: 'Vetted for deals',
  growth: 'Vetted for growth',
  pending: 'Pending',
  rejected: 'Rejected',
}

/** Badge colours, matching the palette ops already used for the first three. */
export const VETTING_TONE: Record<VettingStatus, { bg: string; fg: string; border: string }> = {
  deals_approved: { bg: '#dcfce7', fg: '#166534', border: '#bbf7d0' },
  // Indigo, the colour ops already uses for the "Move to Guapd Growth" action,
  // so the badge and the button that produces it are visibly the same thing.
  growth:         { bg: '#eef2ff', fg: '#4338ca', border: '#c7d2fe' },
  pending:        { bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' },
  rejected:       { bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5' },
}

/**
 * The status of a row, tolerating a query that did not select the column.
 *
 * The boolean fallback is for exactly that case and nothing else: it cannot
 * represent 'growth', because the booleans do not distinguish it from pending.
 * A caller relying on the fallback will therefore mislabel Growth creators, so
 * SELECT vetting_status rather than leaning on this.
 */
export function vettingStatusOf(row: {
  vetting_status?: string | null
  is_vetted?: boolean | null
  is_rejected?: boolean | null
}): VettingStatus {
  const s = row.vetting_status
  if (s && (VETTING_STATUSES as string[]).includes(s)) return s as VettingStatus
  if (row.is_rejected) return 'rejected'
  if (row.is_vetted) return 'deals_approved'
  return 'pending'
}

export function vettingLabel(row: Parameters<typeof vettingStatusOf>[0]): string {
  return VETTING_LABEL[vettingStatusOf(row)]
}
