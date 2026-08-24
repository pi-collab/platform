
/**
 * The post-approval questionnaire: the questions themselves.
 *
 * Deliberately CLIENT-SAFE and separate from the gate in creator-onboarding.ts,
 * which is server-only. Ops renders a creator's answers in a client component,
 * and it must map codes through the SAME definitions the form and the aggregate
 * use — otherwise one of the three ends up printing `slow_payments` at somebody.
 *
 * Codes and labels live together here because two surfaces need them — the form
 * a creator fills in, and the ops aggregate that reads it back. Split across
 * two files they drift, and the first symptom is a percentage table with a row
 * labelled `undefined`.
 */

export const QUESTIONS = [
  {
    key: 'biggest_pain' as const,
    prompt: 'What’s your biggest pain with brand deals right now?',
    options: [
      { code: 'few_deals',        label: 'Not getting enough brand deals' },
      { code: 'slow_payments',    label: 'Payments are slow or unreliable' },
      { code: 'chaotic_channels', label: 'Managing deals across WhatsApp / DMs / email is chaotic' },
      { code: 'no_record',        label: 'No clear record of terms, revisions, or scope' },
      // Selecting this reveals the free-text box; the code stays stable either way.
      { code: 'other',            label: 'Something else' },
    ],
  },
  {
    key: 'deal_handling' as const,
    prompt: 'How do you currently handle brand deals?',
    options: [
      { code: 'direct',        label: 'Directly with brands (DMs, email, WhatsApp)' },
      { code: 'agency',        label: 'Through an agency or manager' },
      { code: 'mix',           label: 'A mix of both' },
      { code: 'starting_out',  label: 'I’m just getting started with brand deals' },
    ],
  },
  {
    key: 'monthly_deals' as const,
    prompt: 'How many brand deals do you do in a typical month?',
    options: [
      { code: '0_1',    label: '0–1' },
      { code: '2_4',    label: '2–4' },
      { code: '5_plus', label: '5+' },
    ],
  },
]

export type QuestionKey = (typeof QUESTIONS)[number]['key']

/** Valid codes per question, for server-side validation and for the DB CHECKs. */
export const VALID_CODES: Record<QuestionKey, string[]> = Object.fromEntries(
  QUESTIONS.map(q => [q.key, q.options.map(o => o.code)]),
) as Record<QuestionKey, string[]>

/** Code → label, for reading the aggregate back in ops. */
export function labelFor(key: QuestionKey, code: string): string {
  return QUESTIONS.find(q => q.key === key)?.options.find(o => o.code === code)?.label ?? code
}
