'use client'

import { useEffect, useRef, useState } from 'react'
import SignOutButton from '@/components/SignOutButton'
import ContactLink from '@/components/ContactLink'

/**
 * Guapd Growth: the desktop header.
 *
 * The Growth page renders outside the creator app shell, deliberately, so it
 * never got CreatorSidebar and therefore had no desktop chrome at all. This is
 * that nav's shape and proportion, carrying only what a Growth creator can
 * actually reach.
 *
 * Deals, Payments and Shopfront are absent for the same reason the sidebar is,
 * not as an oversight: every one of them redirects straight back to this page.
 *
 * Tabs are BUTTONS driven by the parent's state, not links. There is one route
 * here; the tabs switch what the page shows.
 */
export default function GrowthTopNav({ tab, setTab, fullName, photoUrl }: {
  tab: 'dashboard' | 'profile'
  setTab: (t: 'dashboard' | 'profile') => void
  fullName: string
  photoUrl: string | null
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close on an outside click or Escape. A dropdown that only closes by
  // re-clicking its own trigger is one people leave hanging over the page.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initial = (fullName || 'C').charAt(0).toUpperCase()

  return (
    <header className="gr-topnav">
      <nav className="gr-nav">
        <span className="gr-nav__brand">
          <svg width="26" height="26" viewBox="0 0 336 336" fill="none" aria-hidden="true">
            <path d="M168 12C278 12 324 112 324 188C324 276 252 324 168 324C84 324 12 276 12 188C12 112 58 12 168 12Z" fill="#E8FF66" />
            <ellipse cx="114" cy="126" rx="54" ry="36" fill="#fff" opacity="0.55" />
            <ellipse cx="168" cy="188" rx="24" ry="10" fill="#fff" opacity="0.18" />
          </svg>
          <span className="gr-nav__word">guapd</span>
        </span>

        <div className="gr-nav__pills">
          <button
            type="button"
            className="gr-nav__pill"
            aria-current={tab === 'dashboard' ? 'page' : undefined}
            onClick={() => setTab('dashboard')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" />
            </svg>
            Dashboard
          </button>
          <button
            type="button"
            className="gr-nav__pill"
            aria-current={tab === 'profile' ? 'page' : undefined}
            onClick={() => setTab('profile')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            Profile
          </button>
        </div>

        <div className="gr-nav__right" ref={wrapRef}>
          <button
            type="button"
            className="gr-nav__avatarbtn"
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => setOpen(o => !o)}
          >
            <span className="gr-nav__avatar" aria-hidden="true">
              {photoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={photoUrl} alt="" />
                : <span>{initial}</span>}
            </span>
            <span className="gr-nav__who">
              <span className="gr-nav__name">{fullName || 'Your profile'}</span>
              <span className="gr-nav__role">
                <span className="gr-nav__dot" />
                Creator
              </span>
            </span>
            <svg className="gr-nav__chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {open && (
            <div className="gr-menu" role="menu">
              <div className="gr-menu__head">
                <span className="gr-menu__avatar" aria-hidden="true">
                  {photoUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={photoUrl} alt="" />
                    : <span>{initial}</span>}
                </span>
                <span className="gr-menu__who">
                  <span className="gr-menu__name">{fullName || 'Your profile'}</span>
                  <span className="gr-menu__tag">Creator</span>
                </span>
              </div>

              <div className="gr-menu__rule" />

              {/* A button, not a link: Profile is a tab on this page, and there
                  is no /creator/settings for a Growth creator to land on. */}
              <button
                type="button"
                className="gr-menu__item"
                role="menuitem"
                onClick={() => { setTab('profile'); setOpen(false) }}
              >
                <span className="gr-menu__icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <span className="gr-menu__label">Profile</span>
              </button>

              {/* The real contact dialog, the same one the footer and the
                  creator profile open. Deals points Help & support at
                  /creator/settings, which a Growth creator cannot reach, so
                  pointing there would be a link into a redirect loop. */}
              <ContactLink className="gr-menu__item">
                <span className="gr-menu__icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <path d="M12 17h.01" />
                  </svg>
                </span>
                <span className="gr-menu__label">Help &amp; support</span>
              </ContactLink>

              <div className="gr-menu__rule" />

              {/* SignOutButton, not a hand-rolled sign out: redirectTo is the
                  thing that must not be got wrong, and it lives in one place. */}
              <SignOutButton redirectTo="/login/creator" className="gr-menu__item gr-menu__item--danger">
                <span className="gr-menu__icon gr-menu__icon--danger">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />
                  </svg>
                </span>
                <span className="gr-menu__label">Sign out</span>
              </SignOutButton>
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}
