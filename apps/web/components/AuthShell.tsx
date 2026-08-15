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
 */
export default function AuthShell({
  children,
  navRight,
}: {
  children: React.ReactNode
  navRight?: React.ReactNode
}) {
  return (
    <main className="signup-shell">
      <div className="signup-shell__dark" />

      <div className="signup-nav-wrap">
        <nav className="signup-nav">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/guapd-logo-dark.svg" alt="guapd" className="signup-nav__logo" />
          {navRight}
        </nav>
      </div>

      <div className="signup-grid">
        <section className="signup-pitch">
          <div className="signup-pitch__inner">
            <div className="signup-pitch__rule" />
            <h1 className="signup-pitch__title">
              Your whole deal<br />flow, one platform.
            </h1>
            <p className="signup-pitch__sub">
              Source, negotiate and manage campaigns — all from one place built for brands.
            </p>
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
