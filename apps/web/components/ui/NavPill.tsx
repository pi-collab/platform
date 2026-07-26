'use client'

import type { ReactNode, ButtonHTMLAttributes } from 'react'

/**
 * NavPill — pill tab / filter from the GUAPD design system.
 * States: inactive, hover, active (with optional count chip).
 */

interface NavPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  count?: number | null
  children: ReactNode
}

export default function NavPill({ active = false, count, children, className = '', ...rest }: NavPillProps) {
  return (
    <button
      className={`
        px-[14px] py-2 rounded-pill text-small font-sans leading-none
        transition-all duration-hover whitespace-nowrap flex-shrink-0
        focus-visible:outline-none focus-visible:ring-[4px] focus-visible:ring-[rgba(218,254,12,.28)]
        ${active
          ? 'bg-frost-strong text-ink font-semibold shadow-glass'
          : 'bg-transparent text-ink-soft font-medium hover:bg-frost hover:text-ink'
        }
        ${className}
      `}
      {...rest}
    >
      {children}
      {count != null && (
        <span className="ml-[6px] text-[11px] text-ink-faint">{count}</span>
      )}
    </button>
  )
}
