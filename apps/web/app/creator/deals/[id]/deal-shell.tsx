import Link from 'next/link'
import BrandMark from '@/components/BrandMark'
import OpenDealChat from '@/components/OpenDealChat'

/**
 * The creator deal page's frame, shared (6.1 item 9) by a marketplace deal
 * (page.tsx) and an Experience creator leg (CreatorLegView), so a creator sees
 * ONE deal page whichever kind it is: the same wrapper, surfaces, hero card,
 * status line and type. Lifted verbatim out of page.tsx; nothing here reads
 * data. Each caller passes its own values, and a leg passes only its own leg's.
 */

export const wrapper: React.CSSProperties = {
  flex: 1, minWidth: 0,
  padding: 'clamp(18px,2.4vw,30px) clamp(22px,4vw,56px) clamp(56px,6vw,96px)',
}

export const backLinkStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)',
  textDecoration: 'none', whiteSpace: 'nowrap',
}

export const metaLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)',
}

export const sectionHeading: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0,
}

export const termRow: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14,
  padding: '13px 0', marginTop: 6, borderTop: '1px solid var(--border-hairline, #EAEAE3)',
}

/** The page-level CSS both deal pages mount. */
export function DealShellStyles() {
  return (
    <style>{`
        .surface { border-radius: 20px; background: var(--card); box-shadow: 0 1px 2px rgba(22,23,15,.03), 0 8px 16px rgba(22,23,15,.04), 0 32px 64px rgba(22,23,15,.05); }
        .neonbtn { transition: filter .16s ease, transform .12s ease, box-shadow .16s ease; }
        .neonbtn:hover { filter: brightness(1.02); transform: translateY(-1px); box-shadow: 0 14px 28px -14px rgba(40,45,25,.55), inset 0 1px 0 rgba(255,255,255,.7); }
        .pill-hover { transition: background .16s ease, box-shadow .16s ease, transform .12s ease; }
        .pill-hover:hover { background: var(--card); box-shadow: 0 8px 18px -10px rgba(40,45,25,.4); transform: translateY(-1px); }
        .viewlink { transition: color .14s ease; cursor: pointer; }
        .viewlink:hover { color: var(--ink) !important; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .reveal { animation: fadeUp .6s cubic-bezier(.22,1,.36,1) backwards; }
      `}</style>
  )
}

/** The editorial hero: back link, the brand's mark, title line, headline, chat button, status line. */
export function DealHeroCard({ brand, brandLogo, meta, headline, subline, chatLabel, statusDot, statusGlow, statusLabel, statusLine, backHref = '/creator/deals', backLabel = 'Back to deals' }: {
  brand: string
  brandLogo: string | null
  /** The small uppercase line above the headline (title · ref …). */
  meta: React.ReactNode
  /** e.g. "Offer received from " — the brand's name follows in italics. */
  headline: string
  /** A line under the headline (a leg: "Kiro · Managed by Guapd"). */
  subline?: React.ReactNode
  chatLabel: string
  statusDot: string
  statusGlow: string
  statusLabel: string
  statusLine: React.ReactNode
  /** The Guapd console uses the same hero for its deal page. */
  backHref?: string
  backLabel?: string
}) {
  return (
          <div className="surface" style={{ padding: '28px 30px' }}>
            <Link href={backHref} style={backLinkStyle}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              {backLabel}
            </Link>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
              {/* The mark sits level with the headline; the label above and the
                  subline below line up with the text, not with the mark. */}
              <div style={{ minWidth: 0 }}>
                <div style={{ ...metaLabel, paddingLeft: 68 }}>{meta}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, minWidth: 0 }}>
                  <BrandMark
                    name={brand}
                    logoUrl={brandLogo}
                    style={{
                      width: 52, height: 52, borderRadius: 15, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17,
                      color: 'var(--sec-ink)', background: 'var(--sec-2)',
                      border: '1px solid var(--frost-edge)',
                    }}
                  />
                  <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px,3.4vw,34px)', fontWeight: 700, letterSpacing: '-0.025em', margin: 0, minWidth: 0 }}>
                    {headline}
                    <span style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontWeight: 400 }}>{brand}</span>
                  </h1>
                </div>
                {subline && <div style={{ marginTop: 6, paddingLeft: 68, fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)' }}>{subline}</div>}
              </div>
              <OpenDealChat className="neonbtn" style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                height: 42, padding: '0 18px', borderRadius: 11,
                background: 'var(--neon)', border: 'none',
                boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
                fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, color: 'var(--ink)',
                textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {chatLabel}
              </OpenDealChat>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border-hairline, #EAEAE3)', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: statusDot, boxShadow: `0 0 0 4px ${statusGlow}` }} />
                {statusLabel}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{statusLine}</span>
            </div>
          </div>
  )
}
