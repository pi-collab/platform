import 'server-only'

/**
 * A creator's track record, computed rather than asserted.
 *
 * The dashboard has been printing "On-time 100% · Response ~4h · Completion
 * 100%" as literal strings with nothing behind them. These are the figures a
 * creator is most likely to screenshot for a brand, so they have to be real or
 * absent — never plausible.
 *
 * Every one returns null when there is no basis for it. A percentage over zero
 * deals is not 100%, it is nothing, and rounding an empty set up to a flattering
 * number is exactly the failure this replaces.
 */

export interface TrackRecord {
  /** % of delivered-on-time deals. Null when no completed deal had a due date. */
  onTimePct: number | null
  /** Typical hours from a brand's message to the creator's reply. Null when
   *  they have never replied to anything. */
  responseHours: number | null
  /** % of accepted deals that reached completion. Null when none were accepted. */
  completionPct: number | null
}

export interface TrackDeal {
  id: string
  status: string
  timeline_date: string | null
}

export interface TrackItem {
  deal_id: string
  submitted_at: string | null
}

export interface TrackMessage {
  deal_id: string
  sender_party: string
  created_at: string
}

const COMPLETED = new Set(['complete', 'paid', 'approved'])
/** Reached agreement at some point, so completion was actually possible. */
const ACCEPTED = new Set(['agreed', 'delivered', 'revision', 'approved', 'paid', 'complete', 'cancelled'])

export function computeTrackRecord(
  deals: TrackDeal[],
  items: TrackItem[],
  messages: TrackMessage[],
): TrackRecord {
  // ── On time ──────────────────────────────────────────────────────────────
  // The LAST submission is what counts. A creator who submitted early, was sent
  // back for a revision and returned it late did not deliver on time, and
  // taking the first submission would say they did.
  const lastSubmission = new Map<string, number>()
  for (const it of items) {
    if (!it.submitted_at) continue
    const t = new Date(it.submitted_at).getTime()
    const cur = lastSubmission.get(it.deal_id)
    if (cur === undefined || t > cur) lastSubmission.set(it.deal_id, t)
  }

  let dueCount = 0
  let onTime = 0
  for (const d of deals) {
    if (!d.timeline_date) continue
    const submitted = lastSubmission.get(d.id)
    if (submitted === undefined) continue
    dueCount++
    // End of the due day, not its midnight: a deal due "14 Aug" submitted at
    // 6pm on the 14th was delivered on time by any reasonable reading.
    const due = new Date(d.timeline_date + 'T23:59:59').getTime()
    if (submitted <= due) onTime++
  }

  // ── Response time ────────────────────────────────────────────────────────
  // Time from a brand message to the creator's NEXT message on that deal. The
  // median, not the mean: one holiday turns a mean into a number that describes
  // no actual conversation.
  const byDeal = new Map<string, TrackMessage[]>()
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
      if (m.sender_party === 'brand') {
        // Only the FIRST brand message in a run starts the clock — a brand that
        // sends four in a row has not asked four times.
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

  // ── Completion ───────────────────────────────────────────────────────────
  // Of deals that were accepted, how many finished. Offers declined or still
  // under negotiation are excluded: nobody failed to complete a deal that never
  // started.
  const accepted = deals.filter((d) => ACCEPTED.has(d.status))
  const finished = accepted.filter((d) => COMPLETED.has(d.status))

  return {
    onTimePct: dueCount > 0 ? Math.round((onTime / dueCount) * 100) : null,
    responseHours,
    completionPct: accepted.length > 0 ? Math.round((finished.length / accepted.length) * 100) : null,
  }
}

/** "~4h", "~2d" — the export's shape, at a scale that stays readable. */
export function formatResponse(hours: number | null): string {
  if (hours === null) return '—'
  if (hours < 24) return `~${hours}h`
  return `~${Math.round(hours / 24)}d`
}
