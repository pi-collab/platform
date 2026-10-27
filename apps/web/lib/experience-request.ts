/**
 * Shared vocabulary for an Experience request and its quotes: deliverable
 * types, the channels a brand reaches us through, and rupee parsing. Used by
 * the staff console now and the brand-facing view later.
 *
 * No `server-only`: client forms use these too.
 */

export const DELIVERABLE_TYPES = ['UGC video', 'Reel', 'Story', 'Static post', 'Photo set'] as const
/** The types priced per video. Others are in the plan and its totals but not
    in the per-video count (they belong in a quote's extras). Same list as
    experience_plan_count() in migration 0531. */
export const VIDEO_TYPES: readonly string[] = ['UGC video', 'Reel']
export const isVideoType = (t: string) => VIDEO_TYPES.includes(t)

/** How a brand told STAFF something, recorded on the brand's behalf. 'portal'
    is not here: it means the brand did it themselves on Guapd (0544), and only
    the brand's own functions write it; every staff function refuses it. */
export const CHANNELS = [
  ['whatsapp', 'WhatsApp'],
  ['email', 'Email'],
  ['call', 'Call'],
  ['in_person', 'In person'],
] as const
export type Channel = (typeof CHANNELS)[number][0]
export const channelLabel = (c: string | null) => c === 'portal' ? 'Guapd, by the brand' : CHANNELS.find(([k]) => k === c)?.[1] ?? c ?? ''
export const isChannel = (c: unknown): c is Channel => CHANNELS.some(([k]) => k === c)

/** "3,500" or "3500.50" rupees → whole paise, in integers (no float maths). Null if not a valid amount. */
export function rupeesToPaise(raw: string | null | undefined): number | null {
  const v = String(raw ?? '').replace(/[,\s₹]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null
  const [r, p = ''] = v.split('.')
  const paise = Number(r) * 100 + Number((p + '00').slice(0, 2))
  return Number.isSafeInteger(paise) ? paise : null
}

export function formatRupees(paise: number | null | undefined): string {
  if (paise == null) return '—'
  const r = Math.floor(paise / 100), p = paise % 100
  return `₹${r.toLocaleString('en-IN')}${p ? '.' + String(p).padStart(2, '0') : ''}`
}

import type { ChipTone } from '@/components/StatusChip'

/** Quote statuses, rendered through StatusChip like every other status. */
export const QUOTE_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  open:       { label: 'Open',     tone: 'blue' },
  superseded: { label: 'Replaced', tone: 'grey' },
  accepted:   { label: 'Accepted', tone: 'lime' },
  rejected:   { label: 'Declined', tone: 'red' },
  withdrawn:  { label: 'Withdrawn', tone: 'grey' },
}

/** "1 UGC video", "20 UGC videos", "10 Stories". */
export function countOf(n: number, type: string): string {
  if (n === 1) return `1 ${type}`
  return `${n} ${type.endsWith('y') && !/[aeiou]y$/i.test(type) ? type.slice(0, -1) + 'ies' : type + 's'}`
}

// ── 0579: payment stages on one invoice ──
/** When a stage falls due. The order is fixed: acceptance, then the shoot, then sign-off. */
export const STAGE_MOMENTS = [
  ['accepted', 'On acceptance'],
  ['shoot_done', 'After the shoot'],
  ['signoff', 'After sign-off'],
] as const
export type StageMoment = (typeof STAGE_MOMENTS)[number][0]
export const stageMomentLabel = (m: string) => STAGE_MOMENTS.find(([k]) => k === m)?.[1] ?? m
/** One stage as the quote stores it. An empty schedule means the whole amount is due on acceptance. */
export interface PaymentStage { label: string; pct: number; on: StageMoment }
/** One stage as an issued invoice reports it (experience_invoice_stages). */
export interface InvoiceStage extends PaymentStage { amount_paise: number; reached: boolean; state: 'paid' | 'checking' | 'due' | 'upcoming' }
export interface InvoiceStages { scheduled: boolean; due_now_paise: number; balance_paise: number; next_stage: string | null; stages: InvoiceStage[] }
/** Quick picks for the quote composer. */
export const STAGE_PRESETS: { name: string; stages: PaymentStage[] }[] = [
  { name: 'Pay in full', stages: [] },
  { name: '50 / 50', stages: [{ label: 'Advance', pct: 50, on: 'accepted' }, { label: 'Final', pct: 50, on: 'signoff' }] },
  { name: '70 / 10 / 20', stages: [{ label: 'Advance', pct: 70, on: 'accepted' }, { label: 'Shoot', pct: 10, on: 'shoot_done' }, { label: 'Final', pct: 20, on: 'signoff' }] },
]
/**
 * Each stage's rupee amount for a total, the way the database works it out:
 * cumulative, rounded to the paisa, the last stage taking the remainder.
 * For previews only; the invoice figures always come from the database.
 */
export function stageAmounts(totalPaise: number, stages: { pct: number }[]): number[] {
  let cumPct = 0, prev = 0
  return stages.map((s, i) => {
    cumPct += s.pct
    const cum = i === stages.length - 1 ? totalPaise : Math.round((totalPaise * cumPct) / 100)
    const amt = cum - prev
    prev = cum
    return amt
  })
}
/** The same rules as experience_schedule_valid; returns the problem, or null when it is fine. */
export function scheduleProblem(stages: { label: string; pct: number; on: string }[]): string | null {
  if (stages.length === 0) return null
  if (stages.length < 2 || stages.length > 6) return 'Use 2 to 6 stages, or pay in full.'
  let rank = 0, sum = 0
  for (const s of stages) {
    const l = s.label.trim()
    if (l.length < 2 || l.length > 40) return 'Name each stage (2 to 40 characters).'
    if (!Number.isFinite(s.pct) || s.pct <= 0 || s.pct >= 100 || Math.round(s.pct * 100) !== s.pct * 100) return 'Each stage needs a % above 0, with at most two decimals.'
    const r = STAGE_MOMENTS.findIndex(([k]) => k === s.on) + 1
    if (r === 0) return 'Pick when each stage is due.'
    if (r < rank) return 'Put the stages in order: acceptance, then the shoot, then sign-off.'
    rank = r
    sum += s.pct
  }
  return Math.round(sum * 100) === 10000 ? null : `The stages add up to ${Math.round(sum * 100) / 100}%, not 100%.`
}
