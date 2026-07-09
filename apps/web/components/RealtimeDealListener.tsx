'use client'

import { useRealtimeDeal } from '@/lib/realtime/useRealtimeDeal'

/**
 * Thin client component that subscribes to deal status changes.
 * Drop into server-rendered deal detail pages — renders nothing,
 * just triggers router.refresh() when the deal row updates.
 */
export default function RealtimeDealListener({ dealId }: { dealId: string }) {
  useRealtimeDeal(dealId)
  return null
}
