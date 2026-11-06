import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorSearchEnabled } from '@/lib/ai/creator-search-flag'
import { brandForApi, jsonFail } from '@/lib/meta/api-auth'

/** POST { feature, note? }: a brand's interest in a "Coming soon" Guapd AI
 *  feature, with an optional one-line note. Saved with the brand id, server
 *  only (0590). Starts nothing. At most 20 a day per brand. */
const NOTE = new RegExp("^[\\p{L}\\p{M}\\p{N}\\p{P}\\p{Zs}₹]{1,200}$", 'u')
const Body = z.object({ feature: z.enum(['write_brief', 'campaigns']), note: z.string().trim().max(200).optional() }).strict()

export async function POST(request: NextRequest) {
  const a = await brandForApi(request)
  if ('response' in a) return a.response
  if (!creatorSearchEnabled(a.brand.brandId)) return jsonFail(404, 'Not found.')
  const r = Body.safeParse(await request.json().catch(() => null))
  if (!r.success) return jsonFail(400, 'Bad request.')
  const note = r.data.note && r.data.note.length ? r.data.note.replace(/\s+/g, ' ') : null
  if (note && !NOTE.test(note)) return jsonFail(400, 'Keep it to one plain line.')
  const admin = createAdminClient()
  const { count } = await admin.from('ai_feature_interest').select('id', { count: 'exact', head: true }).eq('brand_id', a.brand.brandId).gte('created_at', new Date(Date.now() - 86400e3).toISOString())
  if ((count ?? 0) >= 20) return NextResponse.json({ ok: true })
  const { error } = await admin.from('ai_feature_interest').insert({ brand_id: a.brand.brandId, user_id: a.brand.profileId, feature: r.data.feature, note })
  if (error) { console.error(`[ai-interest] save failed brand=${a.brand.brandId}: ${error.message}`); return jsonFail(500, 'Could not save that.') }
  return NextResponse.json({ ok: true })
}
