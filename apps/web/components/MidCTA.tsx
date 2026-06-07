import Link from 'next/link'

interface MidCTAProps {
  headline: string
  ctaText:  string
  ctaHref:  string
}

export default function MidCTA({ headline, ctaText, ctaHref }: MidCTAProps) {
  return (
    <section className="mid-cta">
      <div className="mid-cta__inner" data-animate>
        <h2 className="mid-cta__headline">{headline}</h2>
        <Link href={ctaHref} className="btn btn--on-dark">
          {ctaText}
        </Link>
      </div>
    </section>
  )
}
