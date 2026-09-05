'use client'

import { useState } from 'react'
import Link from 'next/link'
import UpiRow from './UpiRow'
import { sendPaymentReminder } from './actions'

// ── Types ──────────────────────────────────────────────────────
interface PendingPayment {
  id: string
  dealId: string
  dealTitle: string
  brandName: string
  brandInitials: string
  amountPaise: number
  status: string
  meta: string
}

interface HistoryPayment {
  id: string
  dealId: string
  dealTitle: string
  brandName: string
  brandInitials: string
  amountPaise: number
  paidDate: string
  paidMonthsAgo: number
}

interface ReadyToInvoice {
  dealId: string
  dealTitle: string
  brandName: string
  brandInitials: string
  amountPaise: number
}

interface Props {
  totalEarnedPaise: number
  pendingAmountPaise: number
  pendingCount: number
  pending: PendingPayment[]
  history: HistoryPayment[]
  /** Approved, posted, not yet invoiced. See the banner below for why this is
   *  on the payments screen at all. */
  readyToInvoice?: ReadyToInvoice[]
  upiId?: string | null
}

// ── Helpers ────────────────────────────────────────────────────
function formatRupees(paise: number): string {
  if (paise === 0) return '\u20B90'
  const rupees = paise / 100
  if (rupees >= 10000000) return `\u20B9${(rupees / 10000000).toFixed(1)}Cr`
  if (rupees >= 100000) {
    const l = rupees / 100000
    const s = l.toFixed(l >= 10 ? 1 : 1).replace(/\.0$/, '')
    return `\u20B9${s}L`
  }
  if (rupees >= 1000) return `\u20B9${(rupees / 1000).toFixed(0)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

function avatar(size: number): React.CSSProperties {
  return {
    width: size, height: size, borderRadius: size >= 44 ? 13 : 12, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: size >= 44 ? 15 : 13,
    color: 'var(--ink)', background: 'linear-gradient(135deg,var(--sec-2),var(--sec-2))',
    border: '1px solid var(--frost-edge, #e5e5dc)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9)',
  }
}

type FilterKey = 'all' | 'month' | '3m'

const FILTER_DEFS: [FilterKey, string][] = [['all', 'All'], ['month', 'This month'], ['3m', 'Last 3 months']]

const PAGE_SIZE = 5

export default function PaymentsClient({ totalEarnedPaise, pendingAmountPaise, pendingCount, pending, history, readyToInvoice = [], upiId = null }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [remindedIds, setRemindedIds] = useState<Record<string, boolean>>({})
  const [historyPage, setHistoryPage] = useState(0)

  const visibleHistory = history.filter((h) => {
    if (filter === 'month') return h.paidMonthsAgo === 0
    if (filter === '3m') return h.paidMonthsAgo <= 2
    return true
  })

  const totalPages = Math.max(1, Math.ceil(visibleHistory.length / PAGE_SIZE))
  const safePage = Math.min(historyPage, totalPages - 1)
  const pagedHistory = visibleHistory.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const periodSumPaise = visibleHistory.reduce((a, h) => a + h.amountPaise, 0)
  const periodName = filter === 'month' ? 'this month' : filter === '3m' ? 'last 3 months' : 'all time'

  async function handleRemind(id: string) {
    setRemindedIds((prev) => ({ ...prev, [id]: true }))
    const result = await sendPaymentReminder(id)
    if (result.status === 'error') {
      setRemindedIds((prev) => ({ ...prev, [id]: false }))
    }
  }

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      {/* title */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 'clamp(20px,2.6vw,28px)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(26px,3vw,34px)', lineHeight: 1.05, letterSpacing: '-0.025em', margin: 0 }}>
          Payments
        </h1>
      </div>

      <div className="pay-grid">
        {/* ═══════════ MAIN COLUMN ═══════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* ── Ready to invoice ──
              Work finished, money not yet asked for. This screen reads entirely
              from invoices, so without this a creator with approved, posted
              deals and no invoice was told "All settled" and "Nothing owed" —
              both untrue, and both hiding that the next move was theirs. */}
          {readyToInvoice.length > 0 && (
            <section className="surface" style={{ padding: 'clamp(20px,2.2vw,26px)', boxShadow: '0 0 0 1.5px var(--neon), 0 8px 16px rgba(22,23,15,.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em', fontSize: 18, margin: 0 }}>
                  Ready to invoice
                </h2>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)' }}>
                  {readyToInvoice.length === 1 ? '1 deal' : `${readyToInvoice.length} deals`}
                </span>
              </div>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)', margin: '6px 0 0', lineHeight: 1.5 }}>
                Approved and posted. Raise the invoice to start the clock on payment.
              </p>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {readyToInvoice.map((r) => (
                  <div key={r.dealId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderTop: '1px solid var(--border-hairline)' }}>
                    <span style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: '#E7EAF0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12 }}>
                      {r.brandInitials}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14 }}>{r.brandName}</div>
                      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)', marginTop: 3 }}>{r.dealTitle}</div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' }}>
                      {formatRupees(r.amountPaise)}
                    </span>
                    <Link href={`/creator/deals/${r.dealId}`} style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 999, background: 'var(--ink)', color: '#fff', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                      Raise invoice
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Pending payments ── */}
          <section className="surface" style={{ padding: 'clamp(20px,2.2vw,26px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em', fontSize: 18, margin: 0 }}>
                Pending payments
              </h2>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)' }}>
                {pending.length === 0 ? (readyToInvoice.length > 0 ? 'None invoiced yet' : 'All settled') : pending.length === 1 ? '1 payment' : `${pending.length} payments`}
              </span>
            </div>

            {pending.length > 0 ? (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {pending.map((p) => {
                  const reminded = !!remindedIds[p.id]
                  return (
                    <div key={p.id} style={{
                      borderRadius: 18, border: '1px solid rgba(216,154,46,.34)',
                      background: 'linear-gradient(160deg,rgba(255,251,242,.95),rgba(255,247,233,.7))',
                      padding: 18, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.85),0 14px 30px -24px rgba(160,120,30,.5)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                        <span style={avatar(46)}>{p.brandInitials}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15.5 }}>{p.dealTitle}</span>
                            {p.status && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '3px 10px', borderRadius: 'var(--radius-pill, 999px)',
                                background: 'rgba(210,84,90,.1)', border: '1px solid rgba(210,84,90,.26)',
                                fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 10.5,
                                letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--danger, #d2545a)',
                              }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--danger, #d2545a)' }} />
                                {p.status}
                              </span>
                            )}
                          </div>
                          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 5 }}>{p.meta}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, letterSpacing: '-0.03em' }}>
                            {formatRupees(p.amountPaise)}
                          </div>
                          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}>owed to you</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                        {reminded ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 7,
                            padding: '10px 16px', borderRadius: 'var(--radius-pill, 999px)',
                            background: 'var(--sec-2, #f5f5f0)', border: '1px solid var(--sec-mid-2, #e5e5dc)',
                            fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'var(--sec-ink, #4a5c3a)',
                          }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                            Reminder sent
                          </span>
                        ) : (
                          <button
                            onClick={() => handleRemind(p.id)}
                            className="neonbtn"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 7,
                              padding: '11px 18px', borderRadius: 'var(--radius-pill, 999px)',
                              background: 'var(--neon)', border: 'none',
                              fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13,
                              color: 'var(--ink)', cursor: 'pointer',
                              boxShadow: '0 10px 22px -8px rgba(180,210,60,.85)',
                            }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
                            </svg>
                            Send reminder
                          </button>
                        )}
                        <Link
                          href={`/creator/deals/${p.dealId}`}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '11px 17px', borderRadius: 'var(--radius-pill, 999px)',
                            background: 'var(--card)', border: '1px solid var(--frost-edge, #e5e5dc)',
                            fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13,
                            color: 'var(--ink)', textDecoration: 'none',
                          }}
                        >
                          View deal
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'clamp(28px,4vw,42px) 24px 10px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, letterSpacing: '-0.01em', marginTop: 16 }}>
                  You're all paid up
                </div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-faint)', marginTop: 9, maxWidth: 320, lineHeight: 1.55 }}>
                  Every completed deal has been paid out. New pending payments will show up here.
                </div>
              </div>
            )}
          </section>

          {/* ── Payment history ── */}
          <section className="surface" style={{ padding: 'clamp(20px,2.2vw,26px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em', fontSize: 18, margin: 0 }}>
                Payment history
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 'var(--radius-pill, 999px)', background: 'var(--card)', border: '1px solid var(--frost-edge, #e5e5dc)' }}>
                  {FILTER_DEFS.map(([key, label]) => (
                    <div
                      key={key}
                      onClick={() => { setFilter(key); setHistoryPage(0) }}
                      style={{
                        padding: '7px 13px', borderRadius: 'var(--radius-pill, 999px)',
                        fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600,
                        whiteSpace: 'nowrap', cursor: 'pointer',
                        ...(filter === key
                          ? { color: 'var(--ink)', background: 'var(--card)', boxShadow: '0 4px 12px -8px rgba(40,45,25,.5)' }
                          : { color: 'var(--ink-faint)', background: 'transparent' }),
                      }}
                    >
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {visibleHistory.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink-faint)' }}>
                  No payments in this period
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                {pagedHistory.map((h) => (
                  <Link
                    key={h.id}
                    href={`/creator/deals/${h.dealId}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 15,
                      padding: '14px 12px', margin: '0 -12px', borderRadius: 14,
                      borderTop: '1px solid var(--border-hairline, #EAEAE3)',
                      textDecoration: 'none', color: 'inherit',
                    }}
                  >
                    <span style={avatar(42)}>{h.brandInitials}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14.5 }}>{h.dealTitle}</span>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '2px 9px', borderRadius: 'var(--radius-pill, 999px)',
                          background: 'var(--sec-2, #f5f5f0)', border: '1px solid var(--sec-mid-2, #e5e5dc)',
                          fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 10.5, color: 'var(--sec-ink, #4a5c3a)',
                        }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                          Complete
                        </span>
                      </div>
                      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 4 }}>
                        {h.brandName} · paid {h.paidDate}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>
                        {formatRupees(h.amountPaise)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-hairline, #EAEAE3)',
              }}>
                <button
                  onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 32, borderRadius: 9,
                    background: 'var(--card)', border: '1px solid var(--frost-edge, #e5e5dc)',
                    cursor: safePage === 0 ? 'not-allowed' : 'pointer',
                    opacity: safePage === 0 ? 0.35 : 1,
                    color: 'var(--ink)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setHistoryPage(i)}
                    style={{
                      width: 32, height: 32, borderRadius: 9,
                      fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12.5,
                      border: safePage === i ? 'none' : '1px solid var(--frost-edge, #e5e5dc)',
                      background: safePage === i ? 'var(--ink)' : 'var(--card)',
                      color: safePage === i ? '#fff' : 'var(--ink-soft)',
                      cursor: 'pointer',
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setHistoryPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={safePage === totalPages - 1}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 32, borderRadius: 9,
                    background: 'var(--card)', border: '1px solid var(--frost-edge, #e5e5dc)',
                    cursor: safePage === totalPages - 1 ? 'not-allowed' : 'pointer',
                    opacity: safePage === totalPages - 1 ? 0.35 : 1,
                    color: 'var(--ink)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </button>
              </div>
            )}

            {visibleHistory.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                marginTop: 16, paddingTop: 16, borderTop: '1.5px solid var(--border-hairline, #EAEAE3)',
              }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)' }}>
                  {visibleHistory.length} {visibleHistory.length === 1 ? 'payment' : 'payments'} · {periodName}
                </span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-faint)' }}>
                    Total for period
                  </span>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, letterSpacing: '-0.03em', marginTop: 3 }}>
                    {formatRupees(periodSumPaise)}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ═══════════ RIGHT RAIL ═══════════ */}
        <aside className="pay-rail">
          {/* Total earned focal panel */}
          <div style={{
            position: 'relative', overflow: 'hidden', borderRadius: 26, padding: 26,
            border: '1px solid rgba(255,255,255,.92)',
            background: 'linear-gradient(158deg,var(--card) 0%,var(--sec, #eef0e4) 54%,#dde7f3 100%)',
            boxShadow: '0 36px 66px -32px rgba(40,45,25,.46),inset 0 1.5px 0 rgba(255,255,255,1),inset 0 -18px 38px -24px rgba(60,90,140,.12)',
          }}>
            <div aria-hidden="true" style={{
              position: 'absolute', top: -56, right: -40, width: 210, height: 210, borderRadius: '50%',
              background: 'radial-gradient(circle at 50% 50%,rgba(210,240,74,.32),transparent 66%)',
              filter: 'blur(20px)', pointerEvents: 'none',
            }} />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-faint)' }}>
                Total earned
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: 11, background: 'var(--neon)',
                boxShadow: '0 6px 14px -6px rgba(180,210,60,.9)',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
              </span>
            </div>
            <div style={{ position: 'relative', zIndex: 1, marginTop: 14, display: 'inline-block' }}>
              <span style={{
                position: 'absolute', left: -7, right: -7, top: '22%', bottom: '9%',
                background: 'var(--neon)', borderRadius: 9, transform: 'rotate(-1.5deg)', zIndex: 0,
              }} />
              <span style={{
                position: 'relative', zIndex: 1,
                fontFamily: 'var(--font-display)', fontWeight: 700,
                fontSize: 'clamp(40px,4vw,50px)', lineHeight: 1, letterSpacing: '-0.035em',
              }}>
                {formatRupees(totalEarnedPaise)}
              </span>
            </div>
            <div style={{ position: 'relative', zIndex: 1, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 12 }}>
              Lifetime · across all deals
            </div>

            <div style={{ position: 'relative', zIndex: 1, marginTop: 22, paddingTop: 20, borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
              <div style={{
                fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 9.5,
                letterSpacing: '.14em', textTransform: 'uppercase' as const,
                display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-faint)',
              }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: 'var(--warning)' }} />
                Pending
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 7 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em' }}>
                  {formatRupees(pendingAmountPaise)}
                </span>
                {pendingCount > 0 && (
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700, color: 'var(--warning)' }}>
                    ({pendingCount})
                  </span>
                )}
              </div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--ink-faint)', marginTop: 3 }}>
                {pendingCount === 0 ? (readyToInvoice.length > 0 ? 'Not invoiced yet' : 'Nothing owed') : `${pendingCount} ${pendingCount === 1 ? 'payment' : 'payments'} due`}
              </div>
            </div>
          </div>

          {/* Payout method */}
          <div className="surface" style={{ padding: 18 }}>
            <span style={{ display: 'block', fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-faint)', marginBottom: 14 }}>
              Payout method
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 46, height: 46, flexShrink: 0, borderRadius: 13,
                background: 'linear-gradient(135deg,var(--sec-2, #f5f5f0),var(--sec-2, #f5f5f0))',
                border: '1px solid var(--frost-edge, #e5e5dc)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9)',
              }}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m3 10 9-6 9 6" /><path d="M4 10v9M20 10v9M8 10v9M16 10v9M12 10v9M2 21h20" /></svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14.5 }}>UPI</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--sec-ink, #4a5c3a)' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--sec-ink, #4a5c3a)' }} />
                  Where money lands
                </div>
              </div>
            </div>
            {/* Was a link to /creator/settings, which has no UPI field — a
                dead end for the one setting that decides whether a creator can
                be paid at all. */}
            <div style={{ marginTop: 15 }}>
              <UpiRow initialUpiId={upiId} />
            </div>
            <Link
              href="/creator/settings"
              hidden
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                marginTop: 15, padding: 11, borderRadius: 14,
                background: 'var(--card)', border: '1px solid var(--frost-edge, #e5e5dc)',
                fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13,
                color: 'var(--ink)', textDecoration: 'none',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
              Manage payout method
            </Link>
          </div>
        </aside>
      </div>

      <style>{`
        .pay-grid { display: grid; grid-template-columns: minmax(0,1fr) 344px; gap: 16px; align-items: start; }
        .pay-rail { position: sticky; top: 92px; display: flex; flex-direction: column; gap: 16px; }
        @media (max-width: 860px) {
          .pay-grid { grid-template-columns: 1fr; }
          .pay-rail { position: static; }
        }
      `}</style>
    </div>
  )
}
