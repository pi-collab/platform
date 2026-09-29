import Link from 'next/link'
import ContactLink from '@/components/ContactLink'

/**
 * Shown instead of the creator roster while an account is waiting on review.
 *
 * ── What it must not do ─────────────────────────────────────────────────────
 * Not accuse anybody. The commonest reason to land here is a company whose
 * staff mail is on a different domain from its website, which describes real
 * businesses — so the screen says the account is being checked, which is true,
 * and does not say why, which would read as a charge to answer.
 *
 * It also must not be a dead end. There is a route to a human on it, and the
 * rest of the product still works: they can finish setting up, and if a creator
 * sent them here they can still reach that creator.
 */
export default function RosterUnderReview({ originCreatorHref }: {
  /** The creator whose link brought them, when there is one. */
  originCreatorHref?: string | null
}) {
  return (
    <div style={{ padding: 'clamp(32px,6vw,80px) clamp(18px,4vw,44px)' }}>
      <div style={{
        maxWidth: 560, margin: '0 auto', textAlign: 'center',
        background: '#FFFFFF', borderRadius: 24, border: '1px solid rgba(18,21,28,.06)',
        boxShadow: '0 1px 2px rgba(18,21,28,.03), 0 8px 16px rgba(18,21,28,.04), 0 32px 64px rgba(18,21,28,.05)',
        padding: 'clamp(28px,4vw,44px)',
      }}>
        <span style={{
          width: 46, height: 46, borderRadius: 14, background: '#F1F3EA',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
          </svg>
        </span>

        <h1 style={{ margin: '18px 0 0', fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em' }}>
          We&rsquo;re checking your account
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
          Browsing creators opens once someone here has looked over your details. It
          usually takes a few hours, and we&rsquo;ll email you the moment it does.
        </p>

        <p style={{ margin: '14px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
          Everything else still works &mdash; you can finish setting up your brand in
          the meantime.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 22 }}>
          {/* The creator who sent them, when one did. Their whole reason for
              being here, so it leads. */}
          {originCreatorHref && (
            <Link href={originCreatorHref} style={{ ...btn, background: 'var(--ink)', color: '#fff', border: 'none' }}>
              View the creator who invited you
            </Link>
          )}
          <Link href="/dashboard" style={btn}>Go to dashboard</Link>
          <ContactLink label="Contact us" style={{ ...btn, cursor: 'pointer', fontFamily: 'inherit' }} />
        </div>
      </div>
    </div>
  )
}

const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  height: 44, padding: '0 20px', borderRadius: 999,
  border: '1px solid rgba(18,21,28,.18)', background: '#FFFFFF', color: 'var(--ink)',
  fontSize: 14, fontWeight: 600, textDecoration: 'none',
}
