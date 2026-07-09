'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Thin client component that subscribes to deal + invoice changes
 * for the dashboard. Renders nothing — just triggers router.refresh()
 * when the user's own deals or invoices change, so server-side
 * aggregate counts recompute.
 *
 * RLS-respected: Supabase realtime only delivers events for rows
 * the subscriber can SELECT, so a brand only gets their own deals.
 *
 * Debounced: rapid changes (e.g. bulk item approvals) coalesce
 * into a single refresh after 500ms of quiet.
 */
export default function RealtimeDashboardListener() {
  const router = useRouter()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const debouncedRefresh = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        console.log('[realtime] dashboard: change detected, refreshing')
        router.refresh()
      }, 500)
    }

    const channel = supabase
      .channel('dashboard')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deals' },
        debouncedRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices' },
        debouncedRefresh,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[realtime] dashboard: subscribed (deals + invoices)')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[realtime] dashboard: channel error')
        }
      })

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
