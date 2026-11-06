/** Plain explanations of why a brand cannot use Instagram Creator Marketplace
 *  (0590 brand_meta_eligibility). Client-safe. Shown once in context and kept
 *  in Settings; the app does not keep prompting. */
export type MetaEligibilityState = 'no_page' | 'no_instagram' | 'missing_permission' | 'not_eligible'

export const ELIGIBILITY_TEXT: Record<MetaEligibilityState, string> = {
  no_page: 'Your Facebook account has no Facebook Page. Creator Marketplace runs from a Page linked to your Instagram business account. Create or get access to one in Meta Business Suite, then try again.',
  no_instagram: 'None of your Facebook Pages is linked to an Instagram business account. Link your brand\'s Instagram to a Page in Meta Business Suite, then try again.',
  missing_permission: 'Instagram Creator Marketplace access was not allowed during the Facebook login. Try again and allow it.',
  not_eligible: 'Instagram says this account is not eligible for Creator Marketplace yet. Instagram decides which accounts can use it; Guapd cannot change that. Guapd AI still searches creators on Guapd.',
}

/** The ?meta= values the Facebook callback returns with. */
export const CONNECT_NOTICES: Record<string, string> = {
  connected: 'Instagram connected.',
  connected_first_page: 'Instagram connected, using the first Facebook Page with an Instagram business account.',
  cancelled: 'Instagram connection cancelled.',
  state_mismatch: 'That connection could not be verified. Try again.',
  failed: 'Instagram could not be connected. Try again.',
  save_failed: 'Instagram could not be connected. Try again.',
}
