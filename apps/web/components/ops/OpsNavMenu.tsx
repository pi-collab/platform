'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * The classic ops header's grouped nav: one dropdown per category, each with
 * its heading. A group with a single visible link renders as a plain link, so
 * the outreach role (which sees fewer pages) never gets a one-item menu.
 *
 * Presentational only. Which links appear is decided by the layout from the
 * actor's role; every page still runs its own gate.
 */
export interface OpsNavItem { href: string; label: string; hint: string }
export interface OpsNavGroup { title: string; items: OpsNavItem[] }

export default function OpsNavMenu({ groups }: { groups: OpsNavGroup[] }) {
  const pathname = usePathname() ?? ''
  const [open, setOpen] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setOpen(null) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <div ref={ref} style={{ display: 'flex', gap: '0.25rem', fontSize: '0.875rem', flexWrap: 'wrap' }}>
      {groups.filter((g) => g.items.length > 0).map((g) => {
        const active = g.items.some((i) => isActive(i.href))
        if (g.items.length === 1) {
          const i = g.items[0]
          return <Link key={g.title} href={i.href} style={{ ...trigger, ...(active ? triggerActive : null), textDecoration: 'none' }}>{i.label}</Link>
        }
        const isOpen = open === g.title
        return (
          <div key={g.title} style={{ position: 'relative' }}>
            <button type="button" aria-expanded={isOpen} aria-haspopup="menu" onClick={() => setOpen(isOpen ? null : g.title)}
              style={{ ...trigger, ...(active || isOpen ? triggerActive : null) }}>
              {g.title}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {isOpen && (
              <div role="menu" style={panel}>
                <div style={heading}>{g.title}</div>
                {g.items.map((i) => (
                  <Link key={i.href} href={i.href} role="menuitem" style={{ ...item, ...(isActive(i.href) ? itemActive : null) }}>
                    <span style={{ fontWeight: 600, color: '#111' }}>{i.label}</span>
                    <span style={{ fontSize: '0.75rem', color: '#888', marginTop: 2 }}>{i.hint}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const trigger: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.375rem 0.625rem', borderRadius: 8,
  border: 'none', background: 'transparent', color: '#555', font: 'inherit', fontSize: '0.875rem', cursor: 'pointer',
}
const triggerActive: React.CSSProperties = { background: '#f3f3f3', color: '#111', fontWeight: 600 }
const panel: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 240, zIndex: 40,
  background: '#fff', border: '1px solid #e5e5e5', borderRadius: 12, padding: '0.5rem',
  boxShadow: '0 12px 32px -12px rgba(0,0,0,.18)',
}
const heading: React.CSSProperties = {
  fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#888',
  padding: '0.375rem 0.625rem 0.5rem',
}
const item: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', padding: '0.5rem 0.625rem', borderRadius: 8, textDecoration: 'none',
}
const itemActive: React.CSSProperties = { background: '#f5f5f5' }
