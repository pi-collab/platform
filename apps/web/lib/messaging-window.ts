/**
 * How long a deal's chat stays open.
 *
 * ── Why not simply "until complete" ─────────────────────────────────────────
 * That is what it did, and it closed the channel at the exact moment people
 * most need it: where is my payment, can we boost this, can I use the clip in
 * an ad. A deal reaching `complete` is a status change, not the end of the
 * conversation about it.
 *
 * ── Why not always open ─────────────────────────────────────────────────────
 * docs/roadmap.md:296 defers the persistent brand-creator inbox until payment
 * protection exists, and says to keep messaging DEAL-SCOPED until then. An
 * always-open thread on every past deal is that inbox with extra steps.
 *
 * The same note warns against building messaging restrictions AS an anti-leak
 * defence, so this is not one. The window is sized to the questions that
 * actually follow a delivery, and it ends because the deal did.
 *
 * ── The anchor is PAYMENT, not completion ───────────────────────────────────
 * `complete` can be set before money lands. Closing the channel while a creator
 * is still owed is the one outcome worth designing against, so the clock starts
 * at the later of payment and completion.
 */

const GRACE_DAYS = 30

export type MessagingState =
  | { open: true }
  | { open: false; reason: 'cancelled' | 'declined' | 'window_closed' }

export interface MessagingInputs {
  status: string
  completed_at?: string | null
  updated_at?: string | null
  /** From the deal's invoice, when there is one. */
  paid_at?: string | null
}

export function messagingState(deal: MessagingInputs, now: Date = new Date()): MessagingState {
  // No relationship formed. Leaving these open lets someone keep messaging a
  // brand that declined them, which is a spam vector rather than a feature.
  if (deal.status === 'declined') return { open: false, reason: 'declined' }
  if (deal.status === 'cancelled') return { open: false, reason: 'cancelled' }

  // Everything through delivery, approval and payment.
  if (deal.status !== 'complete' && deal.status !== 'paid') return { open: true }

  const anchor = latest([deal.paid_at, deal.completed_at, deal.updated_at])
  // No anchor at all means we cannot say the window has passed, and guessing
  // shut is the harmful direction.
  if (!anchor) return { open: true }

  const days = (now.getTime() - anchor.getTime()) / 86_400_000
  return days <= GRACE_DAYS ? { open: true } : { open: false, reason: 'window_closed' }
}

/** What to say, to whoever is looking at it. */
export function messagingClosedNotice(state: MessagingState, counterpart: string): string {
  if (state.open) return ''
  switch (state.reason) {
    case 'declined':
      return 'This offer was declined, so messaging is closed.'
    case 'cancelled':
      return 'This deal was cancelled, so messaging is closed.'
    case 'window_closed':
      return `This deal wrapped over a month ago, so messaging is closed. Start another deal with ${counterpart} to pick the conversation back up.`
  }
}

function latest(values: (string | null | undefined)[]): Date | null {
  const dates = values
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .map((v) => new Date(v))
    .filter((d) => !Number.isNaN(d.getTime()))
  if (dates.length === 0) return null
  return new Date(Math.max(...dates.map((d) => d.getTime())))
}
