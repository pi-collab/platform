import Link from 'next/link'

interface MobileBottomCTAProps {
  ctaText: string
  ctaHref: string
}

/**
 * The fixed mobile CTA bar on the marketing pages.
 *
 * Renders its own spacer rather than relying on a global `body` rule. The
 * padding that keeps content clear of the bar used to live in marketing.css as
 * `body { padding-bottom: 72px }` under a max-width query — but marketing.css
 * is imported by the root layout, so every mobile page paid for a bar only
 * /brands and /creators render. On the offer page that was 72px of dead space
 * below a full-height shell, which made a screen that otherwise fit scroll.
 *
 * Keeping the spacer next to the bar means the reservation exists exactly
 * where the bar does, and nowhere else.
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
