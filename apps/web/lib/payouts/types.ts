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
 * A provider never sends the creator a "paid" message. That message is sent
 * only from a real success callback (RazorpayX payout.processed), and the
 * manual provider has none, so manual payouts notify nobody.
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
