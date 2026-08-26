/**
 * The Guapd Growth quiz, as codes and the words that stand for them.
 *
 * Client-safe: the page renders from this and the server validates against it,
 * so a question can never be shown with options the action would refuse.
 *
 * The CODES are what the database stores. Rewording an option is then a copy
 * change; changing a code is a data migration. Keeping that distinction visible
 * is the whole reason this file exists — the same split as
 * creator-onboarding-labels.
 */

export interface GrowthQuestion {
  key: 'follower_band' | 'growth_goal' | 'niche'
  prompt: string
  options: { code: string; label: string }[]
  /** Reveals a free-text box when this code is chosen. */
  otherCode?: string
  otherPrompt?: string
}

export const GROWTH_QUESTIONS: GrowthQuestion[] = [
  {
    key: 'follower_band',
    prompt: 'How big is your following right now?',
    options: [
      { code: 'under_5k', label: 'Under 5K' },
      { code: '5k_10k', label: '5K – 10K' },
      { code: '10k_20k', label: '10K – 20K' },
      { code: '20k_plus', label: '20K+' },
    ],
  },
  {
    key: 'growth_goal',
    prompt: 'What do you most want from Guapd Growth?',
    options: [
      { code: 'grow_following', label: 'Grow my following' },
      { code: 'first_deals', label: 'Land my first brand deals' },
      { code: 'learn_collabs', label: 'Learn how brand collaborations work' },
      { code: 'all', label: 'All of the above' },
    ],
  },
  {
    key: 'niche',
    prompt: "What's your main content niche?",
    options: [
      { code: 'finance', label: 'Finance / business' },
      { code: 'tech', label: 'Tech / gadgets' },
      { code: 'fashion', label: 'Fashion / beauty' },
      { code: 'fitness', label: 'Fitness / health' },
      { code: 'food', label: 'Food / lifestyle' },
      { code: 'entertainment', label: 'Entertainment / comedy' },
      { code: 'other', label: 'Other' },
    ],
    otherCode: 'other',
    otherPrompt: 'Tell us your niche',
  },
]

/** Valid codes for one question — what the server checks against. */
export function codesFor(key: GrowthQuestion['key']): string[] {
  return GROWTH_QUESTIONS.find(q => q.key === key)?.options.map(o => o.code) ?? []
}

/** The words for a stored code, for ops and any later reporting. */
export function labelFor(key: GrowthQuestion['key'], code: string | null | undefined): string {
  if (!code) return '—'
  return GROWTH_QUESTIONS.find(q => q.key === key)?.options.find(o => o.code === code)?.label ?? code
}
