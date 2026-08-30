import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { verifyCreator } from '@/lib/creator-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptToken } from '@/lib/instagram-token'
import {
  exchangeCodeForToken, exchangeForLongLivedToken, buildSnapshot, IG_SCOPES,
} from '@/lib/instagram'
import { instagramRedirectUri, instagramReturnPath } from '@/lib/instagram-config'
import { markChannelConnected } from '@/lib/instagram-sync'

/**
 * Instagram OAuth callback.
 *
 * Registered in the Meta App Dashboard as the redirect URI. Everything here
 * runs server-side; no token ever reaches the browser.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url)
  const back = (params: Record<string, string>) =>
    NextResponse.redirect(`${origin}${instagramReturnPath(params)}`)

  // The creator denied the prompt, or Instagram refused. Not an error worth a
  // stack trace: they simply did not connect.
  if (searchParams.get('error')) {
    return back({ ig: 'cancelled' })
  }

  const ctx = await verifyCreator()

  // ── State check ──────────────────────────────────────────────────────────
  // Compared before the code is spent. A mismatch means this callback was not
  // started by this browser, and the code may belong to someone else's account.
  const expected = cookies().get('ig_oauth_state')?.value
  const given = searchParams.get('state')
  cookies().delete('ig_oauth_state')
  if (!expected || !given || expected !== given) {
    return back({ ig: 'state_mismatch' })
  }

  // Instagram appends "#_" to the redirect. A fragment never reaches the
  // server, but Meta's own docs call it out, and a code with a stray suffix
  // fails the exchange with an error that says nothing useful.
  const code = (searchParams.get('code') ?? '').replace(/#_$/, '')
  if (!code) return back({ ig: 'no_code' })

  try {
    const redirectUri = instagramRedirectUri()
    const short = await exchangeCodeForToken(code, redirectUri)
    // Immediately, not lazily: the short-lived token dies in an hour and
    // everything downstream assumes the 60-day one.
    const long = await exchangeForLongLivedToken(short.token)

    const snapshot = await buildSnapshot(long.token)

    // A personal account authenticated but cannot serve insights. Recorded as
    // its own status so the UI can tell them exactly what to change, rather
    // than showing a connection that silently returns nothing.
    const status = snapshot.accountType === 'PERSONAL' ? 'personal_account' : 'connected'

    const enc = encryptToken(long.token)
    const admin = createAdminClient()

    const { error } = await admin.from('creator_instagram_connections').upsert({
      creator_id: ctx.creatorId,
      // Two DIFFERENT ids. Insights are addressed by the professional account
      // id; Meta's deauthorize and data-deletion callbacks identify the user by
      // the app-scoped one. Storing only one leaves the other flow unable to
      // find the row.
      ig_user_id: snapshot.userId,
      ig_app_scoped_id: short.userId,
      username: snapshot.username,
      account_type: snapshot.accountType,
      status,
      token_ciphertext: enc.ciphertext,
      token_iv: enc.iv,
      token_tag: enc.tag,
      key_version: enc.keyVersion,
      token_expires_at: new Date(Date.now() + long.expiresInSeconds * 1000).toISOString(),
      last_refreshed_at: new Date().toISOString(),
      scopes: short.permissions.length ? short.permissions : [...IG_SCOPES],
      snapshot: status === 'connected' ? snapshot : null,
      last_synced_at: status === 'connected' ? new Date().toISOString() : null,
      sync_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'creator_id' })

    if (error) {
      console.error(`[instagram] connect upsert failed creator=${ctx.creatorId}: ${error.message}`)
      return back({ ig: 'save_failed' })
    }

    // The verified badge reads this, so the storefront never touches the token
    // table. Merged, not assigned: social_accounts carries keys owned by four
    // different screens and rebuilding it deletes the others.
    if (status === 'connected') {
      await markChannelConnected(ctx.creatorId, snapshot.username)
    }

    return back({ ig: status === 'connected' ? 'connected' : 'personal_account' })
  } catch (err) {
    console.error(`[instagram] connect failed creator=${ctx.creatorId}: ${err instanceof Error ? err.message : String(err)}`)
    return back({ ig: 'failed' })
  }
}
