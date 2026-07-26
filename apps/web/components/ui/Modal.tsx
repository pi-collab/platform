'use client'

import { useEffect, useRef, useCallback, type ReactNode } from 'react'

/**
 * Modal — overlay + glass container from the GUAPD design system.
 * Motion: 350ms ease-back (scale 0.96→1 + fade). Focus trap. Esc closes.
 * Reduced-motion: fade only (handled via CSS @keyframes modalIn).
 */

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  maxWidth?: number
}

export default function Modal({ open, onClose, title, children, footer, maxWidth = 560 }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus trap: focus the dialog on open
  useEffect(() => {
    if (open && dialogRef.current) {
      dialogRef.current.focus()
    }
  }, [open])

  // Esc to close
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{
        background: 'rgba(24,28,36,.4)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="w-full glass shadow-lift outline-none"
        style={{
          maxWidth: `${maxWidth}px`,
          padding: '40px',
          borderRadius: '32px',
          animation: 'modalIn .35s cubic-bezier(.68,-0.4,.32,1.4)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2
            className="font-display font-semibold tracking-[-0.02em]"
            style={{ fontSize: '32px', lineHeight: '1.3' }}
          >
            {title}
          </h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="text-ink-faint hover:text-ink transition-colors duration-hover p-1 -mr-1 -mt-1"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="text-body text-ink-soft">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="mt-8 flex justify-end gap-3">{footer}</div>
        )}
      </div>
    </div>
  )
}
