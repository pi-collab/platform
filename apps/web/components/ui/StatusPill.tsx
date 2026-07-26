'use client'

/**
 * StatusPill — pill-shaped status badge from the GUAPD design system.
 * Driven by the STATUS map verbatim from docs/design-system.md.
 */

export const STATUS: Record<string, { label: string; text: string; bg: string; border: string; dot?: string }> = {
  draft:       { label: 'Draft',       text: '#4A4F58', bg: 'rgba(120,130,150,.10)', border: 'rgba(120,130,150,.22)' },
  ready:       { label: 'Ready',       text: '#2C7CC4', bg: '#F0FAFF',               border: 'rgba(90,169,230,.28)' },
  sent:        { label: 'Sent',        text: '#2C7CC4', bg: '#F0FAFF',               border: 'rgba(90,169,230,.28)', dot: '#5AA9E6' },
  negotiating: { label: 'Negotiating', text: '#A9761D', bg: '#FFFEF3',               border: 'rgba(216,154,46,.30)' },
  agreed:      { label: 'Agreed',      text: '#2F6FBF', bg: 'rgba(46,111,191,.10)',  border: 'rgba(46,111,191,.26)' },
  delivered:   { label: 'Delivered',   text: '#3B7C9E', bg: 'rgba(59,124,158,.10)',  border: 'rgba(59,124,158,.26)' },
  revision:    { label: 'Revision',    text: '#D89A2E', bg: '#FFFEF3',               border: 'rgba(216,154,46,.30)' },
  approved:    { label: 'Approved',    text: '#7A5CC4', bg: 'rgba(122,92,196,.12)',  border: 'rgba(122,92,196,.28)' },
  complete:    { label: 'Complete',    text: '#1F8A5B', bg: 'rgba(31,157,107,.10)',  border: 'rgba(31,157,107,.24)' },
  paid:        { label: 'Paid',        text: '#1F9D6B', bg: '#ECFBF5',               border: 'rgba(31,157,107,.24)', dot: '#1F9D6B' },
  declined:    { label: 'Declined',    text: '#9B3030', bg: 'rgba(210,84,90,.09)',   border: 'rgba(210,84,90,.24)', dot: '#D2545A' },
  cancelled:   { label: 'Cancelled',   text: '#8B90A0', bg: 'rgba(120,130,150,.10)', border: 'rgba(120,130,150,.22)' },
}

interface StatusPillProps {
  status: string
  className?: string
}

export default function StatusPill({ status, className = '' }: StatusPillProps) {
  const s = STATUS[status] ?? STATUS.draft

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        borderRadius: '9999px',
        padding: '3px 10px',
        fontSize: '11px',
        fontWeight: 600,
        fontFamily: 'var(--font-inter), system-ui, sans-serif',
        letterSpacing: '0.01em',
        lineHeight: '1.4',
        color: s.text,
        background: s.bg,
        border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {s.dot && (
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '9999px',
            background: s.dot,
            flexShrink: 0,
          }}
        />
      )}
      {s.label}
    </span>
  )
}
