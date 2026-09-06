import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Message {
  id: string
  deal_id: string
  sender_party: 'brand' | 'creator'
  body: string | null
  created_at: string
}

/**
 * Subscribe to new messages on a deal in real time.
 *
 * DEDUPE: when the sender inserts a message via the server action,
 * it's added to state immediately. The realtime INSERT event for the
 * same row arrives shortly after. We skip it if the message id is
 * already in state — no duplicate bubble.
 *
 * Returns: nothing. Fires onNewMessage for genuinely new messages only.
 */
/**
 * `key` distinguishes two subscribers watching the SAME deal.
 *
 * Supabase channels are addressed by name. When the mobile thread and the
 * desktop split-pane are both mounted — which they are the moment a thread is
 * open, one of them merely hidden by CSS — both asked for `messages-<dealId>`,
 * and subscribing twice to one channel instance throws. That surfaced as
 * "application error: a client-side exception has occurred" on opening a
 * thread. A distinct key per subscriber keeps them on separate channels.
 */
export function useRealtimeMessages(
  dealId: string | null,
  onNewMessage: (msg: Message) => void,
  knownIdsRef: React.RefObject<Set<string>>,
  key = '',
) {
  const callbackRef = useRef(onNewMessage)
  callbackRef.current = onNewMessage

  useEffect(() => {
    if (!dealId) return

    const supabase = createClient()
    const channel = supabase
      .channel(`messages-${dealId}${key ? `-${key}` : ''}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `deal_id=eq.${dealId}`,
        },
        (payload) => {
          const msg = payload.new as Message
          // Dedupe: skip if already in state (sender's own message)
          if (knownIdsRef.current?.has(msg.id)) return
          callbackRef.current(msg)
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[realtime] messages-${dealId}${key ? `-${key}` : ''}: subscribed`)
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`[realtime] messages-${dealId}${key ? `-${key}` : ''}: channel error`)
        } else if (status === 'TIMED_OUT') {
          console.warn(`[realtime] messages-${dealId}${key ? `-${key}` : ''}: timed out`)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [dealId, knownIdsRef])
}
