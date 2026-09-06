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

/**
 * Unread per deal, for the inbox list.
 *
 * The same rule as the header total, kept as one query rather than one per
 * thread: an inbox with fifty conversations would otherwise make fifty round
 * trips to render a column of small numbers.
 */
export async function unreadByDeal(
  userId: string,
  party: Party,
  dealIds: string[],
): Promise<Record<string, number>> {
  if (dealIds.length === 0) return {}

  const admin = createAdminClient()

  const [{ data: reads }, { data: messages }] = await Promise.all([
    admin
      .from('message_reads')
      .select('deal_id, last_read_at')
      .eq('user_id', userId)
      .in('deal_id', dealIds),
    admin
      .from('messages')
      .select('deal_id, created_at')
      .in('deal_id', dealIds)
      .neq('sender_party', party),
  ])

  const readAt = new Map((reads ?? []).map((r) => [r.deal_id as string, r.last_read_at as string]))
  const out: Record<string, number> = {}

  for (const m of messages ?? []) {
    const dealId = m.deal_id as string
    const seen = readAt.get(dealId)
    // No marker means never opened, which is not the same as nothing to read.
    if (!seen || (m.created_at as string) > seen) {
      out[dealId] = (out[dealId] ?? 0) + 1
    }
  }

  return out
}

/**
 * Unread NOTIFICATIONS for the bell.
 *
 * Distinct from unreadMessageCount: that counts messages against
 * message_reads, this counts notification rows against their own read_at. A
 * screen showing one number where it means the other is the sort of thing
 * nobody notices until a badge refuses to clear.
 */
export async function unreadNotificationCount(
  supabase: { from: (t: string) => any },
  profileId: string,
): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profileId)
    .is('read_at', null)
  return count ?? 0
}
