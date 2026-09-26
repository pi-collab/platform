import type { Metadata } from 'next'
import { verifyBrand } from '@/lib/brand-auth'
import BrandPricingClient from './BrandPricingClient'

export const metadata: Metadata = { title: 'Pricing · Guapd', robots: { index: false, follow: false } }

/**
 * Brand-side pricing. Behind the brand gate rather than public: it is drawn
 * inside the app chrome, and the figures it quotes are the ones a signed-in
 * brand is about to be charged. A public pricing page is a marketing-site job.
 */
export default async function BrandPricingPage() {
  await verifyBrand()
  return <BrandPricingClient />
}
