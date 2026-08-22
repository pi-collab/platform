import Link from 'next/link'
import UpiRow from './UpiRow'

/**
 * Creator payments — empty state.
 *
 * Transcribed from the mobile export: a tinted "last payout" card reading ₹0, a
 * panel saying nothing has landed, and the payout destination row.
 *
 * The export draws that last row as static text. Here it is the control for
 * setting a UPI ID, because a creator with no payout method cannot be paid and
 * this is the screen where they will look for it.
 */
export default function CreatorPaymentsEmpty({ upiId }: { upiId: string | null }) {
  return (
    <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Last payout. Tinted rather than white, so the number reads as a
          headline figure rather than one row among several. */}
      <div
        className="sr msurface"
        style={{
          padding: '22px 20px',
          background: 'linear-gradient(125deg, var(--sec), var(--sec-2))',
          border: '1px solid var(--sec-mid)',
        }}
      >
        <div className="t-meta" style={{ color: 'var(--sec-ink)' }}>LAST PAYOUT</div>
        <div
          className="tnum"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            letterSpacing: '-0.045em',
            fontSize: 32,
            marginTop: 8,
            color: 'var(--ink)',
          }}
        >
          &#8377;0
        </div>
        <div className="t-meta" style={{ color: 'var(--sec-ink)', marginTop: 8 }}>NO PAYMENTS YET</div>
        {/* The progress track stays at 0% and is not animated: a bar that fills
            to nothing is motion that says nothing. */}
        <div style={{ marginTop: 12, height: 4, borderRadius: 4, background: 'var(--sec-mid)', overflow: 'hidden' }}>
          <div style={{ width: '0%', height: '100%', borderRadius: 4, background: 'var(--neon)' }} />
        </div>
      </div>

      <div className="sr msurface" style={{ padding: '36px 24px', textAlign: 'center' }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: '-0.01em',
            margin: 0,
            color: 'var(--ink)',
          }}
        >
          Nothing&rsquo;s landed{' '}
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400 }}>yet.</span>
        </h2>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-soft)', margin: '10px 0 0' }}>
          When a deal completes, the payout shows up here — with the fee already broken out.
        </p>
        <Link
          href="/creator/deals"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 50,
            marginTop: 20,
            borderRadius: 14,
            background: 'var(--neon)',
            color: 'var(--ink)',
            fontWeight: 800,
            fontSize: 14.5,
            letterSpacing: '-0.01em',
            textDecoration: 'none',
            boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
          }}
        >
          Browse brand deals
        </Link>
      </div>

      <UpiRow initialUpiId={upiId} />
    </div>
  )
}
