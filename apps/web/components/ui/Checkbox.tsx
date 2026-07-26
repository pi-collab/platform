'use client'

import { forwardRef, type InputHTMLAttributes } from 'react'

/**
 * Checkbox — 18px, rounded-sm (6px), neon checked, focus ring.
 * From the GUAPD design system table spec.
 */

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = '', style, ...rest }, ref) => {
    return (
      <label className={`inline-flex items-center gap-2 cursor-pointer ${rest.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <span className="relative inline-flex">
          <input
            ref={ref}
            type="checkbox"
            className={`peer sr-only ${className}`}
            {...rest}
          />
          {/* Visual checkbox */}
          <span
            className="
              w-[18px] h-[18px] rounded-[6px]
              border border-[rgba(255,255,255,.85)]
              bg-[rgba(255,255,255,.6)]
              peer-checked:bg-brand peer-checked:border-transparent
              peer-focus-visible:ring-[4px] peer-focus-visible:ring-[rgba(218,254,12,.28)]
              transition-all duration-hover
              flex items-center justify-center
            "
          >
            {/* Check glyph (only visible when checked via peer) */}
            <svg
              className="w-3 h-3 text-ink opacity-0 peer-checked:opacity-100"
              style={{ position: 'absolute' }}
              viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="2 6 5 9 10 3" />
            </svg>
          </span>
          {/* Overlay check for peer-checked visibility */}
          <svg
            className="absolute inset-0 w-[18px] h-[18px] text-ink opacity-0 peer-checked:opacity-100 pointer-events-none p-[3px]"
            viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="2 6 5 9 10 3" />
          </svg>
        </span>
        {label && <span className="text-small text-ink">{label}</span>}
      </label>
    )
  }
)

Checkbox.displayName = 'Checkbox'
export default Checkbox
