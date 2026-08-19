import Link from 'next/link'

interface MobileBottomCTAProps {
  ctaText: string
  ctaHref: string
}

/**
 * The fixed CTA bar at the foot of a marketing page on mobile.
 *
 * It renders its own spacer. The bar is fixed, so the page has to reserve room
 * beneath its last section or the bar covers it — that used to be a
 * `body { padding-bottom: 72px }` rule, which applied on every page at this
 * width whether or not it had a bar, leaving 72px of dead scroll past the end
 * of the footer on the ones that did not.
 */
export default function MobileBottomCTA({ ctaText, ctaHref }: MobileBottomCTAProps) {
  return (
    <>
      <div className="mobile-bottom-cta__spacer" aria-hidden="true" />
      <div className="mobile-bottom-cta">
        <Link href={ctaHref} className="btn btn--primary">
          {ctaText}
        </Link>
      </div>
    </>
  )
}
