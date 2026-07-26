'use client'

import type { ReactNode } from 'react'

/**
 * Banner — inline glass plate with status dot.
 * Tones: error, warning, info, success.
 * Dot colors: error #D2545A · warning #D89A2E · info #5AA9E6 · success #1F9D6B.
 */

type Tone = 'error' | 'warning' | 'info' | 'success'

const DOT_COLORS: Record<Tone, string> = {
  error: '#D2545A',
  warning: '#D89A2E',
  info: '#5AA9E6',
  success: '#1F9D6B',
}

const TEXT_COLORS: Record<Tone, string> = {
  error: '#9B3030',
  warning: '#A9761D',
  info: '#2C7CC4',
  success: '#1F8A5B',
}

interface BannerProps {
  tone: Tone
  children: ReactNode
  /** Use destructive=true for page-level destructive banner (tinted bg) */
  destructive?: boolean
  className?: string
}

export default function Banner({ tone, children, destructive = false, className = '' }: BannerProps) {
  return (
    <div
      className={`flex items-center gap-3 px-[18px] py-[14px] rounded-md border border-[rgba(255,255,255,.85)] glass-soft shadow-glass ${className}`}
      style={destructive ? { background: '#FFEBEB', color: '#9B3030' } : { color: TEXT_COLORS[tone] }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '9999px',
          background: DOT_COLORS[tone],
          flexShrink: 0,
        }}
      />
      <span className="text-small font-medium">{children}</span>
    </div>
  )
}
