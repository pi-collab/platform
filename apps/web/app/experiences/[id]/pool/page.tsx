import { notFound } from 'next/navigation'
import { verifyBrand } from '@/lib/brand-auth'
import { getBrandExperience } from '@/lib/experience-brand-server'
import { listBrandPoolPage, type BrandPoolFilters } from '@/lib/brand-creator-search'
import { LIST_PAGE_SIZE } from '@/lib/list-page'
import BrandPoolClient from './BrandPoolClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Add creators · Guapd Experiences' }

/**
 * The brand's creator pool for its own Experience (0557): the Growth campaign
 * pool's layout and card, WITHOUT any price (an Experience creator is paid a
 * shoot day rate, which never reaches a brand). Adding puts a creator on the
 * roster as the brand's accepted pick; Guapd checks they are free, confirms
 * and sends the offer.
 *
 * getBrandExperience runs the brand gate (a member of THIS Experience's brand)
 * before anything is read with the service role.
 */
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null

export default async function BrandExperiencePoolPage({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string | string[] | undefined> }) {
  await verifyBrand()
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound()
  const exp = await getBrandExperience(params.id)
  if (!exp.ok) notFound()
  const e = exp.data
  // 0570: search + filters + pages run in the database (brand gate inside).
  const band = one(searchParams.band)
  const filters: BrandPoolFilters = {
    q: one(searchParams.q)?.slice(0, 100) ?? null, niche: one(searchParams.niche), location: one(searchParams.location),
    platform: ['instagram', 'youtube'].includes(one(searchParams.platform) ?? '') ? one(searchParams.platform) : null,
    band: band === 'u50' || band === '50-150' || band === '150+' ? band : null,
  }
  const pageNo = Math.max(1, Number.parseInt(one(searchParams.page) ?? '1', 10) || 1)
  const pool = await listBrandPoolPage(e.id, filters, LIST_PAGE_SIZE, (pageNo - 1) * LIST_PAGE_SIZE)
  if (!pool) notFound()
  return (
    <BrandPoolClient experienceId={e.id} title={e.title} editable={e.status === 'rostering' || e.status === 'confirmed'}
      creatorsPlanned={e.request.creator_count ?? null} creators={pool.creators}
      filters={filters} page={pageNo} total={pool.total} niches={pool.niches} locations={pool.locations}
      acceptedCount={pool.accepted} toReviewCount={pool.toReview} />
  )
}
