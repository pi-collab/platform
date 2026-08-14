'use client'

import { useEffect, useRef } from 'react'
import { identifyUser } from '@/lib/analytics'

/**
 * Ties analytics events to a known user.
 *
 * Rendered from authenticated layouts, which already resolve the `users.id`
 * UUID server-side — so no extra query, and the value never round-trips
 * through a login form.
 *
 * PII: the UUID is the ONLY identifier passed. No email, phone, or name. The
 * `role` property is included because it is a non-identifying segment that
 * makes almost every funnel question answerable.
 *
 * No-op until analytics consent is granted (see lib/analytics.ts).
 */
export default function AnalyticsIdentify({
  userId,
  role,
}: {
  userId: string
  role?: 'brand' | 'creator'
}) {
  const identified = useRef<string | null>(null)

  useEffect(() => {
    if (!userId || identified.current === userId) return
    identifyUser(userId, role ? { role } : undefined)
    identified.current = userId
  }, [userId, role])

  return null
}
