/**
 * How an Experience's stage reads to the BRAND (0544). The staff vocabulary
 * (lib/experience-status) names Guapd's work ("Building roster"); the brand
 * sees where their Experience is and what is next for them. One stepper, six
 * steps, shared by the list and the Experience page.
 *
 * No `server-only`: client components render these too.
 */
import type { ChipTone } from '@/components/StatusChip'

export const BRAND_STEPS = ['Requested', 'Price agreed', 'Creators', 'Shoot', 'Deliverables', 'Complete'] as const

const STEP_OF: Record<string, number> = {
  requested: 0, rostering: 2, confirmed: 2, shoot_scheduled: 3, shoot_done: 3, delivering: 4, complete: 5,
}

export function brandStepIndex(status: string): number {
  return STEP_OF[status] ?? 0
}

export function brandStage(status: string, quoteToAnswer = false): { label: string; tone: ChipTone } {
  switch (status) {
    case 'requested':       return quoteToAnswer ? { label: 'Price ready', tone: 'blue' } : { label: 'With Guapd', tone: 'neutral' }
    case 'rostering':       return { label: 'Choosing creators', tone: 'violet' }
    case 'confirmed':       return { label: 'Creators confirmed', tone: 'lime' }
    case 'shoot_scheduled': return { label: 'Shoot scheduled', tone: 'violet' }
    case 'shoot_done':      return { label: 'Shot, in editing', tone: 'green' }
    case 'delivering':      return { label: 'Deliverables', tone: 'amber' }
    case 'complete':        return { label: 'Complete', tone: 'grey' }
    case 'cancelled':       return { label: 'Cancelled', tone: 'red' }
    default:                return { label: 'With Guapd', tone: 'neutral' }
  }
}

/** The one line under the stepper: what happens next, and who does it. */
export function brandNext(status: string, quoteToAnswer: boolean): string {
  switch (status) {
    case 'requested':       return quoteToAnswer ? 'Next: your answer on the price' : 'Next: Guapd sends you a price'
    case 'rostering':       return 'Next: accept or reject the creators Guapd suggests'
    case 'confirmed':       return 'Next: Guapd schedules the shoot'
    case 'shoot_scheduled': return 'Next: the shoot'
    case 'shoot_done':      return 'Next: Guapd edits and shares your deliverables'
    case 'delivering':      return 'Next: approve the deliverables, then sign off'
    case 'complete':        return 'Done: your report is below'
    default:                return ''
  }
}
