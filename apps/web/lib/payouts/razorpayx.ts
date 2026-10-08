import type { PayoutProvider } from './types'

/**
 * NOT ACTIVE. Placeholder so the interface is real before the integration is.
 *
 * When RazorpayX is live (account + KYC, RAZORPAYX_* keys, a contact and fund
 * account per vendor, a webhook route), this calls the Payouts API with the
 * idempotency key, returns { state: 'processing', providerRef }, and the
 * payout.processed webhook — not this function — marks the payout paid,
 * stores the UTR, and sends the creator the paid message. The manual provider
 * stays as the fallback. See docs/experiences-plan.md.
 */
export const razorpayxProvider: PayoutProvider = {
  name: 'razorpayx',
  async initiate() {
    throw new Error('RazorpayX payouts are not enabled. Use the manual provider.')
  },
}
