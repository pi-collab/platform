/**
 * Which notification types are for GUAPD STAFF (the Experiences console), as
 * opposed to a brand's members or a creator (0546).
 *
 * The console bell shows these and only these; the brand portal's bell never
 * shows them. Notifications are per user either way (a staff alert is only ever
 * inserted for a staff user, a brand alert for that brand's members), so this
 * list separates the two surfaces for someone who is BOTH (a founder who is also
 * a brand member): brand alerts stay in the brand bell, staff alerts in the console.
 *
 * Every staff notifier writes one of these; add the type here when adding one.
 */
export const STAFF_NOTIFICATION_TYPES = [
  'experience_brand_acted',        // the brand acted on Guapd (price, roster, deliverables, sign-off)
  'experience_leg_answer',         // a creator accepted or declined their deal
  'experience_leg_countered',      // a creator countered
  'experience_leg_message_in',     // a creator wrote to Guapd
  'experience_item_submitted',     // a creator submitted a deliverable
  'experience_payout_to_approve',  // a payout needs a second person
  'experience_creator_invoiced',   // 0552: a creator confirmed the shoot and raised their invoice
  'experience_extra_answer',       // 0555: a creator answered an extra deliverables offer
  'experience_brand_message_in',   // 0550: the brand wrote in the brand thread
] as const

export function isStaffNotification(type: string): boolean {
  return (STAFF_NOTIFICATION_TYPES as readonly string[]).includes(type)
}

/** Where a staff notification opens: the creator deal on the console, else the console. */
export function staffNotificationHref(dealId: string | null, type?: string): string {
  if (dealId) return `/experiences-admin/leg/${dealId}`
  return type === 'experience_brand_message_in' ? '/experiences-admin/inbox' : '/experiences-admin'
}
