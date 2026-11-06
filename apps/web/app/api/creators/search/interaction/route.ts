import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorSearchEnabled } from '@/lib/ai/creator-search-flag'
import { brandForApi, jsonFail } from '@/lib/meta/api-auth'

/**
 * POST { searchId, creatorId, kind }: a brand opened a creator's profile or
 * started an offer FROM a Guapd AI search result. Feeds the creator's "Your
 * visibility" counts (0589). Recorded only when the search is the brand's own
 * and the creator is in its saved results; one row per search, creator and
 * kind (repeats are ignored).
 */
const Body = z.object({ searchId: z.string().uuid(), creatorId: z.string().uuid(), kind: z.enum(['profile_open', 'offer_started']) }).strict()

export async function POST(request: NextRequest) {
  const a = await brandForApi(request)
  if ('response' in a) return a.response
  if (!creatorSearchEnabled(a.brand.brandId)) return jsonFail(404, 'Not found.')
  let body: z.infer<typeof Body>
  try { const r = Body.safeParse(await request.json()); if (!r.success) return jsonFail(400, 'Bad request.'); body = r.data } catch { return jsonFail(400, 'Bad request.') }

  const admin = createAdminClient()
  const { data: search } = await admin.from('brand_creator_searches').select('id, result_ids').eq('id', body.searchId).eq('brand_id', a.brand.brandId).maybeSingle()
  if (!search || !(search.result_ids as string[]).includes(body.creatorId)) return jsonFail(404, 'Not found.')
  const { error } = await admin.from('brand_search_interactions').upsert(
    { search_id: search.id, brand_id: a.brand.brandId, creator_id: body.creatorId, kind: body.kind },
    { onConflict: 'search_id,creator_id,kind', ignoreDuplicates: true },
  )
  if (error) console.error(`[creator-search] interaction save failed search=${search.id}: ${error.message}`)
  return NextResponse.json({ ok: true })
}
