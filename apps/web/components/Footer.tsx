import Link from 'next/link'
import { footer } from '@/lib/content'
import CookiePrefsLink from '@/components/CookiePrefsLink'
import ContactLink from '@/components/ContactLink'
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
/**
 * Social marks, drawn from the export. X is a filled glyph rather than a
 * stroked one — its logo has no outline form, and stroking it renders a hollow
 * cross that reads as a close button.
 */
const SOCIAL_ICONS = {
  instagram: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="20" x="2" y="2" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  ),
  x: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  youtube: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </svg>
  ),
}

export default function Footer() {
  return (
    <footer className="gfoot">
      <div className="gfoot__inner">
        <div className="gfoot__top">
          <div className="gfoot__brand">
            {/* White ink — the default wordmark is #12151C on a #12151C panel. */}
            <Wordmark height={28} tone="light" className="gfoot__wordmark" />

            <p className="gfoot__tagline">{footer.tagline}</p>

            {/* Only the accounts we have. The export draws four; the others go
                in as they exist rather than as "#" links that go nowhere. */}
            <div className="gfoot__social">
              {footer.social.map((s) => (
                <a
                  key={s.href}
                  href={s.href}
                  aria-label={s.label}
                  target="_blank"
                  rel="noreferrer"
                  className="gf-soc"
                >
                  {SOCIAL_ICONS[s.icon]}
                </a>
              ))}
            </div>
          </div>

          <div className="gfoot__grid">
            {footer.columns.map((col) => (
              <div key={col.heading}>
                <div className="gf-meta">{col.heading}</div>
                <div className="gfoot__links">
                  {col.links.map((link) =>
                    link.href === '#cookie-preferences' ? (
                      <CookiePrefsLink key={link.href} />
                    ) : link.href === '#contact' ? (
                      <ContactLink key={link.href} className="gf-link" />
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
