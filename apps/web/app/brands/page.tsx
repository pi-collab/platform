import type { Metadata } from 'next'
import MarketingNav from '@/components/MarketingNav'
import BrandsPageClient from './BrandsPageClient'
import Footer from '@/components/Footer'
import MobileBottomCTA from '@/components/MobileBottomCTA'
import '../brands-page.css'

export const metadata: Metadata = {
  // Just 'For brands' — layout.tsx appends "| Guapd" via its title template,
  // so including the brand here produced "For brands · Guapd | Guapd".
  title: 'For brands',
  description:
    'Plan campaigns, collaborate with creators, approve content, automate payments, and track every deal — all in one shared space.',
  // Without this every page inherits the site root as its canonical, telling
  // search engines /brands is a duplicate of the homepage.
  alternates: { canonical: '/brands' },
  openGraph: {
    title: 'For brands · Guapd',
    description:
      'Plan campaigns, collaborate with creators, approve content, automate payments, and track every deal — all in one shared space.',
    url: '/brands',
    // A page-level openGraph REPLACES the layout's rather than merging,
    // so the image has to be repeated here or the card renders bare.
    images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'Guapd' }],
    type: 'website',
  },
}

/**
 * The header is the export's design rebuilt as <MarketingNav>, carrying our own
 * links and CTAs rather than the mockup's in-page anchors. The export's own nav
 * markup is still stripped during conversion, so two headers can never stack.
 *
 * The footer is the opposite case: the export only references it as an
 * external component it does not contain, so the site's Footer is used.
 */
export default function BrandsPage() {
  return (
    <>
      <MarketingNav audience="brand" />
      <main>
        <BrandsPageClient />
      </main>
      <Footer />
      <MobileBottomCTA ctaText="Book demo" ctaHref="/signup/brand" />
    </>
  )
}
