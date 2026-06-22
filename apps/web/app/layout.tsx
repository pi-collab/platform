import './globals.css'
import './marketing.css'
import { BRAND_NAME } from '@/lib/content'
import AnimationProvider from '@/components/AnimationProvider'
import MouseGlow from '@/components/MouseGlow'
import CustomCursor from '@/components/CustomCursor'
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AnimationProvider />
        <MouseGlow />
        <CustomCursor />
        {children}
      </body>
    </html>
  )
}
