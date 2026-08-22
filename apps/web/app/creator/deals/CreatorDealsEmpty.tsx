import Link from 'next/link'
import CreatorEmptyState from '@/components/creator/CreatorEmptyState'

/**
 * Creator deals — empty state.
 *
 * Transcribed from the mobile export. The export draws the full furniture of
 * the deals screen above the empty message: a three-up stat card, a search
 * field and seven filter chips, all reading zero.
 *
 * Only the stat card is kept. Search and filters are controls for a list that
 * does not exist — the export disables the search input for exactly that
 * reason, and seven chips that all say 0 is decoration pretending to be a
 * feature. The stat row stays because it tells you something ("nothing needs
 * you") rather than offering to do something impossible.
 */
export default function CreatorDealsEmpty() {
  return (
    <>
      {/* Three-up counters. All zero here, which is the point: the row reads as
          a status line rather than a control. */}
      <div style={{ padding: '0 16px' }}>
        <div
          style={{
            background: '#fff',
            borderRadius: 18,
            boxShadow: '0 6px 16px -14px rgba(40, 45, 25, .2)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
          }}
        >
          <Stat label="Needs you" />
          <Stat label="Live now" bordered />
          <Stat label="Total deals" bordered />
        </div>
      </div>

      <CreatorEmptyState
        icon={
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
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M2 13h20" />
          </svg>
        }
        title="No deals yet"
        body="When a brand sends you an offer, it lands here, with the rate, timeline and revision count already agreed."
        action={
          <Link
            href="/creator/storefront"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              height: 42,
              padding: '0 18px',
              borderRadius: 999,
              background: 'var(--lime-400)',
              color: 'var(--lime-950)',
              fontFamily: 'var(--font-ui)',
              fontWeight: 700,
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 21V9l9-6 9 6v12" />
              <path d="M9 21v-6h6v6" />
            </svg>
            Set up your shopfront
          </Link>
        }
      />
    </>
  )
}

function Stat({ label, bordered }: { label: string; bordered?: boolean }) {
  return (
    <div
      style={{
        padding: '10px 8px',
        textAlign: 'center',
        borderLeft: bordered ? '1px solid #EDEFEC' : undefined,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 8,
          fontWeight: 600,
          letterSpacing: '.05em',
          textTransform: 'uppercase',
          color: '#9AA08C',
        }}
      >
        {label}
      </div>
      {/* Muted, not black: a zero drawn at full contrast reads as a real
          figure worth attention. */}
      <div
        style={{
          fontFamily: 'var(--font-ui)',
          fontWeight: 600,
          fontSize: 13,
          letterSpacing: '-0.01em',
          color: '#C9CCC2',
          marginTop: 2,
        }}
      >
        0
      </div>
    </div>
  )
}
