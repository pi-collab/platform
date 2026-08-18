import MarketingNav from '@/components/MarketingNav'
import Footer from '@/components/Footer'
import LandingPageClient from './LandingPageClient'
import { BRAND_NAME } from '@/lib/content'
import './brands-page.css'
import './landing-page.css'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: `${BRAND_NAME} · Creator deals without the chaos`,
  description:
    'One platform for brand–creator collaborations in India. Send a structured brief, lock the terms in writing, upload and approve, and watch the money move. No agencies, no WhatsApp threads.',
  openGraph: {
    title: `${BRAND_NAME} · Creator deals without the chaos`,
    description:
      'One platform for brand–creator collaborations in India. Send a structured brief, lock the terms in writing, upload and approve, and watch the money move. No agencies, no WhatsApp threads.',
    url: '/',
  },
  alternates: { canonical: '/' },
}

/**
 * The landing page — what guapd.com opens on.
 *
 * The design export ships its own header and footer, and both are dropped in
 * the conversion: this renders the shared <MarketingNav> and <Footer> so all
 * three marketing surfaces carry one header with one set of behaviours, rather
 * than a third implementation of the same capsule.
 *
 * brands-page.css is imported for the Book demo dialog only. Its rules are all
 * scoped to .brands-page, which the dialog sets on itself, so nothing here is
 * restyled by it.
 */
export default function HomePage() {
  return (
    <>
      <MarketingNav audience="home" />
      <main>
        <LandingPageClient />
      </main>
      <Footer />
    </>
  )
}
