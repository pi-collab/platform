import { notFound } from 'next/navigation'
import { verifyBrand } from '@/lib/brand-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorSearchEnabled } from '@/lib/ai/creator-search-flag'
import { runCreatorSearch } from '@/lib/ai/run-creator-search'
import { validateFilters, type CreatorSearchResponse } from '@/lib/ai/creator-search-types'
import GuapdAiClient from './GuapdAiClient'
import type { MetaState } from './MetaSection'
import { metaAppConfigured, metaMarketplaceEnabled } from '@/lib/meta/config'
import { CONNECT_NOTICES, ELIGIBILITY_TEXT, type MetaEligibilityState } from '@/lib/meta/eligibility-copy'
import { getAiOnboarding, markAiOnboarding } from '@/lib/ai/onboarding'
import AiIntro from './AiIntro'
import './guapd-ai.css'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Guapd AI: brief-based creator search (behind CREATOR_SEARCH=1).
 *
 * ?s=<id> reopens one of the brand's own saved searches with its filters as
 * last edited, re-ranked against today's creators. Not counted as a run.
 * The first visit per brand user shows the intro (0590); ?intro=1 shows it
 * again ("What is Guapd AI?").
 */
export default async function GuapdAiPage({ searchParams }: { searchParams: { s?: string; meta?: string; intro?: string } }) {
  if (process.env.CREATOR_SEARCH !== '1') notFound()
  const brand = await verifyBrand()
  if (!creatorSearchEnabled(brand.brandId)) notFound()

  const metaOn = metaMarketplaceEnabled() && metaAppConfigured()
  const admin = createAdminClient()
  const conn = metaOn ? (await admin.from('brand_meta_connections').select('status, ig_username').eq('brand_id', brand.brandId).maybeSingle()).data : null

  const onboarding = await getAiOnboarding(brand.profileId)
  if (!searchParams.s && !searchParams.meta && (searchParams.intro === '1' || !onboarding.introSeen)) {
    if (!onboarding.introSeen) await markAiOnboarding(brand.profileId, { intro: true })
    return <AiIntro instagram={metaOn ? { connected: !!conn && conn.status === 'connected' } : null} />
  }

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
  if (metaOn) {
    const { data: elig } = await admin.from('brand_meta_eligibility').select('state').eq('brand_id', brand.brandId).maybeSingle()
    const state = (elig?.state ?? null) as MetaEligibilityState | null
    meta = {
      connected: !!conn && conn.status === 'connected',
      needsReconnect: conn?.status === 'needs_reconnect',
      igUsername: conn?.ig_username ?? null,
      eligibility: state,
      // A connect result: the callback's notice, or the eligibility reason it recorded.
      notice: searchParams.meta ? (CONNECT_NOTICES[searchParams.meta] ?? (state ? ELIGIBILITY_TEXT[state] : null)) : null,
      connectResult: searchParams.meta ?? null,
    }
  }

  return <GuapdAiClient initial={initial} meta={meta} />
}
