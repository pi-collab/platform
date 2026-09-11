'use client'

import { useState } from 'react'

/**
 * Connect Instagram, with our own disclosure in front of it.
 *
 * WHY AN INTERSTITIAL, and not a panel of text above the button: we cannot put
 * anything between Instagram's login and Instagram's permission screen - that
 * flow is Meta's and we hand off to it. So the only place our own explanation
 * can live is before the hand-off, and the question is only whether it is in
 * the path or beside it.
 *
 * Beside it - collapsed on the panel - is the version most people never open,
 * which makes it disclosure in name only, and it pushed the button itself half
 * a screen down. In the path, it is unmissable and it creates a real choice
 * point: Continue, or Cancel, before anything has been asked of Instagram.
 *
 * The order a creator experiences is then: our plain-language notice -> their
 * Instagram login -> Instagram's own permission screen, which is the
 * authoritative grant. Ours explains, Meta's decides.
 */
export default function InstagramConnectButton({
  label, href, onContinue, className, style, disabled = false,
}: {
  label: string
  /** Where Continue goes. Settings hands off directly. */
  href?: string
  /** The storefront saves the creator's edits first, then redirects itself. */
  onContinue?: () => void
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)

  function proceed() {
    setOpen(false)
    if (onContinue) { onContinue(); return }
    if (href) window.location.href = href
  }

  return (
    <>
      <button type="button" className={className} style={style} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 80,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            background: 'rgba(18,21,28,.45)', backdropFilter: 'blur(2px)',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Connect Instagram"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
            style={{
              width: 'min(520px, 100%)', maxHeight: '88vh', overflowY: 'auto',
              borderRadius: 22, background: 'var(--card, #fff)', padding: '26px 24px',
              boxShadow: '0 40px 90px -30px rgba(18,21,28,.5)',
              fontFamily: 'var(--font-ui)', color: 'var(--ink)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{
                width: 36, height: 36, borderRadius: 12, flex: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--sec-2, #F7F4FB)', color: 'var(--ink)',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="20" x="2" y="2" rx="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>
                  Connect Instagram
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 2 }}>
                  Instagram will ask you to sign in and approve this next.
                </div>
              </div>
            </div>

            <Heading>What Guapd will read</Heading>
            <ul style={listStyle}>
              <Line>
                <b>Your profile</b> &mdash; username, account type, follower count and profile picture,
                so your shopfront shows figures a brand can see came from Instagram.
              </Line>
              <Line>
                <b>Your audience insights</b> &mdash; reach, interactions, and the age, gender and city
                split of your followers, shown as percentages. Never anyone&rsquo;s name or contact details.
              </Line>
              <Line>
                <b>Your recent reels</b> &mdash; thumbnail, caption, link, views and likes, so you can
                feature real work. We keep a copy of the thumbnails you feature, because Instagram&rsquo;s
                own image links expire after a few hours and your page would go blank.
              </Line>
            </ul>

            <Heading>What it cannot do</Heading>
            <ul style={listStyle}>
              <Line muted>
                It is <b>read-only</b>. Guapd cannot post, comment, reply or change anything on your
                account, and we never ask Instagram for permission to.
              </Line>
              <Line muted>It is not a login. You keep signing in to Guapd with your phone number.</Line>
              <Line muted>We cannot read your DMs or anything belonging to other people.</Line>
            </ul>

            <p style={{ margin: '16px 0 0', fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
              You can disconnect at any time from Guapd, or from Instagram under{' '}
              <em>Settings &rarr; Website permissions &rarr; Apps and websites</em>. Either one deletes
              the access token and everything we stored from Instagram; the figures you typed yourself
              are not affected.{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Read our privacy policy
              </a>.
            </p>

            <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={proceed}
                autoFocus
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, height: 44, padding: '0 20px',
                  borderRadius: 12, background: 'var(--neon)', border: 'none',
                  fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 13, color: 'var(--ink)',
                  cursor: 'pointer',
                  boxShadow: '0 10px 22px -12px rgba(180,210,60,.9)',
                }}
              >
                Continue to Instagram
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  display: 'inline-flex', alignItems: 'center', height: 44, padding: '0 18px',
                  borderRadius: 12, background: 'var(--card)', border: '1px solid var(--hairline, #EAEAE3)',
                  fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, color: 'var(--ink)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const listStyle: React.CSSProperties = {
  margin: '10px 0 0', padding: 0, listStyle: 'none',
  display: 'flex', flexDirection: 'column', gap: 8,
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em',
      textTransform: 'uppercase', color: 'var(--ink-soft)', marginTop: 20,
    }}>
      {children}
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
