/**
 * The creator app's empty state.
 *
 * A tile-framed icon, a heading and a line of explanation, centred. Transcribed
 * from the notifications export, but written as a component rather than a page:
 * the same block appears on every creator surface that can be empty, and five
 * near-identical copies would drift the moment one of them was adjusted.
 *
 * The copy is a prop because it should differ per screen. "You're all caught
 * up" is right for notifications and wrong for deals — an empty state that says
 * nothing specific is a shrug, and the whole point of these screens is telling
 * someone what happens next.
 */
export default function CreatorEmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode
  title: string
  body: string
  /** Optional call to action, when there is something useful to do next. */
  action?: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '80px 30px 40px',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 52,
          height: 52,
          borderRadius: 16,
          background: '#fff',
          // A single soft shadow, offset downward. The icon tile sits ON the
          // wash rather than floating, which is why this is lighter than the
          // two-layer shadow the cards use.
          boxShadow: '0 6px 14px -10px rgba(40, 45, 25, .25)',
        }}
      >
        {icon}
      </span>

      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 17,
          margin: '16px 0 0',
          color: '#12151c',
        }}
      >
        {title}
      </h2>

      <p
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 13,
          color: '#565c68',
          margin: '8px 0 0',
          // 260px keeps the line length short enough to read as a caption
          // rather than a paragraph.
          maxWidth: 260,
          lineHeight: 1.55,
        }}
      >
        {body}
      </p>

      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  )
}

/** The bell, drawn as the export draws it. */
export function BellIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#9AA08C"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}
