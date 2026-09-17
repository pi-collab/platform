'use client'

import QuestionsModal, { type QuizQuestion } from '@/components/QuestionsModal'
import { saveOnboardingAnswers } from './actions'

/**
 * The creator post-approval questions, over the creator dashboard.
 *
 * The modal itself is shared with the brand questionnaire (QuestionsModal);
 * this only maps what it collects onto the creator's answer shape.
 */
export default function WelcomeQuestions({ questions }: { questions: QuizQuestion[] }) {
  return (
    <QuestionsModal
      questions={questions}
      doneHref="/creator/dashboard"
      onSubmit={({ multi, answers, other, note }) => saveOnboardingAnswers({
        biggest_pains: multi,
        deal_handling: answers.deal_handling,
        monthly_deals: answers.monthly_deals,
        pain_other: other,
        anything_else: note,
      })}
    />
  )
}
