'use client'

import { useState } from 'react'

interface Event {
  id: string
  event_type: string
  detail: any
  created_at: string
}

const STAGES = ['Offer received', 'Agreed', 'Submitted', 'Approved', 'Invoice', 'Paid'] as const

const STATUS_TO_STAGE: Record<string, number> = {
  negotiating: 0, agreed: 1, delivered: 2, revision: 2, approved: 3, paid: 4, complete: 5, declined: -1, cancelled: -1,
}

const STAGE_STATUS: Record<number, string> = {
  0: '__created',
  1: 'agreed',
  2: 'delivered',
  3: 'approved',
  4: 'paid',
  5: 'complete',
}

function deriveStepDates(events: Event[]): Record<number, string> {
  const dates: Record<number, string> = {}
  for (const ev of events) {
    if (ev.event_type === 'deal.created' && dates[0] === undefined) {
      dates[0] = ev.created_at
    }
    if (ev.event_type === 'deal.status_changed') {
      const detail = ev.detail as { to?: string; new_status?: string } | null
      const to = detail?.to ?? detail?.new_status
      if (!to) continue
      for (const [idx, status] of Object.entries(STAGE_STATUS)) {
        if (status === to) dates[Number(idx)] = ev.created_at
      }
    }
  }
  return dates
}

function formatStepDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function CreatorStepper({ dealStatus, events, invoiceStatus }: { dealStatus: string; events: Event[]; invoiceStatus?: string | null }) {
  let stageIndex = STATUS_TO_STAGE[dealStatus] ?? 0
  // When invoice is issued/accepted, advance stepper to Invoice stage
  if (invoiceStatus === 'issued' || invoiceStatus === 'accepted') stageIndex = 4
  if (invoiceStatus === 'paid' || dealStatus === 'paid') stageIndex = 5
  const allDone = dealStatus === 'complete' || dealStatus === 'paid' || invoiceStatus === 'paid'
  const stepDates = deriveStepDates(events)
  const [hoveredStep, setHoveredStep] = useState<number | null>(null)

  const footerLabel = dealStatus === 'revision'
    ? 'Revision requested'
    : allDone
      ? 'Deal complete'
      : dealStatus === 'complete' || stageIndex >= STAGES.length - 1
        ? 'Complete'
        : `Next \u00B7 ${STAGES[stageIndex + 1]?.toLowerCase() ?? ''}`

  return (
    <div className="surface" style={{ padding: '18px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {STAGES.map((label, i) => {
          const done = allDone || i < stageIndex
          const current = !allDone && i === stageIndex
          const leftBar = i > 0
          const rightBar = i < STAGES.length - 1
          const leftColor = (allDone || (i - 1) < stageIndex) ? 'var(--neon-deep)' : 'var(--border-hairline, #EAEAE3)'
          const rightColor = (allDone || i < stageIndex) ? 'var(--neon-deep)' : 'var(--border-hairline, #EAEAE3)'
          const dateStr = stepDates[i]
          const showTooltip = hoveredStep === i && dateStr

          const dotStyle: React.CSSProperties = {
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            transition: 'transform .12s ease',
            transform: showTooltip ? 'scale(1.15)' : 'scale(1)',
            ...(done
              ? { background: 'var(--neon-deep)', color: 'var(--ink)', border: '2px solid var(--card)', boxShadow: '0 0 0 2px var(--neon-deep), 0 5px 12px -4px rgba(180,210,60,.7)' }
              : current
                ? { background: 'var(--neon)', color: 'var(--ink)', border: '2px solid var(--card)', boxShadow: '0 0 0 2px var(--neon-deep), 0 0 0 6px rgba(232,255,102,.28)' }
                : { background: 'var(--card)', color: 'var(--ink-faint)', border: '2px solid #C6D0DD', boxShadow: 'inset 0 1px 2px rgba(40,45,25,.06)' }),
          }

          return (
            <div
              key={i}
              style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}
              onMouseEnter={() => setHoveredStep(i)}
              onMouseLeave={() => setHoveredStep(null)}
            >
              <div style={{ position: 'relative', width: '100%', height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {leftBar && <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 'calc(50% - 15px)', height: 3, borderRadius: 3, background: leftColor }} />}
                {rightBar && <span style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 'calc(50% - 15px)', height: 3, borderRadius: 3, background: rightColor }} />}
                <span style={dotStyle}>
                  {done && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                  {current && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ink)' }} />}
                </span>
              </div>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, fontWeight: current ? 700 : 600, whiteSpace: 'nowrap', color: done || current ? 'var(--ink)' : 'var(--ink-faint)' }}>
                {label}
              </span>

              {/* Tooltip on hover */}
              {showTooltip && (
                <div style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 8px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '6px 12px',
                  borderRadius: 10,
                  background: 'var(--ink)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: 'var(--font-ui)',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  zIndex: 10,
                  boxShadow: '0 4px 12px rgba(22,23,15,.18)',
                  animation: 'stepTooltipIn .12s ease-out',
                }}>
                  {formatStepDate(dateStr)}
                  <span style={{
                    position: 'absolute',
                    bottom: -4,
                    left: '50%',
                    transform: 'translateX(-50%) rotate(45deg)',
                    width: 8,
                    height: 8,
                    background: 'var(--ink)',
                    borderRadius: 1,
                  }} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <style>{`@keyframes stepTooltipIn { from { opacity: 0; transform: translateX(-50%) translateY(4px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
        <span />
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: dealStatus === 'revision' ? 'var(--warning)' : 'var(--ink-soft)' }}>
          {footerLabel}
        </span>
      </div>
    </div>
  )
}
