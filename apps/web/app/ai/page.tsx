import { notFound } from 'next/navigation'
import { verifyBrand } from '@/lib/brand-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorSearchEnabled } from '@/lib/ai/creator-search-flag'
import { runCreatorSearch } from '@/lib/ai/run-creator-search'
import { validateFilters, type CreatorSearchResponse } from '@/lib/ai/creator-search-types'
import GuapdAiClient from './GuapdAiClient'
import './guapd-ai.css'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Guapd AI: brief-based creator search (behind CREATOR_SEARCH=1).
 *
 * ?s=<id> reopens one of the brand's own saved searches with its filters as
 * last edited, re-ranked against today's creators. Not counted as a run.
 */
export default async function GuapdAiPage({ searchParams }: { searchParams: { s?: string } }) {
  if (!creatorSearchEnabled()) notFound()
  const brand = await verifyBrand()

  let initial: CreatorSearchResponse | null = null
  if (searchParams.s && UUID.test(searchParams.s)) {
    const { data: row } = await createAdminClient()
      .from('brand_creator_searches')
      .select('id, brief, filters')
      .eq('id', searchParams.s)
      .eq('brand_id', brand.brandId)
      .maybeSingle()
    const filters = row ? validateFilters(row.filters) : null
    if (row && filters) {
      try {
        initial = { ok: true, searchId: row.id, brief: row.brief, ...(await runCreatorSearch(filters)) }
      } catch (err) {
        console.error(`[creator-search] reopen failed search=${row.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  return <GuapdAiClient initial={initial} />
}
