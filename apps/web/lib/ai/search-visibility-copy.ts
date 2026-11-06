/**
 * Creator-facing words for Guapd AI search visibility, in one place, so the
 * creator home notice, the Settings switch and the switch-off confirmation say
 * the same thing. Client-safe.
 *
 * Accurate as of 0588: hiding removes a creator from Guapd AI search results
 * ONLY. They stay on /browse (list and name search), their profile and
 * storefront link still work, and offers, existing deals and messages are
 * unaffected. The copy says exactly that and nothing more.
 */

/** Must match what a result card actually shows (app/ai/GuapdAiClient.tsx). */
/** Exactly what /browse and a Guapd AI card show. City and languages help
 *  matching but are not shown. */
export const BRANDS_SEE = 'your name, photo, handle, niches, bio, and your follower count (marked verified if your Instagram is connected)'
export const BRANDS_NEVER_SEE = 'your phone number or email'

export const SEARCH_SWITCH = {
  label: 'Show me in Guapd AI search',
  /** The one line under the switch. */
  hint: 'Brands use Guapd AI search to find creators for their briefs. Keep this on to be suggested.',
} as const

/** Under the optional city / state / languages / niches fields. */
export const FIELDS_HINT = 'Used to match you to the right briefs. Brands see your niches; your city and languages are used for matching only.'

/** The "Your visibility" card on the creator home. */
export const VISIBILITY_CARD = {
  hidden: "You're hidden from search.",
  hiddenLink: 'Turn it on to get found',
  zeroTip: 'Not shown in any search yet this week. Add your city and niches so Guapd can match you to more briefs.',
  zeroLink: 'Complete your profile',
  footnote: 'Each brand counts once a day. We never show which brands searched or what they asked for.',
} as const

/** Shown before the switch turns off. "Keep me visible" is the default. */
export const SWITCH_OFF_CONFIRM = {
  title: 'Hide you from Guapd AI search?',
  body: 'If you turn this off, you won\'t be suggested when brands search for creators with Guapd AI, so you may get fewer offers. Brands can still find you on Browse and open your profile, and your current deals carry on. You can turn it back on anytime.',
  keep: 'Keep me visible',
  off: 'Turn off',
} as const

/** The one-time notice on the creator home. */
export const SEARCH_NOTICE = {
  title: 'Brands can now find you through Guapd AI search',
  body: 'When a brand describes the creators they want, Guapd can suggest you.',
  settings: 'You can turn this off in Settings, under Connected accounts.',
  cta: 'Open Settings',
} as const

/** The labels a brand sees on a result card when numbers are not verified.
 *  The reconnect message quotes these, so they must stay the same. */
export const CARD_NOT_VERIFIED = 'Not verified'
export const CARD_SELF_REPORTED = 'self-reported'
