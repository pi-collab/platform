'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { sendPaymentReminder } from '@/app/creator/payments/actions'

/**
 * Creator payments, mobile — built to "Creator Payments - Mobile Standalone".
 *
 * Renders below 720px; PaymentsClient keeps desktop.
 *
 * Unlike the deals and notifications mockups, this one is STATIC — no bindings,
 * no state, no loops. Everything dynamic had to come from what the page already
 * computes, so the notes below say where a decision was mine rather than the
 * design's.
 *
 * ── Decisions the mockup could not make ───────────────────────────────────
 * • PAGE SIZE 4. The mockup shows four rows on page 1 with a page 2, and a
 *   full first page is the only way both are true.
 * • MANY PENDING PAYOUTS. It draws exactly one "Awaiting payment" card; a
 *   creator can have several. One card each, so none is hidden.
 * • EXPORT IS REAL. Nothing server-side exists for it, so rather than draw a
 *   button that does nothing it builds a CSV in the browser from the history
 *   already loaded. Covers ALL paid invoices, not the visible page — an export
 *   that silently gave you four rows would be worse than no export.
 */

export interface PendingRow {
  id: string
  dealId: string
  dealTitle: string
  brandName: string
  brandInitials: string
  amountPaise: number
  status: string
  dueDateStr: string | null
  isOverdue: boolean
}

export interface HistoryRow {
  id: string
  dealId: string
  dealTitle: string
  brandName: string
  brandInitials: string
  amountPaise: number
  paidDate: string
  paidAt: string | null
}

const PAGE_SIZE = 4

/** Full rupees with Indian grouping — the hero prints ₹4,97,250, not ₹4.97L. */
function inr(paise: number): string {
  return '₹' + Math.round(paise / 100).toLocaleString('en-IN')
}

function monthLabel(iso: string | null): string {
  if (!iso) return 'Earlier'
  return new Date(iso).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function CreatorPaymentsMobile({
  totalEarnedPaise, upiId, pending, history,
}: {
  totalEarnedPaise: number
  upiId: string | null
  pending: PendingRow[]
  history: HistoryRow[]
}) {
  const [page, setPage] = useState(0)
  const [reminded, setReminded] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [remindError, setRemindError] = useState<Record<string, string>>({})

  const pageCount = Math.max(1, Math.ceil(history.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const shown = history.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  /* Month headings come from the rows on THIS page. Grouping the whole history
     and then slicing would print a heading for a month whose rows are all on
     the next page. */
  const groups = useMemo(() => {
    const out: { label: string; rows: HistoryRow[] }[] = []
    for (const row of shown) {
      const label = monthLabel(row.paidAt)
      const last = out[out.length - 1]
      if (last && last.label === label) last.rows.push(row)
      else out.push({ label, rows: [row] })
    }
    return out
  }, [shown])

  async function remind(id: string) {
    setBusy(id)
    setRemindError((p) => ({ ...p, [id]: '' }))
    const res = await sendPaymentReminder(id)
    setBusy(null)
    /* Only claim it was sent if it WAS. The action returns
       { status: 'success' | 'error' }, and it refuses on a rate limit as well
       as on a bad invoice state — so an optimistic tick would tell a creator
       their brand had been nudged when nothing left the building. The refusal
       reason is shown, because "nothing happened" is not an answer when the
       real one is "you already chased them yesterday". */
    if (res.status === 'success') {
      setReminded((p) => ({ ...p, [id]: true }))
    } else {
      setRemindError((p) => ({ ...p, [id]: res.message }))
    }
  }

  function exportCsv() {
    const header = ['Paid on', 'Brand', 'Deal', 'Amount (INR)']
    const lines = [header, ...history.map((h) => [
      h.paidAt ? new Date(h.paidAt).toISOString().slice(0, 10) : '',
      h.brandName, h.dealTitle, (h.amountPaise / 100).toFixed(2),
    ])]
    const csv = lines.map((r) => r.map(csvCell).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `guapd-payments-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="cpay-m">
      <header className="cpay-m__head">
        <h1 className="cpay-m__title">Payments</h1>
        <Link href="/creator/notifications?from=payments" className="cpay-m__bell" aria-label="Notifications">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </Link>
      </header>

      <div className="cpay-m__stack">
        {/* Hero */}
        <section className="cpay-m__hero">
          <div className="cpay-m__hero-label">
            You&rsquo;ve <span className="cpay-m__hero-em">guapped</span>
          </div>
          <div className="cpay-m__hero-amount tnum">{inr(totalEarnedPaise)}</div>
          <div className="cpay-m__payout">
            <span className="cpay-m__payout-text">
              {upiId ? <>UPI &middot; {upiId} &middot; verified</> : 'No payout method added yet'}
            </span>
            <Link href="/creator/profile" className="cpay-m__manage">
              {upiId ? 'Manage' : 'Add UPI'}
            </Link>
          </div>
        </section>

        {/* One card per pending payout — the design draws one, a creator can
            have several, and a hidden invoice is money nobody chases. */}
        {pending.map((p) => (
          <section key={p.id} className="cpay-m__pending">
            <div className="cpay-m__pending-tag">
              <span className="cpay-m__pending-dot" style={{ background: p.isOverdue ? '#C4494F' : '#E0B75C' }} />
              <span>{p.isOverdue ? 'Overdue' : 'Awaiting payment'}</span>
            </div>
            <div className="cpay-m__pending-row">
              <span className="cpay-m__pending-brand">{p.brandName}</span>
              <span className="cpay-m__pending-amount tnum">{inr(p.amountPaise)}</span>
            </div>
            <div className="cpay-m__pending-sub">
              {p.dealTitle}
              {p.dueDateStr && <> &middot; {p.isOverdue ? 'was due' : 'expected'} {p.dueDateStr}</>}
            </div>
            <div className="cpay-m__pending-actions">
              <button
                type="button"
                onClick={() => remind(p.id)}
                disabled={busy === p.id || reminded[p.id]}
                className="cpay-m__btn-dark"
              >
                {reminded[p.id] ? 'Reminder sent' : busy === p.id ? 'Sending…' : 'Send reminder'}
              </button>
              <Link href={`/creator/deals/${p.dealId}`} className="cpay-m__btn-soft">View deal</Link>
            </div>
            {remindError[p.id] && (
              <p className="cpay-m__remind-error" role="alert">{remindError[p.id]}</p>
            )}
          </section>
        ))}

        {/* Ledger */}
        <section className="cpay-m__ledger">
          <div className="cpay-m__ledger-head">
            <h2 className="cpay-m__ledger-title">Payment history</h2>
            {history.length > 0 && (
              <button type="button" onClick={exportCsv} className="cpay-m__export">Export</button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="cpay-m__empty">
              Nothing paid out yet. Completed deals appear here once the brand releases payment.
            </p>
          ) : (
            <>
              {groups.map((g) => (
                <div key={g.label}>
                  <div className="cpay-m__month">{g.label}</div>
                  {g.rows.map((h) => (
                    <Link key={h.id} href={`/creator/deals/${h.dealId}`} className="cpay-m__drow">
                      <span className="cpay-m__davatar" aria-hidden="true">{h.brandInitials}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="cpay-m__dbrand">{h.brandName}</div>
                        <div className="cpay-m__dsub">{h.dealTitle} &middot; {h.paidDate}</div>
                      </div>
                      <span className="cpay-m__damount tnum">{inr(h.amountPaise)}</span>
                    </Link>
                  ))}
                </div>
              ))}

              {pageCount > 1 && (
                <div className="cpay-m__pager">
                  <button type="button" className="pgbtn" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} aria-label="Previous page">&lsaquo;</button>
                  {Array.from({ length: pageCount }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`pgbtn${i === safePage ? ' is-on' : ''}`}
                      onClick={() => setPage(i)}
                      aria-current={i === safePage ? 'page' : undefined}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button type="button" className="pgbtn" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} aria-label="Next page">&rsaquo;</button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
