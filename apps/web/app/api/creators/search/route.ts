import { NextRequest, NextResponse } from 'next/server'
import { isRedirectError } from 'next/dist/client/components/redirect'
import { z } from 'zod'
import { verifyBrand } from '@/lib/brand-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { BriefUnreadableError, briefParserConfigured, briefToFilters, cleanBrief } from '@/lib/ai/brief-filters'
import { creatorSearchEnabled } from '@/lib/ai/creator-search-flag'
import { runCreatorSearch } from '@/lib/ai/run-creator-search'
import { MAX_BRIEF, validateFilters, type BriefFilters, type CreatorSearchError, type CreatorSearchResponse } from '@/lib/ai/creator-search-types'

/**
 * POST /api/creators/search: Guapd AI creator search.
 *
 * Off (404) unless CREATOR_SEARCH=1. Signed-in brands only. Two shapes:
 *   { brief }                 a new search: one model call, saved as a new row
 *   { searchId, filters }     a chip edit: the brand's corrected filters, re-run
 *                             WITHOUT the model, saved onto the same row
 * Either way the filters pass validateFilters before anything runs, so a
 * forged body cannot change what is queried, only which typed values.
 *
 * Limits, per brand, counted from brand_creator_searches (server only, so a
 * brand cannot reset them): new briefs per 5 minutes and per day, and chip
 * re-runs per search. Results are capped at RESULT_CAP.
 *
 * Logs carry ids and error messages only: never a brief, a token or a key.
 */

const BRIEFS_PER_5_MIN = 6
const BRIEFS_PER_DAY = 40
const RERUNS_PER_SEARCH = 40
const MAX_BODY = 40_000

const Body = z.union([
  z.object({ brief: z.string() }).strict(),
  z.object({ searchId: z.string().uuid(), filters: z.unknown() }).strict(),
])

const fail = (status: number, kind: CreatorSearchError['kind'], message: string) =>
  NextResponse.json({ ok: false, kind, message } satisfies CreatorSearchError, { status })

export async function POST(request: NextRequest) {
  if (!creatorSearchEnabled()) return fail(404, 'off', 'Not found.')

  // Same-site only. The session cookie is SameSite=Lax already; this also
  // turns away a cross-site fetch that somehow carries it.
  const origin = request.headers.get('origin')
  if (origin && new URL(origin).host !== request.nextUrl.host) return fail(403, 'unauthorised', 'Not allowed.')

  let brand: Awaited<ReturnType<typeof verifyBrand>>
  try {
    brand = await verifyBrand()
  } catch (err) {
    // verifyBrand redirects a visitor to sign in; an API answers 401 instead.
    if (isRedirectError(err)) return fail(401, 'unauthorised', 'Sign in as a brand to search.')
    throw err
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY) return fail(413, 'bad_request', 'That request is too large.')
  let json: unknown
  try { json = JSON.parse(raw) } catch { return fail(400, 'bad_request', 'That request could not be read.') }
  const body = Body.safeParse(json)
  if (!body.success) return fail(400, 'bad_request', 'That request could not be read.')

  const admin = createAdminClient()

  // ── A chip edit: re-run the corrected filters on the brand's own search ──
  if ('searchId' in body.data) {
    const filters = validateFilters(body.data.filters)
    if (!filters) return fail(400, 'bad_request', 'Those filters could not be used.')

    const { data: row } = await admin
      .from('brand_creator_searches')
      .select('id, brief, run_count')
      .eq('id', body.data.searchId)
      .eq('brand_id', brand.brandId)
      .maybeSingle()
    if (!row) return fail(404, 'not_found', 'That search was not found.')
    if (row.run_count >= RERUNS_PER_SEARCH) {
      return fail(429, 'rate_limited', 'This search has been changed many times. Start a new one from the box above.')
    }

    try {
      const out = await runCreatorSearch(filters)
      const { error } = await admin.from('brand_creator_searches').update({
        filters,
        result_ids: out.results.map((r) => r.id),
        result_count: out.results.length,
        run_count: row.run_count + 1,
        last_run_at: new Date().toISOString(),
      }).eq('id', row.id).eq('brand_id', brand.brandId)
      if (error) console.error(`[creator-search] rerun save failed search=${row.id}: ${error.message}`)
      return NextResponse.json({ ok: true, searchId: row.id, brief: row.brief, ...out } satisfies CreatorSearchResponse)
    } catch (err) {
      console.error(`[creator-search] rerun failed search=${row.id}: ${err instanceof Error ? err.message : String(err)}`)
      return fail(500, 'failed', 'Could not search just now. Try again.')
    }
  }

  // ── A new brief ──
  // Length is checked on the trimmed text, before any cleaning shortens it.
  const trimmed = body.data.brief.trim()
  if (trimmed.length < 3) return fail(400, 'bad_request', 'Describe the creators you want.')
  if (trimmed.length > MAX_BRIEF) return fail(400, 'bad_request', `Keep the brief to ${MAX_BRIEF.toLocaleString('en-IN')} characters. Yours is ${trimmed.length.toLocaleString('en-IN')}.`)
  const brief = cleanBrief(trimmed)
  if (!briefParserConfigured()) return fail(503, 'off', 'Guapd AI is not switched on yet.')

  const now = Date.now()
  const [{ count: recent }, { count: today }] = await Promise.all([
    admin.from('brand_creator_searches').select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.brandId).gte('created_at', new Date(now - 5 * 60_000).toISOString()),
    admin.from('brand_creator_searches').select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.brandId).gte('created_at', new Date(now - 24 * 3_600_000).toISOString()),
  ])
  if ((recent ?? 0) >= BRIEFS_PER_5_MIN) return fail(429, 'rate_limited', 'That is a lot of searches at once. Wait a few minutes, or edit the filters below.')
  if ((today ?? 0) >= BRIEFS_PER_DAY) return fail(429, 'rate_limited', `You have run today's ${BRIEFS_PER_DAY} searches. Editing the filters still works, and the limit resets tomorrow.`)

  let filters: BriefFilters
  let reading: Awaited<ReturnType<typeof briefToFilters>>
  try {
    reading = await briefToFilters(brief)
    filters = reading.filters
  } catch (err) {
    if (err instanceof BriefUnreadableError) {
      return fail(422, 'unreadable', 'Could not read that brief. Try describing the creators in a different way.')
    }
    console.error(`[creator-search] parse failed brand=${brand.brandId}: ${err instanceof Error ? err.message : String(err)}`)
    return fail(502, 'failed', 'Could not read that brief just now. Try again.')
  }

  // Cost, per search: token counts and ids only, never the brief.
  console.info(`[creator-search] parsed brand=${brand.brandId} model=${reading.model} in=${reading.inputTokens} out=${reading.outputTokens} chars=${brief.length}`)

  try {
    const out = await runCreatorSearch(filters)
    const { data: saved, error } = await admin.from('brand_creator_searches').insert({
      brand_id: brand.brandId,
      user_id: brand.profileId,
      brief,
      filters,
      result_ids: out.results.map((r) => r.id),
      result_count: out.results.length,
      model: reading.model,
      input_tokens: reading.inputTokens,
      output_tokens: reading.outputTokens,
    }).select('id').single()
    if (error || !saved) {
      // The row is the rate limit: without it the next search is not counted.
      console.error(`[creator-search] save failed brand=${brand.brandId}: ${error?.message ?? 'no row'}`)
      return fail(500, 'failed', 'Could not save that search. Try again.')
    }
    return NextResponse.json({ ok: true, searchId: saved.id, brief, ...out } satisfies CreatorSearchResponse)
  } catch (err) {
    console.error(`[creator-search] search failed brand=${brand.brandId}: ${err instanceof Error ? err.message : String(err)}`)
    return fail(500, 'failed', 'Could not search just now. Try again.')
  }
}
