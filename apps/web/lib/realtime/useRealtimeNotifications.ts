import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Subscribe to new notifications in real time.
 * Returns a live unread count that increments when a new notification
 * arrives via the realtime INSERT event.
 *
 * RLS scopes the subscription: only rows where user_id = my_user_id()
 * are delivered — no cross-user leakage.
 */
export function useRealtimeNotifications(initialCount: number, accept?: (type: string) => boolean): number {
  const [count, setCount] = useState(initialCount)

  // Sync with server-rendered count on navigation
  useEffect(() => {
    setCount(initialCount)
  }, [initialCount])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('notifications-bell')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        (payload: { new?: { type?: string } }) => {
          // 0546: the console bell counts staff alerts only, the brand bell
          // never counts them (lib/experience-staff-notifications).
          if (accept && !accept(String(payload.new?.type ?? ''))) return
          setCount((prev) => prev + 1)
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[realtime] notifications-bell: subscribed')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[realtime] notifications-bell: channel error')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return count
}
