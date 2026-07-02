'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { label: 'Deals', href: '/deals' },
  { label: 'Browse Creators', href: '/browse' },
]

export default function BrandNavLinks() {
  const pathname = usePathname()

  return (
    <nav style={{ display: 'flex', gap: '0.25rem' }}>
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(link.href + '/')
        return (
          <Link
            key={link.href}
            href={link.href}
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: '0.875rem',
              fontWeight: active ? 600 : 400,
              color: active ? '#111' : '#888',
              textDecoration: 'none',
              borderRadius: 6,
              background: active ? '#f5f5f5' : 'transparent',
            }}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
