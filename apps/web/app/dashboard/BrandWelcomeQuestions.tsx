'use client'

import QuestionsModal, { type QuizQuestion } from '@/components/QuestionsModal'
import { saveBrandOnboardingAnswers } from './onboarding-actions'

/**
 * The brand onboarding questions, over the brand dashboard.
 *
 * The same modal as the creator questionnaire; this only maps what it collects
 * onto the brand's answer shape.
 */
export default function BrandWelcomeQuestions({ questions }: { questions: QuizQuestion[] }) {
  return (
    <QuestionsModal
      questions={questions}
      doneHref="/dashboard"
      onSubmit={({ multi, answers, other, note }) => saveBrandOnboardingAnswers({
        challenges: multi,
        current_approach: answers.current_approach,
        monthly_campaigns: answers.monthly_campaigns,
        challenge_other: other,
        anything_else: note,
      })}
    />
  )
}
