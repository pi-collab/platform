import { vettingStatusOf, VETTING_LABEL, VETTING_TONE } from '@/lib/vetting-status'

/**
 * A creator's vetting state, in ops.
 *
 * One component rather than a ternary per surface: the previous
 * `is_vetted ? ... : is_rejected ? ... : 'Pending'` lived in three files and all
 * three reported an approved Guapd Growth creator as un-reviewed, because a
 * Growth creator is is_vetted false and is_rejected false by construction.
 *
 * The row must have SELECTed vetting_status. Without it the fallback in
 * vettingStatusOf cannot tell growth from pending -- the booleans do not encode
 * the difference.
 */
export default function VettingBadge({ row }: {
  row: { vetting_status?: string | null; is_vetted?: boolean | null; is_rejected?: boolean | null }
}) {
  const status = vettingStatusOf(row)
  const tone = VETTING_TONE[status]
  return (
    <span style={{
      fontSize: '0.7rem',
      fontWeight: 600,
      padding: '0.15rem 0.5rem',
      borderRadius: 9999,
      whiteSpace: 'nowrap',
      background: tone.bg,
      color: tone.fg,
      border: `1px solid ${tone.border}`,
    }}>
      {VETTING_LABEL[status]}
    </span>
  )
}
