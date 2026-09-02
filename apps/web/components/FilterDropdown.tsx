'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The dropdown used across creator and brand screens.
 *
 * Lifted from the dashboard's period picker, which was the one control in the
 * app that looked deliberate: a bordered trigger, a floating panel, the active
 * row tinted with a tick beside it. Everything else used a bare <select>, so the
 * same page carried two visual languages depending on which filter you looked
 * at.
 *
 * ── Why not a <select> ──────────────────────────────────────────────────────
 * A native select cannot be styled to this on every platform, cannot hold a
 * tick, and — the reason that actually forced it — cannot do multi-select
 * without ctrl-clicking, which is not a real interaction on a phone. Niche
 * needed multi-select, so the choice was this or a second dropdown language.
 *
 * The keyboard and dismissal behaviour a native select gives free is rebuilt
 * here rather than skipped: Escape closes, outside-click closes, the trigger
 * reports its state, and options are real buttons.
 */

export interface FilterOption {
  value: string
  label: string
  /** Shown right-aligned, e.g. a count. */
  hint?: string
}

interface BaseProps {
  options: FilterOption[]
  /** Shown on the trigger when nothing is selected. */
  placeholder: string
  /** Optional leading icon on the trigger. */
  icon?: React.ReactNode
  align?: 'left' | 'right'
  minWidth?: number
}

type SingleProps = BaseProps & {
  multiple?: false
  value: string
  onChange: (value: string) => void
}

type MultiProps = BaseProps & {
  multiple: true
  value: string[]
  onChange: (value: string[]) => void
}

export default function FilterDropdown(props: SingleProps | MultiProps) {
  const { options, placeholder, icon, align = 'left', minWidth = 220 } = props
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    // Escape closes, because a panel that only dismisses by clicking away traps
    // keyboard users.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = props.multiple ? props.value : [props.value]
  const isActive = (v: string) => selected.includes(v)

  // "Beauty, Fashion" up to two, then a count. Listing six niches turns the
  // trigger into a paragraph and pushes the row it sits in out of shape.
  const label = (() => {
    const chosen = options.filter((o) => isActive(o.value) && o.value !== 'all' && o.value !== 'any')
    if (chosen.length === 0) return placeholder
    if (chosen.length <= 2) return chosen.map((o) => o.label).join(', ')
    return `${chosen.length} selected`
  })()

  function pick(value: string) {
    if (props.multiple) {
      // "All" is a reset rather than another checkbox: selecting it alongside
      // three niches would be a contradiction the filter has to resolve anyway.
      if (value === 'all' || value === 'any') { props.onChange([]); return }
      const next = props.value.includes(value)
        ? props.value.filter((v) => v !== value)
        : [...props.value, value]
      props.onChange(next)
      return
    }
    props.onChange(value)
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '9px 14px', borderRadius: 12, border: '1px solid #D4D4CB',
          background: 'var(--card)', fontSize: '12.5px', fontWeight: 600,
          color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit',
          maxWidth: 260, whiteSpace: 'nowrap',
        }}
      >
        {icon}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="var(--ink-faint)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable={props.multiple || undefined}
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', zIndex: 50,
            ...(align === 'right' ? { right: 0 } : { left: 0 }),
            minWidth, maxHeight: 320, overflowY: 'auto',
            borderRadius: 14, border: '1px solid #EAEAE3', background: '#fff',
            boxShadow: '0 26px 52px -24px rgba(40,52,70,.5)',
            padding: 6, animation: 'fadeUp .16s cubic-bezier(.22,1,.36,1)',
          }}
        >
          {options.map((opt) => {
            // For a multi-select, "All" reads as active only when nothing else
            // is, which is what an empty selection means.
            const active = props.multiple && (opt.value === 'all' || opt.value === 'any')
              ? selected.length === 0
              : isActive(opt.value)

            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => pick(opt.value)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  width: '100%', padding: '9px 11px', borderRadius: 10,
                  fontFamily: 'var(--font-ui)', fontSize: 13,
                  fontWeight: active ? 700 : 500, color: 'var(--ink)',
                  background: active ? 'rgba(232,255,102,.28)' : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {opt.hint && (
                    <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--ink-faint)' }}>{opt.hint}</span>
                  )}
                  {active && (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
