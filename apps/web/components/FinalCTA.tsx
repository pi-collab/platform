import Link from 'next/link'

interface FinalCTAProps {
  headline:   string
  sub?:       string
  ctaText:    string
  ctaHref:    string
  microcopy?: string
}

export default function FinalCTA({ headline, sub, ctaText, ctaHref, microcopy }: FinalCTAProps) {
  return (
    <section className="final-cta">
      <div className="final-cta__glow" aria-hidden="true" />
      <div className="final-cta__inner" data-animate>
        <h2 className="final-cta__headline">{headline}</h2>
        {sub && <p className="final-cta__sub">{sub}</p>}

        <div className="final-cta__cta-row">
          <Link href={ctaHref} className="btn btn--on-dark">
            {ctaText}
          </Link>
        </div>

        {microcopy && (
          <p className="final-cta__microcopy">{microcopy}</p>
        )}
      </div>
    </section>
  )
}
