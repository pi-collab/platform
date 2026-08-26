'use client'

import { useState } from 'react'
import { GROWTH_QUESTIONS } from '@/lib/growth-quiz-labels'
import { saveGrowthQuiz } from './actions'
import './growth.css'

/**
 * Guapd Growth: the holding page, and the quiz that runs once.
 *
 * Growth is a POSITIVE outcome and the copy has to carry that on its own —
 * a creator arriving here was not rejected, and nothing on this page should
 * read as consolation. There is no appeal box, because there is no decision to
 * appeal.
 *
 * The quiz reuses the welcome-questions shape: one question per screen, a
 * sticky action on a phone, and a progress bar — so it reads as the same
 * product a creator has already been through rather than a form bolted on.
 */
export default function GrowthHome({ firstName, quizDone }: {
  firstName: string
  quizDone: boolean
}) {
  const [done, setDone] = useState(quizDone)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const q = GROWTH_QUESTIONS[step]
  const chosen = answers[q?.key ?? '']
  const isLast = step === GROWTH_QUESTIONS.length - 1
  const canAdvance = Boolean(chosen)

  async function next() {
    if (!isLast) { setStep(step + 1); return }
    setBusy(true); setError('')
    const res = await saveGrowthQuiz({
      followerBand: answers.follower_band,
      growthGoal: answers.growth_goal,
      niche: answers.niche,
      nicheOther: other,
    })
    setBusy(false)
    if (!res.ok) { setError(res.message); return }
    setDone(true)
  }

  return (
    <main className="gr-page">
      <div className="gr-shell">
        <span className="gr-badge">Guapd Growth</span>

        <h1 className="gr-title">
          You&rsquo;re in Guapd Growth, {firstName}
        </h1>

        <p className="gr-lede">
          We&rsquo;re building tools to help you grow your following and land brand deals &mdash; coming soon.
        </p>

        {done ? (
          <div className="gr-card gr-card--done">
            <div className="gr-check" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <div>
              <p className="gr-done-title">Thanks &mdash; that&rsquo;s all we need for now.</p>
              <p className="gr-done-body">
                Your answers shape what we build first. We&rsquo;ll let you know the moment there&rsquo;s
                something for you here.
              </p>
            </div>
          </div>
        ) : (
          <div className="gr-card">
            <div className="gr-progress">
              <div className="gr-progress__bar">
                <div
                  className="gr-progress__fill"
                  style={{ width: `${Math.round(((step + 1) / GROWTH_QUESTIONS.length) * 100)}%` }}
                />
              </div>
              <span className="gr-progress__label">
                {step + 1} of {GROWTH_QUESTIONS.length}
              </span>
            </div>

            <h2 className="gr-ask">{q.prompt}</h2>

            <div className="gr-options">
              {q.options.map(o => (
                <button
                  key={o.code}
                  type="button"
                  className="gr-option"
                  aria-pressed={chosen === o.code}
                  onClick={() => setAnswers(a => ({ ...a, [q.key]: o.code }))}
                >
                  <span className="gr-mark" aria-hidden="true">
                    {chosen === o.code && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    )}
                  </span>
                  <span className="gr-option__label">{o.label}</span>
                </button>
              ))}
            </div>

            {q.otherCode && chosen === q.otherCode && (
              <div className="gr-follow">
                <label className="gr-follow__label" htmlFor="gr-other">
                  {q.otherPrompt} <span className="gr-optional">(optional)</span>
                </label>
                <input
                  id="gr-other"
                  className="gr-input"
                  value={other}
                  maxLength={120}
                  onChange={e => setOther(e.target.value)}
                  placeholder="e.g. Travel, parenting, gaming"
                />
              </div>
            )}

            {error && <p className="gr-error" role="alert">{error}</p>}

            <div className="gr-actions">
              {step > 0 && (
                <button type="button" className="gr-back" onClick={() => setStep(step - 1)} disabled={busy}>
                  Back
                </button>
              )}
              <button
                type="button"
                className="gr-next"
                onClick={next}
                disabled={!canAdvance || busy}
              >
                {busy ? 'Saving…' : isLast ? 'Finish' : 'Continue'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
