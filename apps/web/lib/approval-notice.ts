import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Should the dashboard congratulate this brand on being approved?
 *
 * Approval is otherwise silent: the held notice simply disappears, so a brand
 * that had a deal sitting unsent gets no confirmation that it went out. They
 * were told "we'll notify you as soon as you're cleared" — this is that.
 *
 * ── Why the events table and not a column ───────────────────────────────────
 * Both facts already exist as events, so no migration is needed. Same
 * existence-check pattern as notifyOpsOnce in lib/send-gate.ts.
 *
 * Not localStorage: dismissing on a laptop would leave it waiting on a phone,
 * announcing an approval from three weeks ago.
 *
 * ── Why it is gated on having BEEN held ─────────────────────────────────────
 * `brand.pending_review` only exists for brands that actually tried to send and
 * were stopped. Without that check, every brand approved by other means — the
 * five auto-approved by migration 039, or any ops approves by hand — would be
 * congratulated on clearing a review they never went through, and told their
 * queued deals had been sent when they never had any.
 */
export const APPROVAL_ACK_EVENT = 'brand.approval_acknowledged'

export async function shouldShowApprovalNotice(brandId: string): Promise<boolean> {
  // Admin client: these events are not deal-scoped, so they are not reachable
  // through the brand's own RLS. brandId comes from verifyBrand, never a
  // client, so the scope is still the caller's own brand.
  const admin = createAdminClient()

  const [wasHeld, acknowledged] = await Promise.all([
    admin.from('events').select('id')
      .eq('event_type', 'brand.pending_review')
      .contains('detail', { brand_id: brandId })
      .limit(1).maybeSingle(),
    admin.from('events').select('id')
      .eq('event_type', APPROVAL_ACK_EVENT)
      .contains('detail', { brand_id: brandId })
      .limit(1).maybeSingle(),
  ])

  return Boolean(wasHeld.data) && !acknowledged.data
}
