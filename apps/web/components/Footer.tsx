import Link from 'next/link'
import { footer } from '@/lib/content'
import Logo from '@/components/Logo'
import CookiePrefsLink from '@/components/CookiePrefsLink'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__top">
          {/* Brand column */}
          <div className="footer__brand">
            <span className="footer__logo"><Logo size={40} /></span>
            <p className="footer__tagline">{footer.tagline}</p>
            <div className="footer__social">
              {footer.social.map((s) => (
                <Link key={s.href} href={s.href} className="footer__social-link" aria-label={s.label}>
                  {s.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Link columns */}
          <div className="footer__columns">
            {footer.columns.map((col) => (
              <div key={col.heading}>
                <p className="footer__column-heading">{col.heading}</p>
                <div className="footer__column-links">
                  {col.links.map((link) => (
                    <Link key={link.href} href={link.href} className="footer__link">
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="footer__bottom">
          <span className="footer__copyright">{footer.copyright}</span>
          <div className="footer__legal">
            {footer.legal.map((link) =>
              link.href === '#cookie-preferences' ? (
                <CookiePrefsLink key={link.href} />
              ) : (
                <Link key={link.href} href={link.href} className="footer__legal-link">
                  {link.label}
                </Link>
              )
            )}
          </div>
        </div>
      </div>
    </footer>
  )
}
