import Link from 'next/link'

interface MobileBottomCTAProps {
  ctaText: string
  ctaHref: string
}

export default function MobileBottomCTA({ ctaText, ctaHref }: MobileBottomCTAProps) {
  return (
    <div className="mobile-bottom-cta">
      <Link href={ctaHref} className="btn btn--primary">
        {ctaText}
      </Link>
    </div>
  )
}
