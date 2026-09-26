import type { Metadata } from 'next'
import { verifyCreator } from '@/lib/creator-auth'
import { creatorGrowthState } from '@/lib/creator-growth-state'
import PricingClient from './PricingClient'

export const metadata: Metadata = { title: 'Pricing & fees · Guapd Creator', robots: { index: false, follow: false } }

export default async function CreatorPricingPage() {
  const ctx = await verifyCreator()
  /* Which page they see. Resolved server-side from their own row rather than
     offered as a toggle: a creator is on one track, and letting them switch to
     the other's economics raises a question this page cannot answer. */
  const growth = await creatorGrowthState(ctx.creatorId)
  return <PricingClient isGrowth={growth.isGrowth} />
}
