import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateFilters } from '@/lib/ai/creator-search-types'
import { brandForApi, jsonFail } from '@/lib/meta/api-auth'
import { metaMarketplaceEnabled, metaQueryMode } from '@/lib/meta/config'
import { MetaNotEligibleError, MetaTokenInvalidError } from '@/lib/meta/graph'
import { ELIGIBILITY_TEXT } from '@/lib/meta/eligibility-copy'
import { DEFAULT_META_OPTIONS, MetaOptionsSchema, buildMetaParams } from '@/lib/meta/marketplace-params'
import { loadBrandConnection, searchMarketplace } from '@/lib/meta/marketplace'
import { NOT_APPROVED_MESSAGE, brandMayInvite } from '@/lib/meta/invite-gate'

/**
 * POST /api/meta/creator-search { searchId, options? }: the brand's saved
 * Guapd AI search, also run against Instagram Creator Marketplace.
 *
 * The Meta parameters are built from the search's VALIDATED filters (never
 * the raw brief, except the redacted query in direct mode) and checked
 * against Meta's allowed values before any call. Results are matched to
 * Guapd creators by Instagram username. No email is returned or stored.
 * Limits: 15 Meta calls per saved search, 60 per brand per day (cached
 * repeats are free).
 */

const PER_SEARCH = 15
const PER_DAY = 60
const Body = z.object({ searchId: z.string().uuid(), options: MetaOptionsSchema.optional() }).strict()

export async function POST(request: NextRequest) {
  if (!metaMarketplaceEnabled()) return jsonFail(404, 'Not found.')
  const a = await brandForApi(request)
  if ('response' in a) return a.response
  const brand = a.brand
  // Instagram results show creators who are not on Guapd (bio, category,
  // followers): more than /browse gives an unapproved brand, and every result
  // leads to an invite. Same approval rule as invites.
  if (!(await brandMayInvite(brand.brandId))) return NextResponse.json({ ok: false, kind: 'not_approved', message: NOT_APPROVED_MESSAGE.replace('Invites open', 'Instagram search opens') }, { status: 403 })

  const raw = await request.text()
  if (raw.length > 4000) return jsonFail(413, 'That request is too large.')
  let parsed: z.infer<typeof Body>
  try { const r = Body.safeParse(JSON.parse(raw)); if (!r.success) return jsonFail(400, 'That request could not be read.'); parsed = r.data } catch { return jsonFail(400, 'That request could not be read.') }

  const { data: elig } = await createAdminClient().from('brand_meta_eligibility').select('state').eq('brand_id', brand.brandId).maybeSingle()
  if (elig?.state === 'not_eligible') return NextResponse.json({ ok: false, kind: 'not_eligible', message: ELIGIBILITY_TEXT.not_eligible }, { status: 403 })
  const conn = await loadBrandConnection(brand.brandId)
  if (!conn) return NextResponse.json({ ok: false, kind: 'not_connected', message: 'Connect Facebook to search Instagram Creator Marketplace.' }, { status: 409 })

  const admin = createAdminClient()
  const { data: row } = await admin.from('brand_creator_searches').select('id, brief, filters, meta_runs').eq('id', parsed.searchId).eq('brand_id', brand.brandId).maybeSingle()
  if (!row) return jsonFail(404, 'That search was not found.')
  const filters = validateFilters(row.filters)
  if (!filters) return jsonFail(400, 'That search cannot be sent to Instagram.')

  const params = buildMetaParams(filters, row.brief, metaQueryMode(), parsed.options ?? DEFAULT_META_OPTIONS)
  if (!params) return jsonFail(400, 'This search cannot be sent to Instagram Creator Marketplace (it covers creators in India only).')

  if (row.meta_runs >= PER_SEARCH) return jsonFail(429, 'This search has been sent to Instagram many times. Start a new search.')
  const { data: today } = await admin.from('brand_creator_searches').select('meta_runs').eq('brand_id', brand.brandId).gte('last_meta_at', new Date(Date.now() - 24 * 3_600_000).toISOString())
  if ((today ?? []).reduce((s, r) => s + (r.meta_runs ?? 0), 0) >= PER_DAY) return jsonFail(429, 'You have reached today\'s Instagram searches. The Guapd results above still work.')

  try {
    const { creators, cached } = await searchMarketplace(conn, params)
    if (!cached) {
      await admin.from('brand_creator_searches').update({ meta_runs: row.meta_runs + 1, last_meta_at: new Date().toISOString() }).eq('id', row.id)
    }
    console.info(`[meta] marketplace search brand=${brand.brandId} search=${row.id} results=${creators.length} cached=${cached} mode=${metaQueryMode()}`)
    return NextResponse.json({ ok: true, creators, sentQuery: params.query ?? null })
  } catch (err) {
    if (err instanceof MetaNotEligibleError) return NextResponse.json({ ok: false, kind: 'not_eligible', message: ELIGIBILITY_TEXT.not_eligible }, { status: 403 })
    if (err instanceof MetaTokenInvalidError) return NextResponse.json({ ok: false, kind: 'not_connected', message: 'Facebook stopped accepting Guapd\'s access. Reconnect to search Instagram.' }, { status: 409 })
    console.error(`[meta] marketplace search failed brand=${brand.brandId}: ${err instanceof Error ? err.message : String(err)}`)
    return jsonFail(502, 'Instagram Creator Marketplace did not answer. Try again in a moment.')
  }
}
