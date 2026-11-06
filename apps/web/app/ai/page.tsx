import { notFound } from 'next/navigation'
import { verifyBrand } from '@/lib/brand-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorSearchEnabled } from '@/lib/ai/creator-search-flag'
import { runCreatorSearch } from '@/lib/ai/run-creator-search'
import { validateFilters, type CreatorSearchResponse } from '@/lib/ai/creator-search-types'
import GuapdAiClient from './GuapdAiClient'
import type { MetaState } from './MetaSection'
import { metaAppConfigured, metaMarketplaceEnabled } from '@/lib/meta/config'
import './guapd-ai.css'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Guapd AI: brief-based creator search (behind CREATOR_SEARCH=1).
 *
 * ?s=<id> reopens one of the brand's own saved searches with its filters as
 * last edited, re-ranked against today's creators. Not counted as a run.
 */
const META_NOTICES: Record<string, string> = {
  connected: 'Facebook connected.',
  connected_first_page: 'Facebook connected, using the first Page with an Instagram business account.',
  cancelled: 'Facebook connection cancelled.',
  no_instagram_page: 'No Facebook Page with an Instagram business account was found. Link one in Meta Business Suite, then connect again.',
  missing_permission: 'Instagram Creator Marketplace access was not granted. Connect again and allow it.',
  state_mismatch: 'That connection could not be verified. Try again.',
  failed: 'Facebook could not be connected. Try again.',
  save_failed: 'Facebook could not be connected. Try again.',
}

export default async function GuapdAiPage({ searchParams }: { searchParams: { s?: string; meta?: string } }) {
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

  let meta: MetaState | null = null
  if (metaMarketplaceEnabled() && metaAppConfigured()) {
    const { data: conn } = await createAdminClient().from('brand_meta_connections').select('status, ig_username').eq('brand_id', brand.brandId).maybeSingle()
    meta = { connected: !!conn, needsReconnect: conn?.status === 'needs_reconnect', igUsername: conn?.ig_username ?? null, notice: searchParams.meta ? META_NOTICES[searchParams.meta] ?? null : null }
  }

  return <GuapdAiClient initial={initial} meta={meta} />
}
