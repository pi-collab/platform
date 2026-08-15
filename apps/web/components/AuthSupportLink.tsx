import Link from 'next/link'

/**
 * "Can't access your account? Contact us" — the last line on every auth screen.
 *
 * Auth screens are the one place a user can be completely stuck with no way to
 * self-serve: wrong address, unconfirmed account, lost password, wrong door.
 * Every other escape on these pages assumes they can still act on their own.
 * This one does not.
 *
 * ── Destination ─────────────────────────────────────────────────────────────
 * Points at a mailto for now. The support form is not built yet, and a link to
 * a route that 404s is worse than no link at all on a page whose whole job is
 * unsticking someone.
 *
 * The address is deliberately NOT rendered as text — it opens in their mail
 * client instead. When the support form ships, change SUPPORT_HREF here and
 * every auth screen follows; that is the reason this is a component rather
 * than a line of JSX copied five times.
 */
const SUPPORT_HREF = 'mailto:contact@guapd.com'

/** True once SUPPORT_HREF is an in-app route rather than a mailto. */
const isInternal = !SUPPORT_HREF.startsWith('mailto:')

export default function AuthSupportLink({ className = 'auth-support' }: { className?: string }) {
  return (
    <p className={className}>
      Can&rsquo;t access your account?{' '}
      {isInternal ? (
        <Link href={SUPPORT_HREF} className="auth-support__link">Contact us</Link>
      ) : (
        <a href={SUPPORT_HREF} className="auth-support__link">Contact us</a>
      )}
    </p>
  )
}
