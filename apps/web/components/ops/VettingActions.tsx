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

  // ONE line, never wrapped. Three word-labelled buttons wrapped to two or three
  // rows inside a table cell, which stretched every row in the list to fit the
  // tallest one. Icons keep all three on a single line at any column width; the
  // words survive as the tooltip and as the accessible name, and the confirm
  // dialog still says in full what is about to happen.
  return (
    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'nowrap', alignItems: 'center' }}>
      {status !== 'deals_approved' && (
        <IconButton
          busy={busy}
          label="Approve for Guapd Deals"
          style={{ background: '#16a34a', color: '#fff' }}
          onClick={() => run(approveForDeals, `Approve ${who} for Guapd Deals?`)}
        >
          <svg {...svgProps}><path d="M20 6 9 17l-5-5" /></svg>
        </IconButton>
      )}
      {status !== 'growth' && (
        <IconButton
          busy={busy}
          label="Move to Guapd Growth"
          style={{ background: '#4f46e5', color: '#fff' }}
          onClick={() => run(moveToGrowth, `Move ${who} to Guapd Growth? They will not receive brand deals yet.`)}
        >
          <svg {...svgProps}><path d="M3 17l6-6 4 4 7-7" /><path d="M17 8h4v4" /></svg>
        </IconButton>
      )}
      {status !== 'rejected' && (
        <IconButton
          busy={busy}
          // Confirmed even from the row. It emails the creator, and a misclick
          // in a dense table is far easier than on a profile page opened on
          // purpose.
          label="Reject"
          style={{ background: '#fff', color: '#dc2626', border: '1px solid #fca5a5' }}
          onClick={() => run(rejectCreator, `Reject ${who}? They will be told, and can appeal.`)}
        >
          <svg {...svgProps}><path d="M18 6 6 18M6 6l12 12" /></svg>
        </IconButton>
      )}
    </div>
  )
}

const svgProps = {
  width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2.6,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/** An icon-only control still needs a NAME. title alone is not announced
 *  reliably, so both are set and kept identical. */
function IconButton({ busy, label, style, onClick, children }: {
  busy: boolean
  label: string
  style: React.CSSProperties
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{ ...btn, ...style, opacity: busy ? 0.5 : 1 }}
    >
      {children}
    </button>
  )
}

const btn: React.CSSProperties = {
  width: 26,
  height: 26,
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  lineHeight: 1,
}
