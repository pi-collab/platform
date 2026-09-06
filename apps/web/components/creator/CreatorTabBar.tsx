'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The creator app's bottom navigation.
 *
 * Five tabs, transcribed from the mobile export. The Profile tab is drawn there
 * as a disabled <span> showing an avatar initial — a mock, since the design has
 * nowhere to go. Here it is a real link, because /creator/settings exists and a
 * dead tab in a five-tab bar is worse than no tab.
 *
 * A client component only because it needs usePathname to mark the current tab.
 * Everything else about it is static.
 */

const TABS = [
  {
    href: '/creator/dashboard',
    label: 'Dashboard',
    icon: (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </>
    ),
  },
  {
    href: '/creator/deals',
    label: 'Deals',
    icon: (
      <>
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </>
    ),
  },
  {
    href: '/creator/inbox',
    label: 'Inbox',
    icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  },
  {
    href: '/creator/payments',
    label: 'Payments',
    icon: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </>
    ),
  },
]

export default function CreatorTabBar({ initial, unreadInbox = 0 }: { initial?: string | null; unreadInbox?: number }) {
  const pathname = usePathname() ?? ''

  // startsWith, not equality: /creator/deals/<id> is still the Deals tab, and a
  // bar that loses its highlight the moment you open something is worse than
  // one that never had it.
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <nav className="creator-tabbar" aria-label="Creator navigation">
      {TABS.map((tab) => {
        const current = isCurrent(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="creator-tab"
            aria-current={current ? 'page' : undefined}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {tab.icon}
            </svg>
            <span className="creator-tab__label">{tab.label}</span>
            {/* Waiting messages, on the tab that leads to them. The count was
                already computed for the sidebar and simply never reached the
                phone's navigation. */}
            {tab.label === 'Inbox' && unreadInbox > 0 && (
              <span className="creator-tab__badge" aria-label={`${unreadInbox} unread`}>
                {unreadInbox > 9 ? '9+' : unreadInbox}
              </span>
            )}
            <span className="creator-tab__marker" aria-hidden="true" />
          </Link>
        )
      })}

      {/* Profile carries the creator's initial instead of an icon, matching the
          export. Falls back to a dot rather than a letter when there is no name
          yet — an empty circle reads as broken, and a stray letter reads as
          someone else's account. */}
      <Link
        href="/creator/profile"
        className="creator-tab"
        aria-current={isCurrent('/creator/profile') ? 'page' : undefined}
      >
        <span
          aria-hidden="true"
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            flexShrink: 0,
            background: 'var(--sec-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 9.5,
            color: 'var(--ink)',
          }}
        >
          {initial?.trim()?.charAt(0)?.toUpperCase() || '\u00B7'}
        </span>
        <span className="creator-tab__label">Profile</span>
        <span className="creator-tab__marker" aria-hidden="true" />
      </Link>
    </nav>
  )
}
