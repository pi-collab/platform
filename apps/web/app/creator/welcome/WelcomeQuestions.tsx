'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { saveOnboardingAnswers } from './actions'
import './welcome.css'

interface Option { code: string; label: string }
interface Question { key: string; prompt: string; options: Option[] }

/**
 * The three questions, asked once, between approval and the dashboard.
 *
 * Definitions arrive as a prop rather than being imported: the source is
 * `lib/creator-onboarding.ts`, which is server-only because it also reads the
 * gate. Passing them down keeps one list feeding both this form and the ops
 * aggregate that reads the answers back.
 */
export default function WelcomeQuestions({ questions }: { questions: Question[] }) {
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [painOther, setPainOther] = useState('')
  const [anythingElse, setAnythingElse] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const answeredAll = questions.every(q => answers[q.key])
  const showPainOther = answers.biggest_pain === 'other'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !answeredAll) return
    setBusy(true)
    setError('')

    const res = await saveOnboardingAnswers({
      biggest_pain: answers.biggest_pain,
      deal_handling: answers.deal_handling,
      monthly_deals: answers.monthly_deals,
      pain_other: painOther,
      anything_else: anythingElse,
    })

    if (!res.ok) {
      setBusy(false)
      setError(res.message)
      return
    }

    // Stays busy — the page navigates away and unmounts this form.
    router.push('/creator/dashboard')
    router.refresh()
  }

  return (
    <form className="onboard-card wq-card" onSubmit={submit}>
      <p className="wq-intro">
        You&rsquo;re in! 🎉 A few quick questions so we can make Guapd work better for you.
      </p>

      {questions.map(q => (
        <div className="wq-group" key={q.key}>
          <span className="wq-prompt" id={`q-${q.key}`}>{q.prompt}</span>

          <div className="wq-options" role="group" aria-labelledby={`q-${q.key}`}>
            {q.options.map(o => {
              const on = answers[q.key] === o.code
              return (
                <button
                  key={o.code}
                  type="button"
                  className="wq-option"
                  aria-pressed={on}
                  onClick={() => { setAnswers(a => ({ ...a, [q.key]: o.code })); setError('') }}
                >
                  <span className="wq-mark" aria-hidden="true">
                    {on && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--lime-950, #161B08)"
                           strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  {o.label}
                </button>
              )
            })}
          </div>

          {/* Only under the question it belongs to, and only once "Something
              else" is chosen — an always-visible box invites an answer to a
              question nobody asked. */}
          {q.key === 'biggest_pain' && showPainOther && (
            <textarea
              className="wq-textarea"
              value={painOther}
              onChange={e => setPainOther(e.target.value)}
              placeholder="Tell us a little more (optional)"
              maxLength={500}
              rows={2}
              aria-label="Tell us more about your biggest pain"
            />
          )}
        </div>
      ))}

      <div className="wq-group">
        <span className="wq-prompt">
          Anything else you&rsquo;d like us to know? <span className="onboard-label__optional">optional</span>
        </span>
        <textarea
          className="wq-textarea"
          value={anythingElse}
          onChange={e => setAnythingElse(e.target.value)}
          placeholder="Anything at all — we read these."
          maxLength={500}
          rows={2}
        />
      </div>

      {error && <p role="alert" className="wq-error">{error}</p>}

      <button type="submit" className="onboard-cta wq-cta" disabled={!answeredAll || busy}>
        {busy ? 'Saving…' : 'Continue to dashboard'}
      </button>

      {!answeredAll && (
        <p className="wq-hint">Answer the three questions above to continue.</p>
      )}
    </form>
  )
}
