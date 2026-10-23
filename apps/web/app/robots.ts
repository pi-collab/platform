import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://guapd.com'

/**
 * Everything behind a login, every ops/staff console, and every tokenised link
 * (offers, invites) stays out of search. Indexable: the marketing pages,
 * careers, privacy/terms, signup, and public creator storefronts (/c/<slug>).
 *
 * Rules are prefix matches, so mind the near-twins: /creator (the portal) must
 * not swallow /creators (the marketing page), hence '/creator/' plus the exact
 * '/creator$'. Same for /brand (account status pages) vs /brands.
 */
const PRIVATE = [
  // Staff and ops consoles
  '/ops', '/experiences-admin', '/test-rls',
  // Brand portal
  '/dashboard', '/deals', '/campaigns', '/browse', '/inbox', '/notifications', '/settings',
  '/experiences', '/onboarding', '/pricing', '/brand/', '/brand$',
  // Creator portal
  '/creator/', '/creator$',
  // Tokenised links and auth flows
  '/offer/', '/invite/', '/auth/', '/login', '/reset-password', '/instagram',
  // API
  '/api/',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: PRIVATE,
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
