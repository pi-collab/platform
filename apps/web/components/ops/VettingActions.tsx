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

  // ONE line, never wrapped. These labels used to wrap to two or three rows
  // inside a narrow cell, and because a table row is as tall as its tallest
  // cell, that stretched every row in the list. nowrap plus a compact size keeps
  // the words — which are clearer than any icon for a decision that emails the
  // creator — while the table's own horizontal scroll handles a narrow viewport.
  return (
    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'nowrap', alignItems: 'center' }}>
      {status !== 'deals_approved' && (
        <ActionButton
          busy={busy}
          label="Deals"
          title="Approve for Guapd Deals"
          style={{ background: '#16a34a', color: '#fff' }}
          onClick={() => run(approveForDeals, `Approve ${who} for Guapd Deals?`)}
        />
      )}
      {status !== 'growth' && (
        <ActionButton
          busy={busy}
          label="Growth"
          title="Move to Guapd Growth"
          style={{ background: '#4f46e5', color: '#fff' }}
          onClick={() => run(moveToGrowth, `Move ${who} to Guapd Growth? They will not receive brand deals yet.`)}
        />
      )}
      {status !== 'rejected' && (
        <ActionButton
          busy={busy}
          label="Reject"
          title="Reject"
          // Confirmed even from the row. It emails the creator, and a misclick
          // in a dense table is far easier than on a profile page opened on
          // purpose.
          style={{ background: '#fff', color: '#dc2626', border: '1px solid #fca5a5' }}
          onClick={() => run(rejectCreator, `Reject ${who}? They will be told, and can appeal.`)}
        />
      )}
    </div>
  )
}

function ActionButton({ busy, label, title, style, onClick }: {
  busy: boolean
  label: string
  title: string
  style: React.CSSProperties
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      title={title}
      style={{ ...btn, ...style, opacity: busy ? 0.5 : 1 }}
    >
      {/* The LABEL stays put while busy. Swapping it for "..." changed the
          button's width mid-click, so the row shifted under the cursor and the
          next target moved. Dimming says the same thing without moving. */}
      {label}
    </button>
  )
}

const btn: React.CSSProperties = {
  flexShrink: 0,
  padding: '0.2rem 0.45rem',
  borderRadius: 6,
  border: 'none',
  fontSize: '0.7rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  lineHeight: 1.6,
}
