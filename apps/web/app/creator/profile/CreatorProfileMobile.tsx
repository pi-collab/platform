import Link from 'next/link'
import SignOutButton from '@/components/SignOutButton'
import ContactLink from '@/components/ContactLink'
import ShopfrontLinkRow from './ShopfrontLinkRow'

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
  shopfrontSlug,
  photoUrl = null,
}: {
  fullName: string
  photoUrl?: string | null
  handle: string | null
  dealsDone: number
  paidThisYearPaise: number
  hasStorefront: boolean
  /** Slug of the published shopfront, when there is one. */
  shopfrontSlug?: string | null
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
            overflow: 'hidden',
            // Dashed ONLY while there is no photo: the border says "no photo
            // yet" rather than presenting an initial as a finished avatar. A
            // real photo needs no such apology.
            border: photoUrl ? 'none' : '1.5px dashed var(--sec-mid)',
          }}
        >
          {photoUrl
            ? <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initial}
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

      {/* Shopfront. A prompt while there isn't one, the link itself once there
          is — sharing that link is the whole point of having built it, so it
          belongs here rather than one screen deeper. */}
      {!hasStorefront ? (
        <Link href="/creator/storefront" className="sr msurface" style={{ ...rowStyle, background: 'var(--neon)' }}>
          <span style={{ flex: 1, fontSize: 14.5, fontWeight: 700, color: 'var(--lime-950)' }}>
            Set up your shopfront
          </span>
          <Chevron color="var(--lime-950)" />
        </Link>
      ) : (
        <ShopfrontLinkRow slug={shopfrontSlug ?? null} />
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
        <Stat label="TURNAROUND" value="-" muted />
      </div>

      {/* Menu */}
      <div className="sr msurface" style={{ padding: 0, overflow: 'hidden' }}>
        <MenuRow href="/creator/settings?tab=profile" label="Edit profile" icon={<EditIcon />} />
        <MenuDivider />
        <MenuRow href="/creator/notifications?from=profile" label="Notifications" icon={<BellIcon />} />
        <MenuDivider />
        <MenuRow href="/creator/packages?from=profile" label="Packages" icon={<TagIcon />} />
        <MenuDivider />
        <MenuRow href="/creator/payments?from=profile" label="Payments" icon={<CardIcon />} />
        <MenuDivider />
        {/* Opens the Account tab rather than the page default. Edit profile
            already lands on Profile, so pointing both rows at the same tab made
            one of them do nothing visible. */}
        <MenuRow href="/creator/settings?tab=account" label="Settings" icon={<GearIcon />} />
        <MenuDivider />
        {/* Help opens the contact form the marketing site already uses, rather
            than a settings page that answers nothing. */}
        <HelpRow />
      </div>

      {/* Sign out, on its own. Separated from the menu because it ends the
          session rather than navigating, and grouping it with four links is how
          it gets tapped by accident. */}
      <SignOutButton redirectTo="/login/creator" className="sr msurface creator-signout" label="Sign out" />
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

function Chevron({ color = 'var(--ink-faint)' }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color}
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

/**
 * Help & support.
 *
 * ContactLink is a button that opens the same contact dialog the footer uses,
 * so a creator gets a real form rather than a settings page that answers
 * nothing. Wrapped to look like the rows above it.
 */
function HelpRow() {
  return (
    <div style={{ ...rowStyle, gap: 12 }}>
      <span
        aria-hidden="true"
        style={{
          width: 30, height: 30, borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--sec-2)', color: 'var(--sec-ink)',
        }}
      >
        <HelpIcon />
      </span>
      <ContactLink className="creator-help-row" label="Help &amp; support" />
      <Chevron />
    </div>
  )
}

function CardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
      <circle cx="7" cy="7" r="1.4" />
    </svg>
  )
}
