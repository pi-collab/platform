'use client'

import { useState } from 'react'

interface Event {
  id: string
  event_type: string
  detail: any
  created_at: string
}

const STEPS = ['Offer sent', 'Negotiating', 'Agreed', 'Submitted', 'Approved', 'Invoice', 'Paid'] as const

const STEP_STATUS: Record<number, string> = {
  0: '__created',
  1: 'negotiating',
  2: 'agreed',
  3: 'delivered',
  4: 'approved',
  5: '__invoice',
  6: 'paid',
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
      for (const [idx, status] of Object.entries(STEP_STATUS)) {
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

export default function StepperTimeline({ currentStepIndex, nextLabel, events }: { currentStepIndex: number; nextLabel: string; events: Event[] }) {
  const stepDates = deriveStepDates(events)
  const [hoveredStep, setHoveredStep] = useState<number | null>(null)

  return (
    <div className="surface" style={{ padding: '18px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {STEPS.map((label, i) => {
          const done = i < currentStepIndex
          const current = i === currentStepIndex
          const dateStr = stepDates[i]
          const showTooltip = hoveredStep === i && dateStr

          return (
            <div
              key={label}
              style={{ position: 'relative', flex: '1 1 0%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}
              onMouseEnter={() => setHoveredStep(i)}
              onMouseLeave={() => setHoveredStep(null)}
            >
              {/* Enlarged hover target — invisible, covers the full step column */}
              <div style={{ position: 'relative', width: '100%', height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {i > 0 && (
                  <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 'calc(50% - 15px)', height: 3, borderRadius: 3, background: done || (i - 1) < currentStepIndex ? 'var(--neon-deep)' : 'var(--border-hairline)' }} />
                )}
                {i < STEPS.length - 1 && (
                  <span style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 'calc(50% - 15px)', height: 3, borderRadius: 3, background: done && i < currentStepIndex ? 'var(--neon-deep)' : 'var(--border-hairline)' }} />
                )}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  background: done ? 'var(--neon, var(--lime-400))' : current ? 'var(--card)' : 'var(--sec, #F4F8FC)',
                  color: done || current ? 'var(--ink)' : 'var(--ink-faint)',
                  border: current ? '2px solid var(--ink)' : 'none',
                  transition: 'transform .12s ease',
                  transform: showTooltip ? 'scale(1.15)' : 'scale(1)',
                }}>
                  {done && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  )}
                  {current && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ink)' }} />}
                </span>
              </div>
              <span style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 11.5,
                fontWeight: done || current ? 700 : 600,
                whiteSpace: 'nowrap',
                color: done || current ? 'var(--ink)' : 'var(--ink-faint)',
              }}>
                {label}
              </span>

              {/* Custom tooltip */}
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
                  {/* Arrow */}
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

      {/* Tooltip animation */}
      <style>{`@keyframes stepTooltipIn { from { opacity: 0; transform: translateX(-50%) translateY(4px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-hairline)' }}>
        <span />
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
          {nextLabel}
        </span>
      </div>
    </div>
  )
}
