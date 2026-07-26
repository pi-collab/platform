'use client'

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react'

/**
 * Input, Textarea, Select — frosted pill fields from the GUAPD design system.
 * States: default, placeholder, focus (neon ring), filled, success, error, disabled.
 */

const baseInputStyle = `w-full box-border px-[18px] py-[13px] min-h-[44px] font-sans text-[14px]
  text-ink placeholder:text-ink-faint bg-[rgba(255,255,255,.6)] backdrop-blur-[8px]
  border border-[rgba(255,255,255,.85)] outline-none transition-[border-color,box-shadow] duration-hover
  focus:border-[#D2F04A] focus:shadow-[0_0_0_4px_rgba(218,254,12,.28)]
  aria-[invalid=true]:border-[#D2545A]
  disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[rgba(245,248,252,.7)] disabled:backdrop-blur-0`

// ── Input ──
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
  success?: boolean
  label?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, success, label, className = '', ...rest }, ref) => {
    const borderOverride = error
      ? 'border-[#D2545A]'
      : success
      ? 'border-[#1F9D6B]'
      : ''

    return (
      <label className="block">
        {label && (
          <span className="block mb-2 text-small font-medium text-ink-soft">{label}</span>
        )}
        <input
          ref={ref}
          aria-invalid={error ? 'true' : undefined}
          className={`${baseInputStyle} rounded-pill ${borderOverride} ${className}`}
          {...rest}
        />
        {error && (
          <p className="mt-[6px] text-[13px] text-[#D2545A]">{error}</p>
        )}
      </label>
    )
  }
)
Input.displayName = 'Input'

// ── Textarea ──
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string
  label?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, label, className = '', ...rest }, ref) => {
    return (
      <label className="block">
        {label && (
          <span className="block mb-2 text-small font-medium text-ink-soft">{label}</span>
        )}
        <textarea
          ref={ref}
          aria-invalid={error ? 'true' : undefined}
          className={`${baseInputStyle} rounded-lg min-h-[112px] py-3 resize-y ${error ? 'border-[#D2545A]' : ''} ${className}`}
          {...rest}
        />
        {error && (
          <p className="mt-[6px] text-[13px] text-[#D2545A]">{error}</p>
        )}
      </label>
    )
  }
)
Textarea.displayName = 'Textarea'

// ── Select ──
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string
  label?: string
  children: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, label, children, className = '', ...rest }, ref) => {
    return (
      <label className="block">
        {label && (
          <span className="block mb-2 text-small font-medium text-ink-soft">{label}</span>
        )}
        <div className="relative">
          <select
            ref={ref}
            aria-invalid={error ? 'true' : undefined}
            className={`${baseInputStyle} rounded-pill appearance-none pr-11 ${error ? 'border-[#D2545A]' : ''} ${className}`}
            {...rest}
          >
            {children}
          </select>
          {/* Chevron */}
          <svg
            className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-ink-faint"
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        {error && (
          <p className="mt-[6px] text-[13px] text-[#D2545A]">{error}</p>
        )}
      </label>
    )
  }
)
Select.displayName = 'Select'
