import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * How many messages this person has not read, across every deal.
 *
 * ── Why the admin client ────────────────────────────────────────────────────
 * The count spans deals, and it has to include a deal whose read marker does
 * not exist yet — a thread nobody has opened is entirely unread, which is
 * exactly the case the badge exists for. Doing that under RLS means a left join
 * the policies would have to permit in both directions; scoping it here by the
 * caller's own id is simpler and narrower, and nothing but a number leaves this
 * function.
 *
 * ── Only the other party's messages ─────────────────────────────────────────
 * Your own are read by definition, and counting them would leave a badge on a
 * conversation you were the last to speak in.
 */

export type Party = 'brand' | 'creator'

export async function unreadMessageCount(
  userId: string,
  party: Party,
  dealIds: string[],
): Promise<number> {
  if (dealIds.length === 0) return 0

  const admin = createAdminClient()

  const [{ data: reads }, { data: messages }] = await Promise.all([
    admin
      .from('message_reads')
      .select('deal_id, last_read_at')
      .eq('user_id', userId)
      .in('deal_id', dealIds),
    admin
      .from('messages')
      .select('deal_id, sender_party, created_at')
      .in('deal_id', dealIds)
      .neq('sender_party', party),
  ])

  const readAt = new Map((reads ?? []).map((r) => [r.deal_id as string, r.last_read_at as string]))

  // A deal with no marker counts every message from the other side: never
  // opened is not the same as nothing to read.
  return (messages ?? []).filter((m) => {
    const seen = readAt.get(m.deal_id as string)
    return !seen || (m.created_at as string) > seen
  }).length
}

/** Mark a thread read, now. Upserted on (user_id, deal_id), so opening the same
 *  thread twice moves the marker rather than accumulating rows. */
export async function markThreadRead(userId: string, dealId: string): Promise<void> {
  await createAdminClient()
    .from('message_reads')
    .upsert(
      { user_id: userId, deal_id: dealId, last_read_at: new Date().toISOString() },
      { onConflict: 'user_id,deal_id' },
    )
}
