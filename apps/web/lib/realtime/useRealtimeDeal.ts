import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Subscribe to deal-related changes in real time.
 *
 * The deal detail page renders state from THREE tables:
 *   - deals (status, terms, revisions_used)
 *   - deal_deliverable_items (item_status, external_url, version)
 *   - invoices (status, accepted_at, paid_at)
 *
 * A single-table subscription on `deals` misses actions that only
 * touch items or invoices (e.g. approving one deliverable item,
 * accepting an invoice). This hook subscribes to all three, scoped
 * to the deal id, and calls router.refresh() on any change.
 */
export function useRealtimeDeal(dealId: string) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const refresh = () => {
      console.log(`[realtime] deal-${dealId}: change detected, refreshing`)
      router.refresh()
    }

    const channel = supabase
      .channel(`deal-${dealId}`)
      // deals row itself (status changes, revision count, etc.)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deals',
          filter: `id=eq.${dealId}`,
        },
        refresh,
      )
      // deliverable items (approve, revision, submit)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deal_deliverable_items',
          filter: `deal_id=eq.${dealId}`,
        },
        refresh,
      )
      // invoices (issue, accept, pay)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invoices',
          filter: `deal_id=eq.${dealId}`,
        },
        refresh,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[realtime] deal-${dealId}: subscribed (deals + items + invoices)`)
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`[realtime] deal-${dealId}: channel error`)
        } else if (status === 'TIMED_OUT') {
          console.warn(`[realtime] deal-${dealId}: timed out`)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [dealId, router])
}
