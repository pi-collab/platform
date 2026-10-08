/**
 * The Experience status vocabulary: one label and one tone per status, in the
 * order an Experience moves. Rendered only through components/StatusChip, so a
 * status cannot be named or coloured two ways.
 *
 * Tones are the brand portal's existing deal-stage palette (lib/deal-stage.ts,
 * "Brand Deals"), reused rather than invented, so the ops screens read like the
 * brand portal.
 *
 * No `server-only`: client components render chips too.
 */
import type { ChipTone } from '@/components/StatusChip'

export const EXPERIENCE_STATUSES = [
  'draft', 'requested', 'rostering', 'confirmed', 'shoot_scheduled', 'shoot_done', 'delivering', 'complete', 'cancelled',
] as const
export type ExperienceStatus = (typeof EXPERIENCE_STATUSES)[number]

export const EXPERIENCE_STATUS: Record<ExperienceStatus, { label: string; tone: ChipTone; lane: 'intake' | 'in_flight' | 'done' }> = {
  draft:           { label: 'Draft',           tone: 'neutral', lane: 'intake' },
  requested:       { label: 'Request in',      tone: 'blue',    lane: 'intake' },
  rostering:       { label: 'Building roster', tone: 'violet',  lane: 'in_flight' },
  confirmed:       { label: 'Confirmed',       tone: 'lime',    lane: 'in_flight' },
  shoot_scheduled: { label: 'Shoot scheduled', tone: 'violet',  lane: 'in_flight' },
  shoot_done:      { label: 'Shoot done',      tone: 'green',   lane: 'in_flight' },
  delivering:      { label: 'Delivering',      tone: 'amber',   lane: 'in_flight' },
  complete:        { label: 'Complete',        tone: 'grey',    lane: 'done' },
  cancelled:       { label: 'Cancelled',       tone: 'red',     lane: 'done' },
}

export function experienceStatus(s: string) {
  return EXPERIENCE_STATUS[s as ExperienceStatus] ?? { label: s, tone: 'neutral' as ChipTone, lane: 'intake' as const }
}
