import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://guapd.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/ops/', '/dashboard/', '/onboarding/', '/auth/', '/login/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
