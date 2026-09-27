import type { Metadata } from 'next'
import { verifyCreator } from '@/lib/creator-auth'
import { creatorGrowthState } from '@/lib/creator-growth-state'
import PricingClient from './PricingClient'

export const metadata: Metadata = { title: 'Pricing & fees · Guapd Creator', robots: { index: false, follow: false } }

/**
 * Where the phone's back arrow goes — same rule as packages, payments and
 * notifications. The caller states its own return in `?from=`, so an arrow
 * never guesses.
 */
function backFrom(from: string | undefined) {
  return from === 'profile' ? '/creator/profile' : '/creator/dashboard'
}

export default async function CreatorPricingPage(
  { searchParams }: { searchParams?: { from?: string } },
) {
  const ctx = await verifyCreator()
  /* Which page they see. Resolved server-side from their own row rather than
     offered as a toggle: a creator is on one track, and letting them switch to
     the other's economics raises a question this page cannot answer. */
  const growth = await creatorGrowthState(ctx.creatorId)
  return <PricingClient isGrowth={growth.isGrowth} backHref={backFrom(searchParams?.from)} />
}
