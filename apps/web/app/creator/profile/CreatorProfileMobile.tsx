import Link from 'next/link'
import SignOutButton from '@/components/SignOutButton'

/**
 * Creator profile — mobile.
 *
 * Transcribed from the export: an identity card, a storefront prompt, a
 * three-up stat strip, and a menu.
 *
 * The export's menu has three rows — Edit profile, Settings, Help centre — and
 * NO sign out. That is a gap rather than a decision: the desktop sidebar has
 * one, and the tab bar replaced the mobile drawer that used to carry it, so
 * without it there is no way to sign out on a phone at all. Notifications is
 * added for the same reason.
 */
export default function CreatorProfileMobile({
  fullName,
  handle,
  dealsDone,
  paidThisYearPaise,
  hasStorefront,
}: {
  fullName: string
  handle: string | null
  dealsDone: number
  paidThisYearPaise: number
  hasStorefront: boolean
}) {
  const initial = fullName.trim().charAt(0).toUpperCase() || '·'
  // The export prints "First Last" with the surname in serif italic. Split on
  // the first space only, so a three-part name keeps the rest together.
  const [firstName, ...restName] = fullName.trim().split(' ')
  const surname = restName.join(' ')

  return (
    <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Identity */}
      <div
        className="sr msurface"
        style={{
          padding: '24px 20px',
          textAlign: 'center',
          background: 'linear-gradient(125deg, var(--sec), var(--sec-2))',
          border: '1px solid var(--sec-mid)',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 22,
            color: 'var(--sec-ink)',
            background: 'var(--sec-2)',
            // Dashed, not solid: the border says "no photo yet" rather than
            // presenting an initial as a finished avatar.
            border: '1.5px dashed var(--sec-mid)',
          }}
        >
          {initial}
        </div>

        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            marginTop: 14,
            color: 'var(--ink)',
          }}
        >
          {firstName}
          {surname && (
            <>
              {' '}
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400 }}>
                {surname}
              </span>
            </>
          )}
        </div>

        {/* No follower count. The export prints "@handle · 0 followers", but
            nothing counts followers — showing 0 to someone with an audience is
            worse than showing nothing. */}
        {handle && (
          <div style={{ fontSize: 12.5, color: 'var(--sec-ink)', marginTop: 3 }}>@{handle}</div>
        )}

        <div style={{ fontSize: 12.5, color: 'var(--sec-ink)', marginTop: 10 }}>
          {dealsDone > 0 ? `${dealsDone} deal${dealsDone === 1 ? '' : 's'} completed` : 'No deals yet'}
        </div>
      </div>

      {/* Storefront. Only when there isn't one — a prompt to do something
          already done is noise. */}
      {!hasStorefront && (
        <Link href="/creator/storefront" className="sr msurface" style={rowStyle}>
          <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>
            Set up your storefront
          </span>
          <Chevron />
        </Link>
      )}

      {/* Stats */}
      <div className="sr msurface" style={{ padding: '18px 0', display: 'flex' }}>
        <Stat label="DEALS DONE" value={dealsDone > 0 ? String(dealsDone) : '0'} muted={dealsDone === 0} />
        <Stat
          label="PAID THIS YEAR"
          value={`₹${(paidThisYearPaise / 100).toLocaleString('en-IN')}`}
          muted={paidThisYearPaise === 0}
        />
        {/* Turnaround needs completed deals to average. An em dash is honest;
            a "0 days" would claim a speed nobody has measured. */}
        <Stat label="TURNAROUND" value="—" muted />
      </div>

      {/* Menu */}
      <div className="sr msurface" style={{ padding: 0, overflow: 'hidden' }}>
        <MenuRow href="/creator/settings" label="Edit profile" icon={<EditIcon />} />
        <MenuDivider />
        <MenuRow href="/creator/notifications" label="Notifications" icon={<BellIcon />} />
        <MenuDivider />
        <MenuRow href="/creator/settings" label="Settings" icon={<GearIcon />} />
        <MenuDivider />
        <MenuRow href="/creator/settings" label="Help & support" icon={<HelpIcon />} />
      </div>

      {/* Sign out, on its own. Separated from the menu because it ends the
          session rather than navigating, and grouping it with four links is how
          it gets tapped by accident. */}
      <SignOutButton className="sr msurface creator-signout" label="Sign out" />
    </div>
  )
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '0 16px',
  minHeight: 52,
  textDecoration: 'none',
}

function MenuRow({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link href={href} style={{ ...rowStyle, gap: 12 }}>
      <span
        aria-hidden="true"
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--sec-2)',
          color: 'var(--sec-ink)',
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, fontSize: 14.5, color: 'var(--ink)' }}>{label}</span>
      <Chevron />
    </Link>
  )
}

/** Inset from the left, so the rule starts where the label does. */
function MenuDivider() {
  return <div style={{ marginLeft: 58, height: 1, background: 'var(--hair)' }} />
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '0 8px' }}>
      <div className="t-meta" style={{ color: 'var(--ink-soft)' }}>{label}</div>
      <div
        className="tnum"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          letterSpacing: '-0.045em',
          fontSize: 20,
          marginTop: 8,
          color: muted ? 'var(--ink-faint)' : 'var(--ink)',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)"
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
         style={{ flexShrink: 0 }} aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

function HelpIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  )
}
