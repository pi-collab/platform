
import Link from 'next/link'
import Wordmark from '@/components/Wordmark'

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

/**
 * The prompt opposite the logo. Every auth screen carries one, pointing at the
 * flow the reader is NOT in: signup offers the way to log in, login offers the
 * way to sign up. Password reset is the exception and passes nothing — see the
 * note on `navRight`.
 *
 * A component rather than four copies of the same two elements, because the
 * markup is what the breakpoint rules key on: below the fold it is re-pinned to
 * the foot of the form with a neon dot before it, and a hand-rolled copy that
 * missed a class would silently lose that.
 */
export function AuthNavRight({ label, ctaLabel, href }: { label: string; ctaLabel: string; href: string }) {
  return (
    <div className="signup-nav__right">
      <span className="signup-nav__label">{label}</span>
      <Link href={href} className="signup-nav__cta">{ctaLabel}</Link>
    </div>
  )
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
          {/* Two tones, toggled by breakpoint. On desktop the logo sits in a
              white pill; on mobile it sits directly on the dark band, so it
              needs the light artwork. The asset cannot be swapped in CSS, and
              inverting the dark one shifts its colour rather than using the
              artwork that exists.

              Same <Wordmark> at the same 24px as the marketing header, so every
              header on the site carries one lockup.

              Wrapped in spans rather than given the classes directly: Wordmark
              sets display inline-style, which outranks a class rule, so the
              breakpoint's `display: none` never took and both tones rendered
              side by side. */}
          {/* The wordmark is the way back out of the auth flow. It was inert,
              which leaves someone who opened the wrong screen with no exit
              short of the browser's back button. */}
          <Link href="/" aria-label="Guapd home" className="signup-nav__logo signup-nav__logo--dark">
            <Wordmark height={24} />
          </Link>
          <Link href="/" aria-label="Guapd home" className="signup-nav__logo signup-nav__logo--light">
            <Wordmark height={24} tone="light" />
          </Link>
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
