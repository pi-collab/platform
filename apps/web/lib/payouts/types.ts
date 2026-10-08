/**
 * Paying vendors (creators, crew) from Guapd's OWN funds.
 *
 * Guapd is the principal on an Experience: the brand pays Guapd (a service
 * invoice), and Guapd pays its vendors. A provider moves Guapd's money to one
 * vendor; it never touches a brand's money and never splits anything.
 *
 * Providers:
 *   manual     LIVE. Ops transfers by bank/UPI outside the app and records the
 *              reference (UTR). The app only records what a person did.
 *   razorpayx  STUB until RazorpayX is set up and verified (docs/experiences-plan.md).
 *
 * A provider never sends the creator a "paid" message itself. Under the manual
 * provider the app tells the creator when a person RECORDS a real transfer
 * with its bank reference and proof (experience_console_payout_paid, 0540),
 * and the message says exactly that ("Guapd paid you ₹X · ref …"). Under
 * RazorpayX it will fire only from the payout-success callback.
 *
 * The payout lifecycle itself (request → approve by a different person →
 * record paid) lives in access-checked database functions (0540), called with
 * the staff member's own session: the Phase 2 service-role payout service was
 * retired.
 */

export type ProviderName = 'manual' | 'razorpayx'

export interface PayoutInstruction {
  payoutId: string
  vendorId: string
  /** What actually leaves Guapd's account: net of TDS. Integer paise. */
  netAmountPaise: number
  idempotencyKey: string
  reason: string
}

export type InitiateResult =
  /** Nothing moved yet: a person must make the transfer and record its reference. */
  | { state: 'awaiting_manual_transfer' }
  /** The provider accepted it; the outcome arrives by callback. */
  | { state: 'processing'; providerRef: string }
  | { state: 'failed'; reason: string }

export interface PayoutProvider {
  readonly name: ProviderName
  /** Start moving money for an APPROVED payout. Must be idempotent on idempotencyKey. */
  initiate(p: PayoutInstruction): Promise<InitiateResult>
}
