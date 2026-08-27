'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveForDeals, moveToGrowth, rejectCreator } from '@/app/ops/actions'
import { vettingStatusOf, type VettingStatus } from '@/lib/vetting-status'

/**
 * Vetting decisions, on the row.
 *
 * The same three actions the creator detail page carries, so a queue can be
 * worked from the list instead of opening every profile and coming back. The
 * detail page keeps them: opening a profile first is the right move when the
 * decision is not obvious, and this is for when it is.
 *
 * Both call the SAME server actions. decideVetting is the single writer of
 * vetting_status, so there is no second path here that could drift from it, and
 * the notification and ops_events behaviour is whatever that action does.
 *
 * Each button appears only where it would be a real change, keyed on
 * vetting_status rather than the derived booleans. A Growth creator is
 * is_vetted false, so a boolean test would offer to approve someone already
 * decided on.
 */
export default function VettingActions({ creator }: {
  creator: {
    id: string
    full_name?: string | null
    vetting_status?: string | null
    is_vetted?: boolean | null
    is_rejected?: boolean | null
  }
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const status: VettingStatus = vettingStatusOf(creator)
  const who = creator.full_name?.trim() || 'this creator'

  async function run(
    action: (id: string) => Promise<{ error?: string } | void>,
    confirmText?: string,
  ) {
    if (confirmText && !confirm(confirmText)) return
    setBusy(true)
    const res = await action(creator.id)
    if (res && 'error' in res && res.error) alert(res.error)
    else router.refresh()
    setBusy(false)
  }

  return (
    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
      {status !== 'deals_approved' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(approveForDeals, `Approve ${who} for Guapd Deals?`)}
          style={{ ...btn, background: '#16a34a', color: '#fff' }}
          title="Approve for Deals"
        >
          {busy ? '...' : 'Deals'}
        </button>
      )}
      {status !== 'growth' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(moveToGrowth, `Move ${who} to Guapd Growth? They will not receive brand deals yet.`)}
          style={{ ...btn, background: '#4f46e5', color: '#fff' }}
          title="Move to Guapd Growth"
        >
          {busy ? '...' : 'Growth'}
        </button>
      )}
      {status !== 'rejected' && (
        <button
          type="button"
          disabled={busy}
          // Confirmed even from the row. It emails the creator, and a misclick
          // in a dense table is far easier than on a profile page opened on
          // purpose.
          onClick={() => run(rejectCreator, `Reject ${who}? They will be told, and can appeal.`)}
          style={{ ...btn, background: '#fff', color: '#dc2626', border: '1px solid #fca5a5' }}
          title="Reject"
        >
          {busy ? '...' : 'Reject'}
        </button>
      )}
    </div>
  )
}

const btn: React.CSSProperties = {
  padding: '0.2rem 0.5rem',
  borderRadius: 6,
  border: 'none',
  fontSize: '0.7rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  lineHeight: 1.6,
}
