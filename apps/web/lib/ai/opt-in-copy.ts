/**
 * Creator-facing words for the Guapd AI search opt-in, in one place, so the
 * creator home card, the Settings switch and any message say the same thing
 * about what brands can and cannot see. Client-safe.
 */

/** Must match what a result card actually shows (app/ai/GuapdAiClient.tsx). */
export const BRANDS_SEE = 'your name, photo, handle, city, niches, and your numbers (marked verified if your Instagram is connected)'
export const BRANDS_NEVER_SEE = 'your phone number or email'

export const OPT_IN_HOME = {
  title: 'Let brands find you with Guapd AI',
  body: 'Brands describe the creators they want, and Guapd suggests matches. You only show up if you switch this on.',
  cta: 'Switch it on',
} as const

export const OPT_IN_SWITCH = {
  label: 'Show me in Guapd AI search',
  body: 'Brands describe the creators they want, and Guapd suggests matches. When this is on, you can be suggested.',
} as const

/** The labels a brand sees on a result card when numbers are not verified.
 *  The reconnect message quotes these, so they must stay the same. */
export const CARD_NOT_VERIFIED = 'Not verified'
export const CARD_SELF_REPORTED = 'self-reported'
