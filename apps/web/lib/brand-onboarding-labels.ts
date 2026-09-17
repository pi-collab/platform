/**
 * The brand questionnaire: the questions themselves.
 *
 * The demand-side twin of creator-onboarding-labels.ts, and CLIENT-SAFE for the
 * same reason: the form and the ops aggregate must map codes through the SAME
 * definitions, and the gate that decides whether to ask is server-only.
 *
 * Codes and labels live together because both surfaces need them. Split across
 * two files they drift, and the first symptom is a percentage row labelled
 * `undefined`. The codes are also the DB CHECKs in migration 0503: change one
 * here and that constraint has to change with it.
 */

export const BRAND_QUESTIONS = [
  {
    key: 'challenges' as const,
    // Multi-select: a brand that cannot find creators usually cannot measure
    // them either, and one pick throws that shape away.
    multi: true,
    prompt: 'What’s your biggest challenge with influencer marketing right now?',
    hint: 'Pick as many as apply.',
    options: [
      { code: 'finding_creators',   label: 'Finding the right creators' },
      { code: 'verifying_numbers',  label: 'Verifying if their audience and numbers are real' },
      { code: 'managing_campaigns', label: 'Managing campaigns (chaos across DMs, email, sheets)' },
      { code: 'measuring_roi',      label: 'Measuring ROI and results' },
      // Selecting this reveals the free-text box; the code stays stable either way.
      { code: 'other',              label: 'Something else' },
    ],
  },
  {
    key: 'current_approach' as const,
    prompt: 'How do you currently run influencer campaigns?',
    options: [
      { code: 'direct',   label: 'Directly with creators (DMs, email)' },
      { code: 'agency',   label: 'Through an agency' },
      { code: 'mix',      label: 'A mix of both' },
      { code: 'starting', label: 'We’re just getting started' },
    ],
  },
  {
    key: 'monthly_campaigns' as const,
    prompt: 'How many creator campaigns do you run in a typical month?',
    options: [
      { code: '0_1',     label: '0–1' },
      { code: '2_5',     label: '2–5' },
      // 6–14, not 6–15: a boundary belongs to exactly one bucket.
      { code: '6_14',    label: '6–14' },
      { code: '15_plus', label: '15+' },
    ],
  },
]

export type BrandQuestionKey = (typeof BRAND_QUESTIONS)[number]['key']

/** Valid codes per question, for server-side validation. Mirrors the DB CHECKs. */
export const BRAND_VALID_CODES: Record<BrandQuestionKey, string[]> = Object.fromEntries(
  BRAND_QUESTIONS.map(q => [q.key, q.options.map(o => o.code)]),
) as Record<BrandQuestionKey, string[]>
