import 'server-only'

/**
 * A brand's track record, computed rather than asserted.
 *
 * The mirror of lib/creator-track-record, and deliberately NOT the same three
 * figures. A creator is judged on delivering on time; a brand is judged on
 * PAYING on time, which is the complaint every piece of research on this
 * market opens with. Reusing the creator's on-time-delivery number here would
 * have told a brand how punctual their creators are and called it their own
 * record.
 *
 * Every figure returns null when there is no basis for it. A percentage over
 * zero deals is not 100%, it is nothing, and rounding an empty set up to a
 * flattering number is the failure this exists to avoid — the brand dashboard
 * printed "On-time 100% · ~6h · 100%" as literal strings before this.
 */

export interface BrandTrackRecord {
  /** Deals that reached a finished state. */
  dealsCompleted: number
  /** % of invoices paid on or before their due date. Null when none were due. */
  onTimePaymentPct: number | null
  /** Typical hours from a creator's message to this brand's reply. */
  responseHours: number | null
  /** % of accepted deals that reached completion. */
  completionPct: number | null
}

export interface BrandTrackDeal {
  id: string
  status: string
}

export interface BrandTrackInvoice {
  deal_id: string
  due_date: string | null
  paid_at: string | null
  status: string
}

export interface BrandTrackMessage {
  deal_id: string
  sender_party: string
  created_at: string
}

const COMPLETED = new Set(['complete', 'paid', 'approved'])
/** Reached agreement at some point, so completion was actually possible. */
const ACCEPTED = new Set(['agreed', 'delivered', 'revision', 'approved', 'paid', 'complete', 'cancelled'])

export function computeBrandTrackRecord(
  deals: BrandTrackDeal[],
  invoices: BrandTrackInvoice[],
  messages: BrandTrackMessage[],
): BrandTrackRecord {
  // ── On-time payment ───────────────────────────────────────────────────────
  // Only invoices that HAVE a due date and have been paid can be judged. An
  // unpaid invoice that is not yet due is not late, and counting it would make
  // the figure fall simply because a brand has work in flight.
  //
  // An unpaid invoice PAST its due date does count, and counts as late: it is
  // the clearest case of not paying on time, and leaving it out would let a
  // brand hold a figure of 100% while owing money for months.
  let judged = 0
  let onTime = 0
  const now = Date.now()
  for (const inv of invoices) {
    if (!inv.due_date) continue
    // End of the due day, not its midnight: an invoice due "14 Aug" paid at
    // 6pm on the 14th was paid on time by any reasonable reading.
    const due = new Date(inv.due_date + 'T23:59:59').getTime()
    if (inv.paid_at) {
      judged++
      if (new Date(inv.paid_at).getTime() <= due) onTime++
    } else if (now > due) {
      judged++
    }
  }

  // ── Response time ─────────────────────────────────────────────────────────
  // Time from a CREATOR message to this brand's next reply on that deal. The
  // median, not the mean: one holiday turns a mean into a number that
  // describes no actual conversation.
  const byDeal = new Map<string, BrandTrackMessage[]>()
  for (const m of messages) {
    const list = byDeal.get(m.deal_id) ?? []
    list.push(m)
    byDeal.set(m.deal_id, list)
  }

  const gaps: number[] = []
  for (const list of Array.from(byDeal.values())) {
    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    let awaiting: number | null = null
    for (const m of list) {
      if (m.sender_party === 'creator') {
        // Only the FIRST creator message in a run starts the clock — a creator
        // who sends four in a row has not asked four times.
        if (awaiting === null) awaiting = new Date(m.created_at).getTime()
      } else if (awaiting !== null) {
        gaps.push(new Date(m.created_at).getTime() - awaiting)
        awaiting = null
      }
    }
  }

  let responseHours: number | null = null
  if (gaps.length > 0) {
    gaps.sort((a, b) => a - b)
    const mid = gaps.length % 2
      ? gaps[(gaps.length - 1) / 2]
      : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2
    responseHours = Math.max(1, Math.round(mid / 3_600_000))
  }

  // ── Completion ────────────────────────────────────────────────────────────
  // Of deals that were accepted, how many finished. Offers declined or still
  // under negotiation are excluded: nobody failed to complete a deal that
  // never started.
  const accepted = deals.filter((d) => ACCEPTED.has(d.status))
  const finished = accepted.filter((d) => COMPLETED.has(d.status))

  return {
    dealsCompleted: deals.filter((d) => COMPLETED.has(d.status)).length,
    onTimePaymentPct: judged > 0 ? Math.round((onTime / judged) * 100) : null,
    responseHours,
    completionPct: accepted.length > 0 ? Math.round((finished.length / accepted.length) * 100) : null,
  }
}

/** "100%", or an em-dash when there is nothing to report. */
export function formatPct(pct: number | null): string {
  return pct === null ? '—' : `${pct}%`
}
