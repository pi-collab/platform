import Link from 'next/link'

interface HeroProps {
  badge?:              string
  headline:            string
  subheadline:         string
  ctaText:             string
  ctaHref:             string
  microcopy?:          string
  secondaryCtaText?:   string
  secondaryCtaHref?:   string
  visual?:             React.ReactNode
}

export default function Hero({
  badge,
  headline,
  subheadline,
  ctaText,
  ctaHref,
  microcopy,
  secondaryCtaText,
  secondaryCtaHref,
  visual,
}: HeroProps) {
  return (
    <section className="hero">
      <div className="hero__blobs" aria-hidden="true">
        <div className="hero__blob hero__blob--purple" />
        <div className="hero__blob hero__blob--peach" />
        <div className="hero__blob hero__blob--pink" />
      </div>

      <div className="hero__inner">
        <div className="hero__text">
          {badge && <span className="hero__badge">{badge}</span>}

          <h1 className="hero__headline">{headline}</h1>
          <p className="hero__sub">{subheadline}</p>

          <div className="hero__cta-row">
            <Link href={ctaHref} className="btn btn--primary">
              {ctaText}
            </Link>
            {secondaryCtaText && secondaryCtaHref && (
              <Link href={secondaryCtaHref} className="btn btn--ghost">
                {secondaryCtaText}
              </Link>
            )}
          </div>

          {microcopy && <p className="hero__microcopy">{microcopy}</p>}
        </div>

        {visual && (
          <div className="hero__visual">
            {visual}
          </div>
        )}
      </div>
    </section>
  )
}
