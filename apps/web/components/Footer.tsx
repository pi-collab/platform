import Link from 'next/link'
import { footer } from '@/lib/content'
import Logo from '@/components/Logo'
import CookiePrefsLink from '@/components/CookiePrefsLink'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        {/* Video reel */}
        <div className="footer__video-wrap">
          <video
            className="footer__video"
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_171521_25968ba2-b594-4b32-aab7-f6b69398a6fa.mp4"
            autoPlay
            muted
            loop
            playsInline
          />
          <div className="footer__video-overlay">
            <p className="footer__video-label">Watch this space.</p>
          </div>
        </div>

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
