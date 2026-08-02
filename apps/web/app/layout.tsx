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
    default: `${BRAND_NAME} — Brand–creator deals without the chaos`,
    template: `%s | ${BRAND_NAME}`,
  },
  description:
    'One platform for brand–creator collaborations in India. Offer, negotiate, deliver, and pay — without agencies or WhatsApp threads.',
  openGraph: {
    type: 'website',
    siteName: BRAND_NAME,
    locale: 'en_IN',
    url: SITE_URL,
    title: `${BRAND_NAME} — Brand–creator deals without the chaos`,
    description:
      'One platform for brand–creator collaborations in India. Offer, negotiate, deliver, and pay — without agencies or WhatsApp threads.',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND_NAME} — Brand–creator deals without the chaos`,
    description:
      'One platform for brand–creator collaborations in India. Offer, negotiate, deliver, and pay — without agencies or WhatsApp threads.',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: SITE_URL,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${inter.variable} ${schibstedGrotesk.variable} ${instrumentSerif.variable}`}>
      <body>
        <AnimationProvider />
        <PostHogProvider>
          {children}
        </PostHogProvider>
        <CookieConsent />
      </body>
    </html>
  )
}
