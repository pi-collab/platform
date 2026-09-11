/**
 * What Guapd is about to ask Instagram for, said before we ask.
 *
 * The connect button sat under a benefit ("brands trust a number they can see")
 * and one vague line ("this only reads your Instagram data"). A creator pressing
 * it met Meta's own permission screen without ever being told, in our words,
 * which data we read, what we do with it, who ends up seeing it, or that some of
 * it is copied onto our servers. Consent to a screen you were not prepared for
 * is weak consent, and Meta's App Review looks for exactly this disclosure.
 *
 * Deliberately concrete. "We may access your profile information" is the kind of
 * sentence that passes review and tells the person nothing; each line below
 * names a real field and the reason it is read.
 *
 * Shown at BOTH places a connection can start - settings and the storefront
 * editor - because a creator who connects from the storefront was getting no
 * disclosure at all.
 */
export default function InstagramConsent({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{
      marginTop: 14, padding: compact ? '14px 16px' : '16px 18px', borderRadius: 14,
      background: 'var(--sec-2, #F7F4FB)', border: '1px solid var(--hairline, #EAEAE3)',
    }}>
      <div style={{
        fontFamily: 'var(--font-ui)', fontSize: 10.5, fontWeight: 700,
        letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-soft)',
      }}>
        What Guapd will read
      </div>

      <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Line>
          <b>Your profile</b> — username, account type, follower count and profile picture,
          so your shopfront shows figures a brand can see came from Instagram.
        </Line>
        <Line>
          <b>Your audience insights</b> — reach, interactions, and the age, gender and city
          split of your followers, shown on your shopfront as percentages. Never anyone&rsquo;s
          name or contact details.
        </Line>
        <Line>
          <b>Your recent reels</b> — the thumbnail, caption, link and view and like counts, so
          you can feature real work. We keep a copy of the thumbnails of the reels you feature,
          because Instagram&rsquo;s own image links expire after a few hours and your page would
          go blank.
        </Line>
      </ul>

      <div style={{
        fontFamily: 'var(--font-ui)', fontSize: 10.5, fontWeight: 700,
        letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginTop: 16,
      }}>
        What it cannot do
      </div>
      <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Line muted>
          It is <b>read-only</b>. Guapd cannot post, comment, reply, or change anything on your
          account, and we never ask Instagram for permission to.
        </Line>
        <Line muted>
          It is not a login. You keep signing in to Guapd with your phone number.
        </Line>
        <Line muted>
          We cannot read your DMs, your private account, or anything belonging to other people.
        </Line>
      </ul>

      <p style={{ margin: '16px 0 0', fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
        You can disconnect at any time here, or from Instagram under{' '}
        <em>Settings &rarr; Website permissions &rarr; Apps and websites</em>. Either one deletes
        the access token and everything we stored from Instagram. The figures you typed yourself
        are not affected.{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>
          Read our privacy policy
        </a>
        .
      </p>
    </div>
  )
}

function Line({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <li style={{ display: 'flex', gap: 9, fontSize: 12.5, lineHeight: 1.55, color: muted ? 'var(--ink-faint)' : 'var(--ink-soft)' }}>
      <span aria-hidden="true" style={{
        width: 5, height: 5, borderRadius: '50%', flex: 'none', marginTop: 7,
        background: muted ? 'var(--ink-faint)' : 'var(--neon-deep)',
      }} />
      <span>{children}</span>
    </li>
  )
}
