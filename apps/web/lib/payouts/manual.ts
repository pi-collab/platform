import type { PayoutProvider } from './types'

/**
 * The live provider: a person pays the vendor from Guapd's account by bank or
 * UPI, then records the reference (recordManualPayment in ./service). Initiating
 * moves nothing and messages nobody.
 */
export const manualProvider: PayoutProvider = {
  name: 'manual',
  async initiate() {
    return { state: 'awaiting_manual_transfer' }
  },
}
