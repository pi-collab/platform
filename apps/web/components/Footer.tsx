import Link from 'next/link'
import { footer } from '@/lib/content'
import CookiePrefsLink from '@/components/CookiePrefsLink'
import Wordmark from '@/components/Wordmark'
import '@/app/footer.css'

/**
 * The site footer, ported from the "GUAPD Site Footer" design export.
 *
 * Renders on the home page, /brands, /creators, /privacy and /terms, so it is
 * fully self-contained: its tokens, colours and type live in app/footer.css
 * under .gfoot rather than being inherited from whichever page it lands on.
 *
 * Two things the export draws are deliberately not here:
 *   - The social row (Instagram / X / LinkedIn / YouTube). Every href in the
 *     export is "#", and we have no confirmed handles to point them at.
 *   - The "All systems operational" pill. Nothing monitors anything yet, so a
 *     green dot claiming uptime would be asserting a fact we cannot check.
 * Both are a few lines to restore once there is something real behind them.
 */
export default function Footer() {
  return (
    <footer className="gfoot">
      <div className="gfoot__inner">
        <div className="gfoot__top">
          <div className="gfoot__brand">
            {/* White ink — the default wordmark is #12151C on a #12151C panel. */}
            <Wordmark height={28} tone="light" className="gfoot__wordmark" />

            <p className="gfoot__tagline">{footer.tagline}</p>
          </div>

          <div className="gfoot__grid">
            {footer.columns.map((col) => (
              <div key={col.heading}>
                <div className="gf-meta">{col.heading}</div>
                <div className="gfoot__links">
                  {col.links.map((link) =>
                    link.href === '#cookie-preferences' ? (
                      <CookiePrefsLink key={link.href} />
                    ) : link.href.startsWith('mailto:') ? (
                      <a key={link.href} href={link.href} className="gf-link">{link.label}</a>
                    ) : (
                      <Link key={link.href} href={link.href} className="gf-link">{link.label}</Link>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="gfoot__bottom">
          <div className="gfoot__fine">{footer.copyright}</div>
          <div className="gfoot__fine">{footer.origin}</div>
        </div>
      </div>
    </footer>
  )
}
