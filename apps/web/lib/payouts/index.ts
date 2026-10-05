import type { PayoutProvider, ProviderName } from './types'
import { manualProvider } from './manual'
import { razorpayxProvider } from './razorpayx'

export type { PayoutProvider, ProviderName, PayoutInstruction, InitiateResult } from './types'

/** Manual is the live path. RazorpayX is refused until it is enabled on purpose. */
export function getPayoutProvider(name: ProviderName = 'manual'): PayoutProvider {
  if (name === 'razorpayx') {
    if (process.env.RAZORPAYX_PAYOUTS_ENABLED !== 'true') throw new Error('RazorpayX payouts are not enabled')
    return razorpayxProvider
  }
  return manualProvider
}
