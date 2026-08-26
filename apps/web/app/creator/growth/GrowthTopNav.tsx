'use client'

import SignOutButton from '@/components/SignOutButton'

/**
 * Guapd Growth: the desktop header.
 *
 * The Growth page renders outside the creator app shell, deliberately, so it
 * never got CreatorSidebar and therefore had no desktop chrome at all. What was
 * left was the phone layout stretched across a monitor with a bottom tab bar
 * fixed at every width.
 *
 * This is CreatorSidebar's desktop top nav in shape and proportion, carrying
 * only what a Growth creator can actually reach: Dashboard, Profile, sign out.
 * The Deals, Payments and Shopfront pills are absent for the same reason the
 * sidebar is, not as an oversight -- every one of them redirects straight back
 * to this page.
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
            Dashboard
          </button>
          <button
            type="button"
            className="gr-nav__pill"
            aria-current={tab === 'profile' ? 'page' : undefined}
            onClick={() => setTab('profile')}
          >
            Profile
          </button>
        </div>

        <div className="gr-nav__right">
          <span className="gr-nav__avatar" aria-hidden="true">
            {photoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={photoUrl} alt="" />
              : <span>{(fullName || 'C').charAt(0).toUpperCase()}</span>}
          </span>
          {/* To /login/creator, never the brand page: the default sent creators
              to brand sign-in, which then offered to set up a brand for them. */}
          <SignOutButton
            redirectTo="/login/creator"
            className="gr-nav__signout"
            label="Sign out"
          />
        </div>
      </nav>
    </header>
  )
}
