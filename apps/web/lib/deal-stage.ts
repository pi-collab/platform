/**
 * Deal stage vocabulary, shared by the desktop table and the mobile screen.
 *
 * Extracted from CreatorDealsTable when the mobile design landed. One map, so a
 * stage added on one screen cannot silently go unlabelled on the other — the
 * same reason the notification vocabulary was pulled out of NotificationFeed.
 *
 * `label` is the desktop wording ("Agreed · in production"), which suits a wide
 * chip. `short` is the mobile design's ("In production"): same stage, and the
 * two are together here rather than in two files precisely so they cannot drift
 * into naming the same state differently.
 *
 * No `server-only`: both consumers are client components.
 */

export interface Deal {
  id: string
  deal_ref: string | null
  title: string | null
  deliverables: string | null
  price_paise: number | null
  status: string
  is_posted: boolean | null
  /** Creator has countered and the brand has not answered. Derived from the
      counter events, since deals.status cannot express whose move it is. */
  awaiting_brand?: boolean | null
  created_at: string
  brand: string | null
}

// ── Stage definitions — from design ──
export const STAGES = ['negotiating', 'agreed', 'delivered', 'awaiting', 'posted'] as const

/* `bg` is the desktop chip fill and is paired with `fg`. `chipBg` is the mobile
   design's own fill, which is a touch more saturated on four of the stages and
   is rendered with a single ink (#3A3D33) rather than a per-stage `fg`. Kept as
   a separate field rather than overwriting `bg`, because changing that would
   restyle the desktop table nobody asked me to touch. Dots are identical in
   both designs, so there is only one of those. */
export const STAGE: Record<string, { i: number; label: string; short: string; dot: string; bg: string; chipBg: string; fg: string; action: string; hot: boolean }> = {
  negotiating: { i: 0, label: 'Offer to review', short: 'Offer to review',       dot: '#4A7FB0', bg: '#EEF6FD', chipBg: '#E7F1FC', fg: '#3B6A94', action: 'Review offer', hot: true },
  agreed:      { i: 1, label: 'Agreed \u00B7 in production', short: 'In production', dot: '#7E6BC4', bg: '#F4F0FF', chipBg: '#F0EAFD', fg: '#5F519B', action: 'View deal',    hot: false },
  delivered:   { i: 2, label: 'Submitted \u00B7 in review', short: 'In review',  dot: '#4C9E82', bg: '#ECFBF5', chipBg: '#E9F7F0', fg: '#38765F', action: 'Track review', hot: false },
  revision:    { i: 2, label: 'Revision requested', short: 'Revision requested',     dot: '#C89A3C', bg: '#FFF6E4', chipBg: '#FCF6E4', fg: '#8C6417', action: 'Resubmit',     hot: true },
  awaiting:    { i: 3, label: 'Approved \u00B7 post it', short: 'Awaiting post',     dot: '#8FAF1F', bg: '#F4FBDC', chipBg: '#F4FBDC', fg: '#5C6F14', action: 'Upload post',  hot: true },
  posted:      { i: 4, label: 'Posted \u00B7 paid', short: 'Paid',          dot: '#9AA08C', bg: '#F2F3EE', chipBg: '#F2F3EE', fg: '#6B7060', action: 'View deal',    hot: false },
  /* The creator has countered and it is the BRAND's move. Shown as its own
     stage because 'negotiating' renders "Offer to review" with a "Review
     offer" action and hot:true - it puts the deal in Needs you and tells the
     creator to review an offer they have already answered. Neutral tone and
     hot:false: nothing is wrong and nothing is theirs to do. */
  /* POSTED, NOT PAID. approved + is_posted resolved to 'posted', whose label
     is "Posted, paid" - so a creator who had just published was told the deal
     was paid. Posting is not payment: the invoice comes after, and raising it
     is the creator's next move, which is why this is hot. */
  posted_unpaid: { i: 4, label: 'Posted \u00B7 awaiting payment', short: 'Awaiting payment', dot: '#C89A3C', bg: '#FFF6E4', chipBg: '#FCF6E4', fg: '#8C6417', action: 'Invoice',   hot: true },
  countered:   { i: 0, label: 'Countered \u00B7 with brand', short: 'Waiting on brand', dot: '#8B90A0', bg: '#F2F4F7', chipBg: '#EEF1F5', fg: '#5B6070', action: 'View deal',   hot: false },
  declined:    { i: -1, label: 'Declined', short: 'Declined',              dot: '#C4494F', bg: '#FDF0F0', chipBg: '#FDF0F0', fg: '#9C4147', action: 'View deal',    hot: false },
  complete:    { i: 4, label: 'Posted \u00B7 paid', short: 'Paid',          dot: '#9AA08C', bg: '#F2F3EE', chipBg: '#F2F3EE', fg: '#6B7060', action: 'View deal',    hot: false },
  paid:        { i: 4, label: 'Posted \u00B7 paid', short: 'Paid',          dot: '#9AA08C', bg: '#F2F3EE', chipBg: '#F2F3EE', fg: '#6B7060', action: 'View deal',    hot: false },
  cancelled:   { i: -1, label: 'Cancelled', short: 'Cancelled',             dot: '#8B90A0', bg: '#F2F3EE', chipBg: '#F2F3EE', fg: '#6B7060', action: 'View deal',    hot: false },
}

// ── Filter tabs — from design ──
export const TAB_DEFS: [string, string][] = [
  ['all', 'All'],
  ['action', 'Needs you'],
  ['negotiating', 'Negotiating'],
  ['agreed', 'In production'],
  ['review', 'In review'],
  ['posted', 'Posted'],
  ['declined', 'Declined'],
]

// ── Sort ──
export const SORT_OPTIONS: [string, string][] = [
  ['priority', 'Needs you first'],
  ['created', 'Newest'],
  ['oldest', 'Oldest'],
  ['price', 'Highest value'],
  ['stage', 'By stage'],
]

export const PAGE_SIZE = 12

export function formatINR(paise: number): string {
  const rupees = paise / 100
  const s = String(Math.round(rupees))
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  return '\u20B9' + (rest ? rest.replace(/\B(?=(\d\d)+(?!\d))/g, ',') + ',' + last3 : last3)
}

export function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) { const s = (rupees / 100000).toFixed(2).replace(/\.?0+$/, ''); return `\u20B9${s}L` }
  if (rupees >= 1000) return `\u20B9${(rupees / 1000).toFixed(0)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

export function createdDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* Takes only the two fields it reads, so the inbox can call it without
   inventing the rest of a Deal. A full Deal still satisfies this. */
export function resolveStatus(d: { status: string; is_posted: boolean | null; awaiting_brand?: boolean | null }): string {
  if (d.status === 'declined' || d.status === 'cancelled') return d.status
  /* Still 'negotiating' in the database - the distinction is whose move it is,
     which lives in the counter events, not in the status column. */
  if (d.status === 'negotiating' && d.awaiting_brand) return 'countered'
  /* COMPLETE AND PAID ARE TERMINAL. They used to fall into 'awaiting' when
     is_posted was not set, so fifteen finished deals sat in Needs you telling
     the creator to upload a post for a deal that had already closed. Whether
     posting was recorded is a data question, not an outstanding task - deals
     predating is_posted have it false. */
  if (d.status === 'complete' || d.status === 'paid') return 'posted'

  /* APPROVED splits on whether the content is live. Not posted: go and post.
     Posted: it is out, and the money has not arrived - the creator's next move
     is the invoice. Truthiness rather than === true, so a null reads as not
     posted instead of falling through to the raw status. */
  if (d.status === 'approved') return d.is_posted ? 'posted_unpaid' : 'awaiting'

  return d.status
}

export function needsAction(st: string): boolean {
  return STAGE[st]?.hot ?? false
}

export function isLive(st: string): boolean {
  return st !== 'posted' && st !== 'declined' && st !== 'cancelled'
}

export function matchFilter(st: string, filter: string): boolean {
  if (filter === 'all') return true
  if (filter === 'action') return needsAction(st)
  /* The review loop: submitted and waiting on the brand, or handed back. NOT
     'awaiting', which is an APPROVED deal waiting to be posted - nobody is
     reviewing it. It stays under Needs you, where the creator's next move is. */
  if (filter === 'review') return st === 'delivered' || st === 'revision'
  /* Cancelled sits with declined. It is the only other terminal-negative
     stage, and on its own it was reachable from no chip but All. */
  if (filter === 'declined') return st === 'declined' || st === 'cancelled'
  // Still a negotiation, just not the creator's turn.
  if (filter === 'negotiating') return st === 'negotiating' || st === 'countered'
  // Posted covers both, paid or not: the tab is about the content being live.
  if (filter === 'posted') return st === 'posted' || st === 'posted_unpaid'
  return st === filter
}

export function trackSteps(st: string): { bg: string }[] {
  const cur = STAGE[st]?.i ?? -1
  if (cur < 0) return [{ bg: 'linear-gradient(90deg,#E4ECF3,#E8E2F0)' }]
  return Array.from(STAGES).map((_, i) => {
    const bg = i < cur ? '#DFF29A' : i === cur ? 'var(--lime-400)' : 'linear-gradient(90deg,#E4ECF3,#E8E2F0)'
    return { bg }
  })
}

export function nameHash(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  return Math.abs(hash)
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}


// ── Empty state messages ──
export const EMPTY: Record<string, [string, string]> = {
  all: ['No deals yet', 'Deals you land with brands show up here. Discover campaigns to send your first pitch.'],
  action: ['Nothing needs you', 'Every deal is moving on its own. We will flag anything that needs you.'],
  negotiating: ['No open offers', 'When a brand sends an offer or replies to your counter, it lands here.'],
  agreed: ['Nothing in production', 'Deals move here once you and the brand lock the terms.'],
  review: ['Nothing in review', 'Submitted work, revisions and approved deals collect here.'],
  posted: ['Nothing posted yet', 'Deals whose content is live and paid will show here.'],
  declined: ['No declined deals', 'Deals that were declined will be listed here.'],
}
