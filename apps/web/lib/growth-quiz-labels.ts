/**
 * The Guapd Growth quiz, as codes and the words that stand for them.
 *
 * Client-safe: the page renders from this and the server validates against it,
 * so a question can never be shown with options the action would refuse.
 *
 * The CODES are what the database stores. Rewording an option is then a copy
 * change; changing a code is a data migration. Keeping that distinction visible
 * is the whole reason this file exists, the same split as
 * creator-onboarding-labels.
 */

export type GrowthQuestionKey =
  | 'posting_frequency'
  | 'growth_goal'
  | 'niche'
  | 'anything_else'

/** A question the creator picks an option for. */
export type GrowthChoiceKey = Exclude<GrowthQuestionKey, 'anything_else'>

export interface GrowthQuestion {
  key: GrowthQuestionKey
  prompt: string
  /**
   * 'text' is a free-text box with no options, and is never required. Only the
   * closing question uses it, matching the Deals welcome flow.
   */
  kind?: 'choice' | 'text'
  /** Sub-line under the prompt. Used by the free-text question. */
  sub?: string
  placeholder?: string
  options: { code: string; label: string }[]
  /** Reveals a free-text box when this code is chosen. */
  otherCode?: string
  otherPrompt?: string
}

export const GROWTH_QUESTIONS: GrowthQuestion[] = [
  {
    key: 'posting_frequency',
    prompt: 'How often do you post right now?',
    options: [
      { code: 'daily', label: 'Daily' },
      { code: 'few_times_week', label: 'A few times a week' },
      { code: 'weekly', label: 'Weekly' },
      { code: 'rarely', label: 'Rarely, or just starting' },
    ],
  },
  {
    key: 'growth_goal',
    prompt: 'What do you most want from Guapd Growth?',
    options: [
      { code: 'grow_following', label: 'Grow my following' },
      { code: 'first_deals', label: 'Land brand deals' },
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
  {
    // Deliberately last and optional. The three coded questions are what gets
    // aggregated; this is where a creator says the thing no option covered, and
    // it is the answer most likely to change what we build.
    key: 'anything_else',
    prompt: "Anything else you'd like us to know?",
    kind: 'text',
    sub: 'Optional, but we read every one of these.',
    placeholder: 'Anything at all',
    options: [],
  },
]

/** Valid codes for one question, which is what the server checks against. */
export function codesFor(key: GrowthChoiceKey): string[] {
  return GROWTH_QUESTIONS.find(q => q.key === key)?.options.map(o => o.code) ?? []
}

/** The words for a stored code, for ops and any later reporting. */
export function labelFor(key: GrowthChoiceKey, code: string | null | undefined): string {
  if (!code) return '-'
  return GROWTH_QUESTIONS.find(q => q.key === key)?.options.find(o => o.code === code)?.label ?? code
}
