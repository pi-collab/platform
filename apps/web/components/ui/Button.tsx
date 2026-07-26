'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

/**
 * Button — all variants/sizes from the GUAPD design system.
 * Variants: primary, secondary (glass), ghost, destructive.
 * Sizes: sm, md, lg.
 * States: default, hover (lift), active (spring), disabled, loading.
 * Focus: 4px neon ring via focus-visible.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: ReactNode
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-4 py-[9px] text-[13px]',
  md: 'px-6 py-[13px] text-[14px]',
  lg: 'px-[30px] py-4 text-[16px]',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, disabled, className = '', children, ...rest }, ref) => {
    const isDisabled = disabled || loading

    const base = `inline-flex items-center justify-center gap-2 font-sans font-bold rounded-pill min-h-[44px] leading-none transition-all duration-hover relative ${sizeClasses[size]}`

    const variants: Record<Variant, string> = {
      primary: 'bg-brand text-ink shadow-neon ease-out hover:-translate-y-0.5 active:scale-[.97] active:ease-spring',
      secondary: 'glass-soft text-ink ease-out hover:-translate-y-0.5 hover:bg-frost-strong active:scale-[.97] active:ease-spring',
      ghost: 'bg-transparent text-ink rounded-sm ease-out hover:bg-frost-soft hover:-translate-y-0.5 active:scale-[.97] active:ease-spring',
      destructive: 'bg-danger-soft text-danger-text ease-out hover:bg-[#FCE0E0] hover:-translate-y-0.5 active:scale-[.97] active:ease-spring',
    }

    const disabledClasses = 'opacity-50 cursor-not-allowed !translate-y-0 !scale-100'
    const focusClasses = 'focus-visible:outline-none focus-visible:ring-[4px] focus-visible:ring-[rgba(218,254,12,.28)]'

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`${base} ${variants[variant]} ${isDisabled ? disabledClasses : ''} ${focusClasses} ${className}`}
        {...rest}
      >
        {loading && (
          <span
            className="absolute animate-spin"
            style={{
              width: '18px',
              height: '18px',
              border: '2px solid transparent',
              borderTopColor: variant === 'destructive' ? '#9B3030' : '#181C24',
              borderRadius: '9999px',
            }}
          />
        )}
        <span style={{ opacity: loading ? 0 : 1 }}>{children}</span>
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button
