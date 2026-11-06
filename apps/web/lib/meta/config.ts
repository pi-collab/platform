import 'server-only'

/**
 * Instagram Creator Marketplace (brand side), behind META_CREATOR_MARKETPLACE=1
 * on top of CREATOR_SEARCH=1. Server-side settings in one place.
 */

export function metaMarketplaceEnabled(): boolean {
  return process.env.CREATOR_SEARCH === '1' && process.env.META_CREATOR_MARKETPLACE === '1'
}

/** The creator side of invites (the /c/i-<token> page, open/accept, the
 *  creator home card): on with the Marketplace, or on its own with
 *  CREATOR_INVITES=1, so the sign-up path can be tested while Meta stays off.
 *  Creating invites stays behind the Marketplace flag. */
export function creatorInvitesEnabled(): boolean {
  return process.env.CREATOR_SEARCH === '1' && (process.env.META_CREATOR_MARKETPLACE === '1' || process.env.CREATOR_INVITES === '1')
}

/** Facebook Login app (NOT the Instagram Login app of 0493). */
export function metaAppConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET)
}

/** How the brief reaches Meta's free-text `query`:
 *   extracted (default)  a short keyword phrase from the brief's reading
 *   direct               a trimmed, redacted slice of the brief itself
 * Neither ever sends the full brief, a budget, dates or competitor names. */
export type MetaQueryMode = 'direct' | 'extracted'
export function metaQueryMode(): MetaQueryMode {
  return process.env.META_SEARCH_QUERY_MODE === 'direct' ? 'direct' : 'extracted'
}

/** Graph host. Overridable outside production only, for the local stub
 *  used by scripts/test-meta-marketplace.ts. */
export function graphBase(): string {
  const override = process.env.VERCEL_ENV !== 'production' && process.env.NODE_ENV !== 'production' ? process.env.META_GRAPH_BASE : undefined
  return (override || 'https://graph.facebook.com/v25.0').replace(/\/+$/, '')
}
export function dialogBase(): string {
  const override = process.env.VERCEL_ENV !== 'production' && process.env.NODE_ENV !== 'production' ? process.env.META_DIALOG_BASE : undefined
  return (override || 'https://www.facebook.com/v25.0/dialog/oauth')
}

export function metaRedirectUri(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')
  return `${base}/api/meta/callback`
}

/** Facebook Login scopes for Creator Marketplace. The discovery scope is
 *  only requested with the flag on. */
export const META_BASE_SCOPES = ['instagram_basic', 'pages_show_list', 'pages_manage_metadata', 'business_management'] as const
export const META_DISCOVERY_SCOPE = 'instagram_creator_marketplace_discovery'
export function metaScopes(): string[] {
  return metaMarketplaceEnabled() ? [...META_BASE_SCOPES, META_DISCOVERY_SCOPE] : [...META_BASE_SCOPES]
}

export function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not configured`)
  return v
}
