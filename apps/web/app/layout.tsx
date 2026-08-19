import './globals.css'
import './marketing.css'
import { BRAND_NAME } from '@/lib/content'
import { sora, inter, schibstedGrotesk, instrumentSerif } from './fonts'
import AnimationProvider from '@/components/AnimationProvider'
import PostHogProvider from '@/components/PostHogProvider'
import CookieConsent from '@/components/CookieConsent'
import type { Metadata, Viewport } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://guapd.com'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#181C24',
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND_NAME} · Brand–creator deals without the chaos`,
    template: `%s | ${BRAND_NAME}`,
  },
  description:
    'One platform for brand–creator collaborations in India. Offer, negotiate, deliver, and pay. No agencies, no WhatsApp threads.',
  openGraph: {
    type: 'website',
    siteName: BRAND_NAME,
    locale: 'en_IN',
    url: SITE_URL,
    title: `${BRAND_NAME} · Brand–creator deals without the chaos`,
    description:
      'One platform for brand–creator collaborations in India. Offer, negotiate, deliver, and pay. No agencies, no WhatsApp threads.',
    images: [{ url: '/og.jpg', width: 1200, height: 630, alt: `${BRAND_NAME}` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND_NAME} · Brand–creator deals without the chaos`,
    description:
      'One platform for brand–creator collaborations in India. Offer, negotiate, deliver, and pay. No agencies, no WhatsApp threads.',
    images: [{ url: '/og.jpg', width: 1200, height: 630, alt: `${BRAND_NAME}` }],
  },
  robots: {
    index: true,
    follow: true,
  },
  // NO site-wide canonical. It was set to SITE_URL, which meant every page
  // without its own override told search engines it was a duplicate of the home
  // page — /privacy and /terms were both doing exactly that. Canonicals belong
  // per page; pages that set none simply emit none, which is the safe default.
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${inter.variable} ${schibstedGrotesk.variable} ${instrumentSerif.variable}`}>
      <body>
        {/* Organization data, so search engines have the name, logo and
            contact route from the markup rather than inferring them. One block
            in the layout covers every page. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: BRAND_NAME,
              url: SITE_URL,
              logo: `${SITE_URL}/guapd-orb.png`,
              description:
                'One platform for brand–creator collaborations in India. Offer, negotiate, deliver, and pay.',
              contactPoint: {
                '@type': 'ContactPoint',
                contactType: 'customer support',
                email: 'contact@guapd.com',
                areaServed: 'IN',
              },
            }),
          }}
        />
        <AnimationProvider />
        <PostHogProvider>
          {children}
        </PostHogProvider>
        <CookieConsent />
      </body>
    </html>
  )
}
