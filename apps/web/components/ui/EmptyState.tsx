'use client'

import type { ReactNode } from 'react'

/**
 * EmptyState — calm glass panel centered in content area.
 * Mascot (or icon) → heading → one line of subtext → one primary CTA.
 */

interface EmptyStateProps {
  icon?: ReactNode
  heading: string
  subtext: string
  action?: ReactNode
}

export default function EmptyState({ icon, heading, subtext, action }: EmptyStateProps) {
  return (
    <div className="glass rounded-lg px-8 py-16 flex flex-col items-center text-center gap-4">
      {icon && <div className="w-16 h-16 flex items-center justify-center">{icon}</div>}
      <h3
        className="font-display font-semibold tracking-[-0.02em]"
        style={{ fontSize: '32px', lineHeight: '1.3' }}
      >
        {heading}
      </h3>
      <p className="text-body text-ink-soft max-w-[42ch]">{subtext}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
