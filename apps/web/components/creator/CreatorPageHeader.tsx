import Link from 'next/link'

/**
 * Back arrow and title, for creator screens that are not a tab.
 *
 * Notifications is reached from the dashboard bell, not the tab bar, so it
 * needs a way back that the five tabs do not provide. Transcribed from the
 * notifications export.
 *
 * `backHref` is required rather than defaulted. A back arrow that guesses is
 * worse than no arrow: it looks like history and behaves like a fixed link, so
 * the caller states where it goes.
 */
export default function CreatorPageHeader({
  title,
  backHref,
  action,
}: {
  title: string
  backHref: string
  /** Optional control on the right, e.g. "Mark all read". */
  action?: React.ReactNode
}) {
  return (
    <div style={{ padding: '20px 16px 0', background: '#F5F7FA' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link
            href={backHref}
            aria-label="Back"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: '#fff',
              flexShrink: 0,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#12151C"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </Link>

          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              fontSize: 22,
              margin: 0,
              color: '#12151c',
            }}
          >
            {title}
          </h1>
        </div>

        {action}
      </div>
    </div>
  )
}
