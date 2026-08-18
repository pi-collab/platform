import type { Metadata } from 'next'
import Nav from '@/components/Nav'
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
    type: 'website',
  },
}

/**
 * The export's own nav is stripped during conversion; the site-wide <Nav> is
 * used so the header matches the rest of the site. The footer is the opposite
 * case — the export only references it as an external component, so the site's
 * Footer is used.
 */
export default function CreatorsPage() {
  return (
    <>
      <Nav audience="creator" />
      <main>
        <CreatorsPageClient />
      </main>
      <Footer />
      <MobileBottomCTA ctaText="Join as creator" ctaHref="/signup/creator" />
    </>
  )
}
