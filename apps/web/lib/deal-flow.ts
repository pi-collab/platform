/**
 * Deal flow driven by settings, not by a deal type.
 *
 * The engine asks these questions of a deal's snapshotted settings instead of
 * branching on "is this a shoot deal". A future variant is a new template with
 * different values; this file answers for every value the schema allows.
 *
 * Client-safe, no database access.
 */

import type { DealSettings } from '@/lib/deal-settings'

type Flow = Pick<DealSettings, 'completion_trigger' | 'deliverables_owner'>

/** Does the creator upload deliverables themselves? (Kiro: no, Guapd does.) */
export function creatorUploadsDeliverables(s: Flow): boolean {
  return s.deliverables_owner === 'creator'
}

/** Who adds deliverable items to the deal. */
export function deliverablesAddedBy(s: Flow): 'guapd' | 'creator' | 'brand' {
  return s.deliverables_owner
}

/** The event that ends the creator's work on their leg. */
export function creatorWorkEndsAt(s: Flow): 'shoot_done' | 'content_posted' | 'delivery_accepted' {
  switch (s.completion_trigger) {
    case 'on_shoot_done': return 'shoot_done'
    case 'on_content_posted': return 'content_posted'
    case 'on_delivery_accepted': return 'delivery_accepted'
  }
}

export interface LegState {
  /** Ops marked the shoot done for this Experience. */
  shootDone: boolean
  /** The leg's content is posted (deals.is_posted). */
  isPosted: boolean
  /** Deliverables accepted (deal status approved or later). */
  deliveryAccepted: boolean
}

/**
 * Has the creator done everything their leg asks of them? (Payment
 * eligibility.) Mirrors experience_leg_work_complete (0538): when the creator
 * provides the deliverables, Guapd must also have accepted them, whatever the
 * trigger says.
 */
export function isCreatorWorkComplete(s: Flow, leg: LegState): boolean {
  if (creatorUploadsDeliverables(s) && !leg.deliveryAccepted) return false
  switch (creatorWorkEndsAt(s)) {
    case 'shoot_done': return leg.shootDone
    case 'content_posted': return leg.isPosted
    case 'delivery_accepted': return leg.deliveryAccepted
  }
}

/** The creator-facing steps for their leg, in order, for the UI to render. */
export function creatorSteps(s: Flow): string[] {
  const steps = ['offer', 'agreed']
  if (s.completion_trigger === 'on_shoot_done') steps.push('shoot_scheduled', 'shoot_done')
  if (creatorUploadsDeliverables(s)) steps.push('deliver', 'review')
  if (s.completion_trigger === 'on_content_posted') steps.push('posted')
  steps.push('paid')
  return steps
}
