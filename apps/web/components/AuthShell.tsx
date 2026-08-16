import Link from 'next/link'

/**
 * The split shell from "Brand Login - Paged Flow": dark pitch panel on the
 * left, form panel on the right, floating logo pill across the top.
 *
 * Extracted from /login/brand so /reset-password shares one definition rather
 * than carrying a second copy of the same markup. Uses the .signup-* classes,
 * which are named for where they first appeared rather than for this shell —
 * worth renaming if a fourth page joins, not worth the churn for two.
 *
 * `navRight` is whatever sits opposite the logo. Password reset passes nothing:
 * the user arrived from an email mid-task, and offering "Create account" there
 * invites them to abandon it.
 *
 * `pitch` overrides the left panel. It defaults to the brand copy because that
 * is what three of the four screens using this shell say; the creator flow
 * addresses a different reader and gets its own.
 */
export const BRAND_PITCH = {
  title: <>Your whole deal<br />flow, one platform.</>,
  sub: 'Source, negotiate and manage campaigns, all from one place built for brands.',
}

export const CREATOR_LOGIN_PITCH = {
  title: <>Every deal.<br />Every payout.</>,
  sub: 'Track offers, manage deals and get paid, all from one place built for creators.',
}

export const CREATOR_PITCH = {
  title: <>Everything a<br />collaboration needs.</>,
  sub: 'From the first offer to the final payout, guapd keeps brands and creators on the same page.',
}

export default function AuthShell({
  children,
  navRight,
  pitch = BRAND_PITCH,
}: {
  children: React.ReactNode
  navRight?: React.ReactNode
  pitch?: { title: React.ReactNode; sub: string }
}) {
  return (
    <main className="signup-shell">
      <div className="signup-shell__dark" />

      <div className="signup-nav-wrap">
        <nav className="signup-nav">
          {/* Two files, toggled by breakpoint. On desktop the logo sits in a
              white pill; on mobile it sits directly on the dark band, so it
              needs the light artwork. An img src cannot be swapped in CSS, and
              inverting the dark one shifts its colour rather than using the
              asset that exists. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/guapd-logo-dark.svg" alt="guapd" className="signup-nav__logo signup-nav__logo--dark" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/guapd-logo-light.svg" alt="" aria-hidden="true" className="signup-nav__logo signup-nav__logo--light" />
          {navRight}
        </nav>
      </div>

      <div className="signup-grid">
        <section className="signup-pitch">
          <div className="signup-pitch__inner">
            <div className="signup-pitch__rule" />
            <h1 className="signup-pitch__title">{pitch.title}</h1>
            <p className="signup-pitch__sub">{pitch.sub}</p>
          </div>
        </section>

        <section className="signup-panel">{children}</section>
      </div>
    </main>
  )
}

/** The "New here? Create account" pair, for pages that offer signup. */
export function CreateAccountNav() {
  return (
    <div className="signup-nav__right">
      <span className="signup-nav__label">New here?</span>
      <Link href="/signup/brand" className="signup-nav__cta">Create account</Link>
    </div>
  )
}
