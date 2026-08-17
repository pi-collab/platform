import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import BrandsPageClient from './BrandsPageClient'
import Footer from '@/components/Footer'
import MobileBottomCTA from '@/components/MobileBottomCTA'
import '../brands-page.css'

export const metadata: Metadata = {
  title: 'For brands · Guapd',
  description:
    'Plan campaigns, collaborate with creators, approve content, automate payments, and track every deal — all in one shared space.',
}

/**
 * The export ships its own nav, but the site-wide <Nav> is used instead so the
 * header matches every other page — per PJ. The export's nav is stripped
 * during conversion rather than hidden with CSS, so two headers can never
 * stack. The footer is the same story from the other direction: the export
 * only references it as an external component, so the site's Footer is used.
 */
export default function BrandsPage() {
  return (
    <>
      <Nav />
      <BrandsPageClient />
      <Footer />
      <MobileBottomCTA ctaText="Book demo" ctaHref="/signup/brand" />
    </>
  )
}
