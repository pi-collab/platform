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

export const CHANNELS = [
  ['whatsapp', 'WhatsApp'],
  ['email', 'Email'],
  ['call', 'Call'],
  ['in_person', 'In person'],
  ['portal', 'Guapd portal'],
] as const
export type Channel = (typeof CHANNELS)[number][0]
export const channelLabel = (c: string | null) => CHANNELS.find(([k]) => k === c)?.[1] ?? c ?? ''
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
