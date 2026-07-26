'use client'

import type { ReactNode, HTMLAttributes } from 'react'

/**
 * Card (.glass) and CardSoft (.glass-soft) from the GUAPD design system.
 * Card: primary glass, 24px radius, p-6, glass + soft shadow, hover lift.
 * CardSoft: secondary, 16px radius, no shadow, lighter.
 */

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hoverable?: boolean
}

export function Card({ children, hoverable = false, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`glass p-6 ${hoverable ? 'transition-transform duration-hover ease-out hover:-translate-y-0.5' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardSoft({ children, hoverable = false, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`glass-soft p-6 ${hoverable ? 'transition-all duration-hover ease-out hover:-translate-y-0.5 hover:shadow-soft' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
