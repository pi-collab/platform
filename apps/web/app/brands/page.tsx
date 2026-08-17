import type { Metadata } from 'next'
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
 * The export ships its own nav, so the site-wide <Nav> is deliberately not
 * rendered here — two navs would stack. The footer is the opposite case: the
 * export references it as an external component it does not contain, so the
 * site's own Footer is used.
 */
export default function BrandsPage() {
  return (
    <>
      <BrandsPageClient />
      <Footer />
      <MobileBottomCTA ctaText="Book demo" ctaHref="/signup/brand" />
    </>
  )
}
