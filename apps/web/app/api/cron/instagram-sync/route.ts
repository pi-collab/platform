import { NextRequest, NextResponse } from 'next/server'
import { connectionsDueForSync, refreshAndSync } from '@/lib/instagram-sync'

/**
 * Daily Instagram refresh and re-sync.
 *
 * ── Why a cron and not on-demand ────────────────────────────────────────────
 * A long-lived token expires 60 days after it is issued, whether or not the
 * creator ever comes back. Refreshing when they next log in would silently
 * disconnect every creator who does not visit within 60 days — which for a
 * creator whose storefront is doing its job is most of them. The refresh has
 * to happen without them.
 *
 * It also keeps the snapshot current. Instagram retains user insights for 90
 * days, so figures nobody collects are not recoverable later.
 *
 * ── Sequential, not parallel ────────────────────────────────────────────────
 * Each connection makes four Instagram calls. Firing them all at once is the
 * fastest way to meet a rate limit and fail the whole run. At pilot scale the
 * wall-clock cost of going one at a time is irrelevant; past a few hundred
 * creators this needs a queue, and the log line below is what will say so.
 */
export const maxDuration = 300

export async function GET(request: NextRequest) {
  // Vercel sends this header on scheduled invocations. Without the check the
  // route is a public URL that anyone can use to make us hammer Instagram.
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const rows = await connectionsDueForSync()

  let synced = 0
  let failed = 0
  const details: string[] = []

  for (const row of rows) {
    // A single creator's failure must not end the run: the next one may be the
    // one whose token is about to expire.
    try {
      const result = await refreshAndSync(row)
      if (result.ok) synced++
      else { failed++; details.push(`${row.creator_id}: ${result.detail}`) }
    } catch (err) {
      failed++
      details.push(`${row.creator_id}: ${err instanceof Error ? err.message : String(err)}`)
    }

    // Stop before Vercel kills the function mid-write. The remainder are
    // picked up tomorrow, oldest-synced first, so nothing starves.
    if (Date.now() - started > 240_000) {
      details.push(`stopped early after ${synced + failed} of ${rows.length}`)
      break
    }
  }

  if (failed > 0) {
    console.error(`[instagram-cron] ${synced} synced, ${failed} failed: ${details.join(' | ')}`)
  } else {
    console.info(`[instagram-cron] ${synced} synced in ${Date.now() - started}ms`)
  }

  return NextResponse.json({ synced, failed, considered: rows.length })
}
