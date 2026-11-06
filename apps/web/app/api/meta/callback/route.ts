import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { verifyBrand } from '@/lib/brand-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptToken } from '@/lib/instagram-token'
import { META_DISCOVERY_SCOPE, metaAppConfigured, metaMarketplaceEnabled } from '@/lib/meta/config'
import { exchangeFacebookCode, loadFacebookAccount } from '@/lib/meta/graph'

/** Facebook Login callback. Tokens stay server-side, encrypted at rest. */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url)
  const ret = cookies().get('meta_return')?.value
  const back = (meta: string) => NextResponse.redirect(`${origin}/ai?${new URLSearchParams({ ...(ret ? { s: ret } : {}), meta })}`)
  if (!metaMarketplaceEnabled() || !metaAppConfigured()) return back('off')
  if (searchParams.get('error')) return back('cancelled')

  const brand = await verifyBrand()
  const expected = cookies().get('meta_oauth_state')?.value
  const given = searchParams.get('state')
  cookies().delete({ name: 'meta_oauth_state', path: '/api/meta' })
  cookies().delete({ name: 'meta_return', path: '/api/meta' })
  if (!expected || !given || expected !== given) return back('state_mismatch')
  const code = searchParams.get('code')
  if (!code) return back('no_code')

  try {
    const { userToken, expiresAt } = await exchangeFacebookCode(code)
    const account = await loadFacebookAccount(userToken)
    // Why it cannot work, recorded once (0590) so the app explains it in
    // Settings and stops prompting; cleared on a successful connection.
    const blocked = !account.scopes.includes(META_DISCOVERY_SCOPE) ? 'missing_permission'
      : account.totalPages === 0 ? 'no_page'
        : !account.page ? 'no_instagram' : null
    if (blocked) {
      await createAdminClient().from('brand_meta_eligibility').upsert({ brand_id: brand.brandId, state: blocked, checked_at: new Date().toISOString() }, { onConflict: 'brand_id' })
      return back(blocked)
    }
    const page = account.page!
    const u = encryptToken(userToken)
    const pg = encryptToken(page.pageToken)
    const { error } = await createAdminClient().from('brand_meta_connections').upsert({
      brand_id: brand.brandId,
      connected_by: brand.profileId,
      fb_user_id: account.fbUserId,
      page_id: page.pageId,
      page_name: page.pageName,
      ig_user_id: page.igUserId,
      ig_username: page.igUsername,
      status: 'connected',
      user_token_ciphertext: u.ciphertext, user_token_iv: u.iv, user_token_tag: u.tag,
      page_token_ciphertext: pg.ciphertext, page_token_iv: pg.iv, page_token_tag: pg.tag,
      key_version: u.keyVersion,
      user_token_expires_at: expiresAt,
      scopes: account.scopes,
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'brand_id' })
    if (!error) await createAdminClient().from('brand_meta_eligibility').delete().eq('brand_id', brand.brandId)
    if (error) {
      console.error(`[meta] connect save failed brand=${brand.brandId}: ${error.message}`)
      return back('save_failed')
    }
    return back(account.pageCount > 1 ? 'connected_first_page' : 'connected')
  } catch (err) {
    console.error(`[meta] connect failed brand=${brand.brandId}: ${err instanceof Error ? err.message : String(err)}`)
    return back('failed')
  }
}
