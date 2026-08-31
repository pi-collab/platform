import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Instagram data deletion · Guapd' }

/**
 * The status page for an Instagram data deletion request.
 *
 * Meta requires the deletion callback to return a URL where the person can see
 * what happened, in plain language, including a reason for anything not
 * deleted.
 *
 * Deletion here is immediate and synchronous — the callback removes the token
 * and the snapshot before it responds — so this page reports a completed state
 * rather than tracking progress. It says what was removed AND what was not, so
 * nobody has to infer that their deal history survived.
 */
export default function InstagramDataDeletionPage({
  searchParams,
}: { searchParams: { code?: string } }) {
  const code = (searchParams.code ?? '').replace(/[^a-f0-9]/gi, '').slice(0, 32)

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(32px, 6vw, 72px) 20px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'clamp(26px, 3.4vw, 34px)', letterSpacing: '-0.02em', margin: 0 }}>
        Instagram data deletion
      </h1>

      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 16, lineHeight: 1.6, color: 'var(--ink-soft, #565C68)', marginTop: 16 }}>
        Your request has been completed. We removed the Instagram data we held for your account.
      </p>

      {code && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-faint, #878D99)', marginTop: 12 }}>
          Confirmation code: <strong style={{ color: 'var(--ink, #12151C)' }}>{code}</strong>
        </p>
      )}

      <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, marginTop: 32 }}>What we deleted</h2>
      <ul style={{ fontFamily: 'var(--font-ui)', fontSize: 14.5, lineHeight: 1.7, color: 'var(--ink-soft, #565C68)', paddingLeft: 20, marginTop: 8 }}>
        <li>The access token connecting your Instagram account to Guapd</li>
        <li>Your Instagram profile details: username, follower count, media count, bio and picture</li>
        <li>Your audience figures: age, gender and city breakdowns, and reach</li>
      </ul>

      <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, marginTop: 28 }}>What we kept, and why</h2>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14.5, lineHeight: 1.7, color: 'var(--ink-soft, #565C68)', marginTop: 8 }}>
        Your Guapd account, your deals and any figures you entered yourself are unchanged. None of
        that came from Instagram, and deals are agreements with brands who rely on the same record.
        Disconnecting Instagram is not the same as closing your Guapd account.
      </p>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14.5, lineHeight: 1.7, color: 'var(--ink-soft, #565C68)', marginTop: 12 }}>
        To delete your Guapd account entirely, email{' '}
        <a href="mailto:contact@guapd.com" style={{ color: 'var(--ink, #12151C)', fontWeight: 600 }}>contact@guapd.com</a>.
      </p>
    </main>
  )
}
