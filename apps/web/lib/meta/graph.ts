import 'server-only'
import { dialogBase, graphBase, metaRedirectUri, metaScopes, required } from './config'
import type { MetaParams } from './marketplace-params'

/**
 * Facebook Login and the Creator Marketplace call, on graph.facebook.com.
 * Tokens are passed in and returned, never logged; callers encrypt them.
 */

export class MetaTokenInvalidError extends Error {}
/** Graph error 10 on Creator Marketplace: the account is not eligible (Instagram decides). */
export class MetaNotEligibleError extends Error {}

async function graph(path: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(`${graphBase()}${path}?${new URLSearchParams(params)}`)
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.error) {
    const code = json?.error?.code
    const msg = json?.error?.message ?? `HTTP ${res.status}`
    if (code === 190) throw new MetaTokenInvalidError(msg)
    if (code === 10) throw new MetaNotEligibleError(msg)
    throw new Error(`graph ${path.split('?')[0]} failed: ${msg}`)
  }
  return json
}

/** The Facebook Login dialog. A Login for Business configuration, if one is
 *  set up, replaces the scope list. */
export function facebookAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({ client_id: required('META_APP_ID'), redirect_uri: metaRedirectUri(), state, response_type: 'code' })
  if (process.env.META_LOGIN_CONFIG_ID) p.set('config_id', process.env.META_LOGIN_CONFIG_ID)
  else p.set('scope', metaScopes().join(','))
  return `${dialogBase()}?${p}`
}

export async function exchangeFacebookCode(code: string): Promise<{ userToken: string; expiresAt: string | null }> {
  const short = await graph('/oauth/access_token', {
    client_id: required('META_APP_ID'), client_secret: required('META_APP_SECRET'), redirect_uri: metaRedirectUri(), code,
  })
  const long = await graph('/oauth/access_token', {
    grant_type: 'fb_exchange_token', client_id: required('META_APP_ID'), client_secret: required('META_APP_SECRET'), fb_exchange_token: short.access_token,
  })
  const expires = Number(long.expires_in)
  return { userToken: String(long.access_token), expiresAt: Number.isFinite(expires) && expires > 0 ? new Date(Date.now() + expires * 1000).toISOString() : null }
}

export interface MetaPage { pageId: string; pageName: string | null; pageToken: string; igUserId: string; igUsername: string | null }

/** The brand's Facebook user, granted scopes, and the first Page that has an
 *  Instagram business account (Creator Marketplace runs from it). */
export async function loadFacebookAccount(userToken: string): Promise<{ fbUserId: string; scopes: string[]; page: MetaPage | null; pageCount: number; totalPages: number }> {
  const me = await graph('/me', { fields: 'id', access_token: userToken })
  const perms = await graph('/me/permissions', { access_token: userToken })
  const scopes = (perms.data ?? []).filter((x: any) => x.status === 'granted').map((x: any) => String(x.permission))
  const pages = await graph('/me/accounts', { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '50', access_token: userToken })
  const withIg = (pages.data ?? []).filter((pg: any) => pg.instagram_business_account?.id && pg.access_token)
  const first = withIg[0]
  return {
    fbUserId: String(me.id),
    scopes,
    pageCount: withIg.length,
    totalPages: (pages.data ?? []).length,
    page: first ? { pageId: String(first.id), pageName: first.name ?? null, pageToken: String(first.access_token), igUserId: String(first.instagram_business_account.id), igUsername: first.instagram_business_account.username ?? null } : null,
  }
}

export const MARKETPLACE_FIELDS = 'id,username,biography,country,insights,category,email,profile_picture_url,onboarded_status'

/** One page of /{ig-user-id}/creator_marketplace_creators. Params are already
 *  validated; arrays are sent as JSON, as Graph expects. */
export async function fetchMarketplaceCreators(igUserId: string, pageToken: string, params: MetaParams, limit: number): Promise<any[]> {
  const q: Record<string, string> = { fields: MARKETPLACE_FIELDS, limit: String(limit), access_token: pageToken }
  for (const [k, v] of Object.entries(params)) q[k] = Array.isArray(v) ? JSON.stringify(v) : String(v)
  const json = await graph(`/${encodeURIComponent(igUserId)}/creator_marketplace_creators`, q)
  return Array.isArray(json.data) ? json.data : []
}
