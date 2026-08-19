import type { Metadata } from 'next'
import MarketingNav from '@/components/MarketingNav'
import CreatorsPageClient from './CreatorsPageClient'
import Footer from '@/components/Footer'
import MobileBottomCTA from '@/components/MobileBottomCTA'
import '../creators-page.css'

export const metadata: Metadata = {
  title: 'For creators',
  description:
    'Get paid on time, keep every deal in one place, and work with brands directly — no agency in the middle.',
  alternates: { canonical: '/creators' },
  openGraph: {
    title: 'For creators · Guapd',
    description:
      'Get paid on time, keep every deal in one place, and work with brands directly — no agency in the middle.',
    url: '/creators',
    // A page-level openGraph REPLACES the layout's rather than merging,
    // so the image has to be repeated here or the card renders bare.
    images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'Guapd' }],
    type: 'website',
  },
}

/**
 * Same header as /brands — the design's pill nav — with the creator CTA. The
 * export's own nav is stripped during conversion so two headers cannot stack.
 * The footer is the opposite case: the export only references it as an external
 * component, so the site's Footer is used.
 */
export default function CreatorsPage() {
  return (
    <>
      <MarketingNav audience="creator" />
      <main>
        <CreatorsPageClient />
      </main>
      <Footer />
      <MobileBottomCTA ctaText="Join as creator" ctaHref="/signup/creator" />
    </>
  )
}
