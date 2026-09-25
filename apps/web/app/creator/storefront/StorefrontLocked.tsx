import Link from 'next/link'

/**
 * The storefront, for a creator who does not have one yet.
 *
 * LOCKED, not hidden. Removing the nav item would tell a Growth creator
 * nothing — they would simply have fewer links than they had last week, with
 * no explanation. A lock says there is something here, it is not yours yet,
 * and here is what changes that. It also stops the page 404ing or, worse,
 * rendering an editor whose Publish button the server would then refuse.
 *
 * What they CAN do is listed explicitly, because "locked" on its own reads as
 * a smaller account rather than a different one: a Growth creator takes real
 * deals, sets real prices and gets paid through the same app.
 */
export default function StorefrontLocked() {
  return (
    <main style={{ padding: 'clamp(20px,3vw,40px) clamp(18px,4vw,44px) clamp(56px,6vw,90px)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <section style={{ borderRadius: 24, background: 'var(--card)', boxShadow: 'var(--sh-2)', padding: 'clamp(28px,4vw,52px)', maxWidth: 640 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 999, background: 'var(--sec-2)', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--wg-600)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            Locked
          </span>

          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.02em', fontSize: 'clamp(26px,3.2vw,34px)', lineHeight: 1.1, margin: '18px 0 0', color: 'var(--ink)' }}>
            Your storefront unlocks with Guapd Deals
          </h1>

          <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--wg-600)', margin: '14px 0 0' }}>
            A storefront is a public page at <strong>guapd.com/c/you</strong> that anyone can open &mdash;
            you share the link, brands browse your rates and send an offer from it.
            It comes with Guapd Deals.
          </p>

          <div style={{ marginTop: 26, paddingTop: 22, borderTop: '1px solid var(--line)' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--wg-500)' }}>
              Meanwhile, everything else is yours
            </div>
            <p style={{ fontSize: 14.5, lineHeight: 1.65, color: 'var(--wg-600)', margin: '10px 0 0' }}>
              Brands on Guapd can already find you, see your verified numbers and send you real
              offers. The two things that decide whether they do are your packages and your
              Instagram connection &mdash; both are open to you now.
            </p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
              <Link href="/creator/packages" className="neonbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 'var(--radius-pill)', background: 'var(--lime-400)', fontWeight: 700, fontSize: 13, color: 'var(--lime-950)', textDecoration: 'none', boxShadow: '0 8px 16px -8px rgba(180,215,50,.55)' }}>
                Set your packages
              </Link>
              <Link href="/creator/settings?tab=connected" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--line)', background: 'var(--card)', fontWeight: 600, fontSize: 13, color: 'var(--ink)', textDecoration: 'none' }}>
                Connect Instagram
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
