import Link from 'next/link'
import type { IgConnectionView } from '@/lib/instagram-sync'

/**
 * Instagram's connection state, on the phone.
 *
 * The mobile profile had no route to connected accounts at all - the settings
 * page carries the tab and is responsive, but nothing on the phone linked to
 * it, so a creator working from their phone could neither connect nor see that
 * their numbers had gone stale.
 *
 * A STATUS row rather than a plain menu row, in the shape the shopfront row
 * above it already uses. Whether the numbers on your storefront are verified
 * is the thing worth knowing at a glance; "Connected accounts >" would make
 * you tap to find out.
 */
export default function ConnectedRow({ connection }: { connection: IgConnectionView }) {
  const s = connection.status

  /* ── The fault states say ONE thing ───────────────────────────────────────
     They used to carry the consequence too — "Needs reconnecting · numbers are
     stale", "Personal account · switch to Creator" — on a row that also holds
     an icon, a label, an action and a chevron. On a phone there was never
     width for it: the line truncated mid-word to "Needs reconnecting ·
     number…", which reads as a sentence that broke rather than a status.

     The state is the status; the instruction belongs to the action beside it
     and to the settings screen it opens. */
  const state = s === 'connected'
    ? { label: `Connected as @${connection.username ?? ''}`, tone: 'ok' as const, action: 'Manage' }
    : s === 'personal_account'
      ? { label: 'Personal account', tone: 'warn' as const, action: 'Fix' }
      : s === 'expired' || s === 'needs_reconnect'
        ? { label: 'Needs reconnecting', tone: 'warn' as const, action: 'Reconnect' }
        : { label: 'Show verified numbers on your shopfront', tone: 'off' as const, action: 'Connect' }

  const dot = state.tone === 'ok' ? 'var(--neon-deep, #C9EB3C)'
    : state.tone === 'warn' ? '#D89A2E'
      : 'var(--wg-400, #878D99)'

  /* Only a fault is coloured. The dot alone carried the state, which is a lot
     to ask of six pixels next to text in the same ink as every other row on
     the screen. Amber rather than red, and the same amber as the dashboard's
     reconnect banner: a connection that needs attention is not an error, and
     two different colours for one state across two screens is worse than
     either. */
  const textColor = state.tone === 'warn' ? '#A9761D' : 'var(--ink)'

  return (
    <Link
      href="/creator/settings?tab=connected"
      className="sr msurface"
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', minHeight: 60, textDecoration: 'none' }}
    >
      <span style={{
        width: 34, height: 34, borderRadius: 11, flex: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--sec-2, #F7F4FB)', color: 'var(--ink)',
      }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="20" x="2" y="2" rx="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--wg-400)' }}>
          CONNECTED ACCOUNTS
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', flex: 'none', background: dot }} />
          <span style={{
            fontSize: 13.5, fontWeight: 600, color: textColor,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {state.label}
          </span>
        </span>
      </span>

      {/* Left in ink. It is the same control on every row of this screen, and
          colouring it would make the action compete with the status for the
          alarm rather than answer it. */}
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', flex: 'none' }}>{state.action}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }} aria-hidden="true">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Link>
  )
}
