import { notFound } from 'next/navigation'
import { verifyBrand } from '@/lib/brand-auth'
import { getBrandExperience } from '@/lib/experience-brand-server'
import { listBrandPoolCreators } from '@/lib/brand-creator-search'
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
export default async function BrandExperiencePoolPage({ params }: { params: { id: string } }) {
  await verifyBrand()
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound()
  const exp = await getBrandExperience(params.id)
  if (!exp.ok) notFound()
  const e = exp.data
  const creators = await listBrandPoolCreators(e.id)
  return (
    <BrandPoolClient experienceId={e.id} title={e.title} editable={e.status === 'rostering' || e.status === 'confirmed'}
      creatorsPlanned={e.request.creator_count ?? null} creators={creators} />
  )
}
