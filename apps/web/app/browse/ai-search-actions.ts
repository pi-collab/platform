'use server'

import { verifyBrand } from '@/lib/brand-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadCandidates } from '@/lib/ai-search/candidates'
import { aiSearchConfigured, parseSearchQuery } from '@/lib/ai-search/parse'
import { rankCandidates } from '@/lib/ai-search/score'
import type { SearchFilters, SearchOutcome } from '@/lib/ai-search/types'

/**
 * AI creator search, end to end: one model call to understand the query, then
 * ranking in code against live creator data.
 *
 * Cost control, in order of how much they save:
 *   1. The CACHE. A parse is a function of the query text alone, so an
 *      identical question inside the window reuses it and costs nothing. Kept
 *      global rather than per brand: the reused value is derived from the
 *      asking brand's own words, so it carries nothing from the brand that
 *      asked first. Results are always recomputed against live data.
 *   2. The CAP. A per-brand daily ceiling, counted from the rows this action
 *      writes, which is why the table denies client inserts: a forged row would
 *      otherwise reset someone's cap.
 *   3. Ranking never calls the model, so cost does not scale with the number of
 *      creators or with re-ranking when a brand edits a chip.
 */

const MAX_QUERY = 400
const DAILY_CAP = 50
const CACHE_HOURS = 24
const RESULT_LIMIT = 20

const normalise = (q: string): string => q.toLowerCase().replace(/\s+/g, ' ').trim()

export async function aiCreatorSearch(rawQuery: string): Promise<SearchOutcome> {
  const brand = await verifyBrand()

  const query = (rawQuery ?? '').trim().slice(0, MAX_QUERY)
  if (!query) {
    return { ok: false, kind: 'empty_query', message: 'Type what you are looking for.' }
  }

  if (!aiSearchConfigured()) {
    // The manual filters below still work, and the message says so rather than
    // reporting a failure the brand cannot act on.
    return {
      ok: false,
      kind: 'unconfigured',
      message: 'AI search is not switched on yet. The filters below still work.',
    }
  }

  const admin = createAdminClient()
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  const { count: usedToday } = await admin
    .from('ai_search_queries')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brand.brandId)
    .gte('created_at', since)

  if ((usedToday ?? 0) >= DAILY_CAP) {
    return {
      ok: false,
      kind: 'rate_limited',
      message: `You have used today's ${DAILY_CAP} AI searches. The filters below still work, and the limit resets tomorrow.`,
    }
  }

  const queryNorm = normalise(query)
  const cacheSince = new Date(Date.now() - CACHE_HOURS * 3600 * 1000).toISOString()

  const { data: cached } = await admin
    .from('ai_search_queries')
    .select('filters')
    .eq('query_norm', queryNorm)
    .gte('created_at', cacheSince)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let filters: SearchFilters
  let model: string | null = null
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let latencyMs: number | null = null
  const cacheHit = Boolean(cached?.filters)

  if (cacheHit) {
    filters = cached!.filters as SearchFilters
  } else {
    const started = Date.now()
    try {
      const parsed = await parseSearchQuery(query)
      filters = parsed.filters
      model = parsed.model
      inputTokens = parsed.inputTokens
      outputTokens = parsed.outputTokens
      latencyMs = Date.now() - started
    } catch (err) {
      console.error(`[ai-search] parse failed brand=${brand.brandId}: ${err instanceof Error ? err.message : String(err)}`)
      return {
        ok: false,
        kind: 'failed',
        message: 'Could not read that search just now. Try again, or use the filters below.',
      }
    }
  }

  const candidates = await loadCandidates()
  const { results, softened, excludedCount } = rankCandidates(candidates, filters, RESULT_LIMIT)

  // Logged after ranking so result_ids is what the brand actually saw. Never
  // awaited for a value this function depends on, and never able to fail the
  // search: the answer is already computed by this point.
  const { error: logError } = await admin.from('ai_search_queries').insert({
    brand_id: brand.brandId,
    user_id: brand.profileId,
    query_raw: query,
    query_norm: queryNorm,
    filters,
    result_ids: results.map(r => r.candidate.id),
    result_count: results.length,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    latency_ms: latencyMs,
    cache_hit: cacheHit,
  })
  if (logError) {
    console.error(`[ai-search] log failed brand=${brand.brandId}: ${logError.message}`)
  }

  return { ok: true, filters, results, softened, excludedCount, cacheHit }
}

/**
 * Re-rank without the model, for when a brand edits the understood filters.
 *
 * The parse is the only paid step, so removing a chip must not repeat it. Not
 * logged and not counted against the cap: it is the same search, reconsidered.
 */
export async function rerankWithFilters(filters: SearchFilters): Promise<SearchOutcome> {
  await verifyBrand()
  const candidates = await loadCandidates()
  const { results, softened, excludedCount } = rankCandidates(candidates, filters, RESULT_LIMIT)
  return { ok: true, filters, results, softened, excludedCount, cacheHit: true }
}
