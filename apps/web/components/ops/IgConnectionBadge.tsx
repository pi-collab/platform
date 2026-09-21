import { IG_STATUS_LABEL, IG_STATUS_TONE, type IgStatus } from '@/lib/ig-connection-status'

/**
 * A creator's Instagram connection state, in ops.
 *
 * Takes the STATUS, not the row, because the most common state — not_connected
 * — is the absence of a row. A component taking a row would have to accept
 * null and decide what null means, which is the decision `igStatusOf` already
 * makes in one place.
 */
export default function IgConnectionBadge({ status, username, title }: {
  status: IgStatus
  /** Shown beside the badge when we have it: which account is attached matters
   *  as much as whether one is, and ops otherwise has to open the row to see. */
  username?: string | null
  /** Hover text — used for the sync error, which is too long to show inline. */
  title?: string | null
}) {
  const tone = IG_STATUS_TONE[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}>
      <span
        title={title ?? undefined}
        style={{
          fontSize: '0.7rem',
          fontWeight: 600,
          padding: '0.15rem 0.5rem',
          borderRadius: 9999,
          whiteSpace: 'nowrap',
          background: tone.bg,
          color: tone.fg,
          border: `1px solid ${tone.border}`,
        }}
      >
        {IG_STATUS_LABEL[status]}
      </span>
      {username && (
        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>@{username}</span>
      )}
    </span>
  )
}
